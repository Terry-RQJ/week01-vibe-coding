-- db/schema.sql — 「法律小科普轻站」数据模型（Day 16）
-- 依据：api-contract.md §1（内容侧接口的响应形状，不另造一套）
-- 方言：PostgreSQL（与 CloudBase 环境实际数据库一致，云端 `tcb db execute` 直接执行）
-- 可重复执行：DROP IF EXISTS 先删后建。
--
-- 两张表的关系（今日掌握点）：
--   cards（情形卡，1）──< laws（法条，N）
--   关联字段：laws.card_slug = cards.slug（外键，级联删除）
--   cards 存「一张卡自己的内容」；laws 存「这张卡引用的法条原文」，
--   一张卡可引多条法条 → 拆两张表避免法条原文在每张卡里重复、无法单独维护。
--
-- 分类不建表：6 个分类是固定常量（见 api-contract.md §1.3），
-- count 由 cards.category_id 聚合得出，避免冗余与不一致。

DROP TABLE IF EXISTS news;   -- Day 37：news 有外键指向 cards，必须先删（注意：重跑 schema 会清空新闻数据，含已上线条目）
DROP TABLE IF EXISTS laws;
DROP TABLE IF EXISTS cards;

-- ── 表 1：cards 情形卡（对应 GET /api/cards 与 /api/cards/:slug） ──
CREATE TABLE cards (
    slug             VARCHAR(64)  PRIMARY KEY,              -- 卡片唯一标识，URL 路径用（如 gongsi-quantui），VARCHAR(64) 因它要进 URL，定长上限防脏数据
    title            VARCHAR(128) NOT NULL,                -- 标题（列表页卡片标题），人起的标题，128 上限足够
    summary          TEXT         NOT NULL,                -- 一句话摘要（列表页卡片正文），长度不定用 TEXT
    category         VARCHAR(32)  NOT NULL,                -- 分类中文名（如「劳动类」，冗余存储避免接口联表）
    category_id      VARCHAR(16)  NOT NULL,                -- 分类 id（labor/consume/...），筛选用短标识
    tags             JSONB        NOT NULL DEFAULT '[]',   -- 标签数组；JSONB 支持索引和包含查询
    scenario         TEXT         NOT NULL,                -- 情景描述（详情页）
    solution_steps   JSONB        NOT NULL DEFAULT '[]',   -- 应对步骤数组（详情页步骤列表，保序）
    related_slugs    JSONB        NOT NULL DEFAULT '[]',   -- 相关卡 slug 数组（V1 未启用，占位）
    published_at     DATE         NOT NULL,                -- 发布日期，DATE 精确到日（无时分秒需求）
    updated_at       DATE         NOT NULL,                -- 内容更新日期
    last_verified_at DATE         NOT NULL,                -- 法条最近复核日期（AGENTS §2-8 强制要求）
    author_type      VARCHAR(32)  NOT NULL DEFAULT 'AI 起草 + 律师复核', -- 内容来源标注
    reviewed_by      VARCHAR(64)  NOT NULL,                -- 复核人
    status           VARCHAR(16)  NOT NULL DEFAULT 'published'
                     CHECK (status IN ('draft', 'published', 'offline'))  -- 接口只返回 published
);

CREATE INDEX idx_cards_category ON cards(category_id, status);  -- 分类筛选查询（GET /api/cards?category=）

-- ── 表 2：laws 法条（对应 /api/cards/:slug 响应里的 laws[] 数组） ──
CREATE TABLE laws (
    id          BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,  -- 法条行 id（自增，仅作主键）
    card_slug   VARCHAR(64)  NOT NULL REFERENCES cards(slug) ON DELETE CASCADE, -- 关联字段 → cards.slug，卡删则法条随之删
    name        VARCHAR(128) NOT NULL,                     -- 法条名称（如「《劳动合同法》第 36 条」）
    text        TEXT         NOT NULL,                     -- 法条原文（长文本，TEXT）
    source_url  VARCHAR(255),                              -- 官方来源链接（flk.npc.gov.cn），可空：极少数无法条链接
    sort_order  INTEGER      NOT NULL DEFAULT 0            -- 详情页展示顺序（保序输出）
);

CREATE INDEX idx_laws_card ON laws(card_slug);             -- 按卡取法条（GET /api/cards/:slug）

-- ── Day 17 追加：读接口通道授权 ──
-- 云函数走 HTTP API exec-pgsql（默认只读角色）查表；该角色名随环境实例名变化，
-- 部署新环境时先查 pg_roles 里 LIKE 'cloudbase_read_only_user%' 的实际角色名再 GRANT。
GRANT SELECT ON cards, laws TO cloudbase_read_only_user_postgres_ebc42q2s;

-- ── Day 18 追加：用户收藏表（POST /api/favorites 写入）──
-- 防重复靠 UNIQUE(client_id, card_slug)：重复提交触发 23505，接口转 409
-- client_id：V1 无登录态，匿名标识（body 可传，默认 'anon'）；将来接登录换成用户 id
CREATE TABLE IF NOT EXISTS favorites (
    id BIGSERIAL PRIMARY KEY,
    client_id VARCHAR(64) NOT NULL DEFAULT 'anon',
    card_slug VARCHAR(64) NOT NULL REFERENCES cards(slug) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (client_id, card_slug)
);
CREATE INDEX IF NOT EXISTS idx_favorites_client ON favorites(client_id);
GRANT SELECT ON favorites TO cloudbase_read_only_user_postgres_ebc42q2s;

-- ── Day 22 追加：favorites 补两个字段，支撑 PATCH 修改 + 软删除 ──
-- note       ：用户自己的备注（PATCH /api/favorites/:id 唯一可改字段，≤200 字）
-- is_deleted ：软删除标记（DELETE 只置 true，不真删行；查询一律 WHERE is_deleted = false）
--              为什么删除比新增更容易出事：新增错了顶多多一条，删除错了数据没了。
--              软删除 = 在数据层加的「第二道确认」，删错了能找回（加练项）。
ALTER TABLE favorites ADD COLUMN IF NOT EXISTS note VARCHAR(200) NOT NULL DEFAULT '';
ALTER TABLE favorites ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false;

-- 唯一约束要带上 is_deleted：软删除后再收藏同一张卡不应被 UNIQUE 拦。
-- 原 UNIQUE(client_id, card_slug) 会让「删了再收」撞 23505，故改为部分唯一索引：
-- 只对未删除的行生效（PostgreSQL 部分索引，软删除的标准配套写法）。
ALTER TABLE favorites DROP CONSTRAINT IF EXISTS favorites_client_id_card_slug_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_favorites_active
    ON favorites(client_id, card_slug) WHERE is_deleted = false;

-- 列表查询走 (client_id, is_deleted)，建个复合索引
CREATE INDEX IF NOT EXISTS idx_favorites_client_deleted ON favorites(client_id, is_deleted);

-- ── Day 37 追加：法律热点新闻表（GET /api/news）──
-- 设计（与用户对齐）：AI 每天抓官方权威源生成「候选」（status='candidate'），
-- 用户在本地维护页 admin-news.html（gitignore，不进仓库不进托管）逐条确认，
-- 确认后置为 published，线上接口只返回 published —— 未确认的候选访客看不见。
-- related_card_slug 挂站内情境卡（可为空：不是每条新闻都有关联卡）。
CREATE TABLE IF NOT EXISTS news (
    id                BIGSERIAL PRIMARY KEY,
    news_date         DATE         NOT NULL,                -- 新闻所属日期（展示用，按它倒序）
    title             VARCHAR(255) NOT NULL,                -- 标题
    summary           TEXT         NOT NULL,                -- 一两句话摘要
    source_name       VARCHAR(128) NOT NULL,                -- 来源名（如「中国普法网」）
    source_url        VARCHAR(512),                         -- 原文链接，可空
    related_card_slug VARCHAR(64)  REFERENCES cards(slug) ON DELETE SET NULL, -- 关联情境卡，卡删则置空
    status            VARCHAR(16)  NOT NULL DEFAULT 'candidate'
                      CHECK (status IN ('candidate', 'published', 'offline')),
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
    published_at      TIMESTAMPTZ                               -- 确认上线时间（可空=还没上线）
);
CREATE INDEX IF NOT EXISTS idx_news_status_date ON news(status, news_date DESC);
GRANT SELECT ON news TO cloudbase_read_only_user_postgres_ebc42q2s;

-- ── Day 44 追加：热点自动化 ──
-- takeaway：面向普通人的「这跟你有啥关系」解读（2–3 句，AI 撰写 + 规则校验，不写结论性法律意见）
-- 唯一索引：(news_date, title) 去重——每天自动抓取同一篇新闻多次时只留一条
ALTER TABLE news ADD COLUMN IF NOT EXISTS takeaway TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_news_title_date ON news(news_date, title);

-- news_runs：每日抓取台账（哪天抓了、抓到几条、入库几条、成功与否）。
-- 有了它，前端「今天更新于」和「昨天没抓到」能被如实说清，而不是假装一直在跑。
CREATE TABLE IF NOT EXISTS news_runs (
    id         BIGSERIAL PRIMARY KEY,
    run_date   DATE        NOT NULL,                -- 抓取所属日期
    source     VARCHAR(64),                        -- 抓取渠道（maxsearch / manual）
    found      INTEGER     NOT NULL DEFAULT 0,     -- 抓到几条
    added      INTEGER     NOT NULL DEFAULT 0,     -- 新入库几条
    status     VARCHAR(16) NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'partial', 'failed')),
    note       TEXT,                               -- 失败原因或备注
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_news_runs_date ON news_runs(run_date DESC);
GRANT SELECT ON news_runs TO cloudbase_read_only_user_postgres_ebc42q2s;

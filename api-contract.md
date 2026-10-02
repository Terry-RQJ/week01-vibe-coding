# API 接口契约 · 「法律小科普轻站」

> Day 15 占位文档。第 3 周建表与写接口的**唯一依据**，今天只登记形状，不连数据库。
>
> 依据：`PRD.md §8`、`TECH_DESIGN.md v3.0`（已升级到 v4.0，待 §8.3 重审）、`index.html` / `card.html` / `bookmarks.html` / `history.html` 当前真实渲染所需的全部数据。

---

## 0. 通用约定

| 项 | 约定 |
|---|---|
| Base URL（已上线） | `https://rqj-2006-d0gl1ael531a243a1-1497985433.ap-shanghai.app.tcloudbase.com/api`（CloudBase HTTP 网关 → 云函数） |
| 内容类型 | `application/json; charset=utf-8` |
| 鉴权（V1） | 无（V1 只读公开内容） |
| 错误返回 | `{ "ok": false, "error": { "code": "STRING", "message": "USER_READABLE_CN" } }`，HTTP 状态码同步语义（400/404/500） |
| 响应统一形状 | 成功 `{ ok: true, data, meta? }`；失败 `{ ok: false, error: { code, message } }`（Day 17 起统一加 `ok` 字段） |
| CORS | 云函数不设 CORS 头，由 HTTP 网关按请求 Origin 自动回 `Access-Control-Allow-Origin`（Day 17 实测：函数自设 `*` 会被网关拼成 `origin,*` 双值导致浏览器拒绝，切勿自设） |
| JSON 显示 | 网关固定回 `content-disposition: attachment`，浏览器地址栏直开 API 地址时 Edge 仍直接显示 JSON 文本（实测），不影响前端 fetch |
| 字段命名 | 全 camelCase，时间统一 ISO 8601（`2026-09-29T14:30:00.000Z`） |
| 分页 | V1 不分页（卡片总数 6–12 张，全量返回） |
| 搜索/筛选 | 走 query 参数；空 keyword 等同于全量 |

---

## 1. 必上：内容侧接口（卡片与分类）

> 第 2 周的 `data/cards.js` 是静态常量；改 CloudBase 后这部分要走 API。

### 1.1 `GET /api/cards` ✅ 已实现（Day 17）

**用途**：首页卡片网格（替代 `Store.listCards()`）。

**Query 参数**：

| Name | Type | Required | 说明 |
|---|---|---|---|
| `category` | string | 否 | 分类 id（`labor` / `consume` / `loan` / `marriage` / `traffic` / `neighbor`），不传 = 全量 |
| `keyword` | string | 否 | 关键词，匹配范围：标题 / 摘要 / 情景 / 标签 / 应对步骤 / 法条名称+原文。空字符串 = 全量 |
| `limit` | int | 否 | 返回条数上限（Day 17 加练，1–50，默认 12） |

**响应 200**（实际返回）：

```json
{
  "ok": true,
  "data": [
    {
      "slug": "gongsi-quantui",
      "title": "公司劝退我，该怎么办？",
      "summary": "公司谈辞退时只提 N，没有 +1，该不该签？",
      "category": "劳动类",
      "categoryId": "labor",
      "tags": ["辞退", "经济补偿"],
      "published_at": "2026-09-22",
      "last_verified_at": "2026-09-22"
    }
  ],
  "meta": { "total": 6, "limit": 12 }
}
```

**错误 400**：`category` / `limit` 非法 → `{ "ok": false, "error": { "code": "INVALID_PARAM", "message": "category 不在允许范围" } }`

### 1.2 `GET /api/cards?slug=<slug>` ✅ 已实现（Day 17）

**用途**：详情页（替代 `Store.getCard()`）。

> ⚠️ 形态变更：契约原设计是路径参数 `/api/cards/:slug`，但 CloudBase HTTP 网关
> 只按 `gatewayPath` 精确路由（`/api/cards/xxx` 会被归一成 `/api/cards`，子路径丢失），
> **V1 落地为查询参数形态**；函数内部同时兼容路径形态，将来网关支持子路径可无感切回。

**Query 参数**：`slug`（string，required）

**响应 200**：

```json
{
  "ok": true,
  "data": {
    "slug": "gongsi-quantui",
    "title": "公司劝退我，该怎么办？",
    "summary": "公司谈辞退时只提 N，没有 +1，该不该签？",
    "category": "劳动类",
    "categoryId": "labor",
    "scenario": "在公司做了 3 年，最近 HR 找你谈……",
    "solution_steps": [
      "先确认谈话性质：协商解除 vs 单方辞退"
    ],
    "laws": [
      { "name": "《劳动合同法》第 47 条", "text": "经济补偿按劳动者在本单位工作的年限……", "source_url": "https://flk.npc.gov.cn/..." }
    ],
    "published_at": "2026-09-22",
    "last_verified_at": "2026-09-22",
    "author_type": "AI 起草 + 律师复核",
    "reviewed_by": "待复核（mock）"
  }
}
```

**错误 404**：`slug` 不存在 → `{ "ok": false, "error": { "code": "CARD_NOT_FOUND", "message": "找不到这个情形" } }`

### 1.3 `GET /api/categories` ✅ 已实现（Day 17）

**用途**：首页分类筛选 chip（替代 `Store.listCategories()`）。

**响应 200**：

```json
{
  "ok": true,
  "data": [
    { "id": "labor",    "name": "劳动类",     "count": 1 },
    { "id": "consume",  "name": "消费类",     "count": 1 },
    { "id": "loan",     "name": "借贷类",     "count": 1 },
    { "id": "marriage", "name": "婚姻家庭类", "count": 1 },
    { "id": "traffic",  "name": "交通类",     "count": 1 },
    { "id": "neighbor", "name": "邻里 / 名誉类", "count": 1 }
  ]
}
```

> 实现：6 个分类是固定常量，`LEFT JOIN (SELECT category_id, count(*) ... GROUP BY)` 保证 count=0 的分类也在列、顺序稳定。

### 1.4 `GET /api/health`

**用途**：部署冒烟测试（Day 15 第一目标）。

**响应 200**：

```json
{
  "ok": true,
  "service": "law-mini-site",
  "version": "v1",
  "time": "2026-09-29T14:30:00.000Z"
}
```

**错误**：本接口不允许返回非 200，异常一律 500（不要吞错）。

---

## 2. 可选：用户数据接口（收藏 + 浏览记录）

> ⚠️ **Day 5 定稿 §8.3 明确「不上云」**。今天路线由 A 改为 B 后，§8.3 需要重审；Day 22–28 V2 计划里再决定要不要保留 localStorage。

### 2A 方案（保守 · 维持 §8.3）

不开放任何接口，收藏/浏览继续走 localStorage。**今天不实现**。

### 2B 方案（升级 · §8.3 重审通过后）

#### 2B.1 `GET /api/favorites`

**用途**：收藏页（替代 `Store.getCardsBySlugs()` + localStorage）。

**Query 参数**：无（V1 全量返回当前用户全部收藏）

**响应 200**：

```json
{
  "data": [
    { "slug": "gongsi-quantui", "favorited_at": "2026-09-28T11:00:00.000Z" },
    { "slug": "guoqi-shipin",   "favorited_at": "2026-09-28T13:20:00.000Z" }
  ]
}
```

#### 2B.2 `POST /api/favorites`

**用途**：收藏 / 取消收藏（替代 `Store.toggleBookmark()`）。

**Body**：

```json
{ "slug": "gongsi-quantui", "on": true }
```

**响应 200**：`{ "data": { "slug": "gongsi-quantui", "on": true } }`

**错误 404**：slug 不存在 → `{ "error": { "code": "CARD_NOT_FOUND", "message": "..." } }`

#### 2B.3 `DELETE /api/favorites/:slug`

**用途**：取消收藏（与 POST 等价，但 RESTful）。

**响应 200**：`{ "data": { "slug": "...", "on": false } }`

#### 2B.4 `GET /api/history`

**用途**：浏览记录页（替代 `Store.getHistory()`）。

**Query 参数**：`limit`（int，可选，默认 50，上限 50）

**响应 200**：

```json
{
  "data": [
    { "slug": "guoqi-shipin",       "viewed_at": "2026-09-29T11:00:00.000Z" },
    { "slug": "dianche-pengzhuang", "viewed_at": "2026-09-29T10:30:00.000Z" }
  ]
}
```

#### 2B.5 `POST /api/history`

**用途**：浏览详情时自动记录（替代 `Store.addHistory()`）。

**Body**：`{ "slug": "..." }`

**响应 200**：`{ "data": { "ok": true } }`

---

## 3. 占位清单（Day 16–20 待实现）

| 接口 | 状态 | 依赖 |
|---|---|---|
| `GET /api/health` | ✅ Day 15 部署 | 无 |
| `GET /api/cards` | ✅ Day 17 已实现 | 表 `cards` + `laws`（Day 16 已建，见 §6） |
| `GET /api/cards?slug=`（原 `:slug`） | ✅ Day 17 已实现 | 同上 |
| `GET /api/categories` | ✅ Day 17 已实现 | 表 `cards`（count 由 `category_id` 聚合） |
| `GET /api/favorites` | Day 18（仅 §8.3 改后） | 收藏表 `favorites`（未建） |
| `POST /api/favorites` | Day 18 | 同上 |
| `DELETE /api/favorites/:slug` | Day 18 | 同上 |
| `GET /api/history` | Day 18 | 历史表 `history`（未建） |
| `POST /api/history` | Day 18 | 同上 |

---

## 6. 数据模型（Day 16 建表，与本文档互为依据）

> 落库：CloudBase 环境的 **PostgreSQL 17**（环境建库时选了 PG 模式）。
> 脚本：`db/schema.sql`（建表，可重复执行）、`db/seed.sql`（清空+种子，可重复执行）。
> 执行/验证方式：`python db/exec.py schema|seed|verify`（内部走 `tcb db execute`），
> 或控制台数据库页直接粘贴 SQL。

### 6.1 两张表与关联（今日掌握点）

| 表 | 存什么 | 主键 |
|---|---|---|
| `cards` | 情形卡自身的内容：标题/摘要/分类/情景/应对步骤/发布与复核信息 | `slug`（VARCHAR(64)） |
| `laws` | 卡片引用的法条原文：名称/条文/官方链接/展示顺序 | `id`（自增 BIGINT） |

- **关联字段：`laws.card_slug` = `cards.slug`**（外键，`ON DELETE CASCADE`——删卡连带删它的法条）
- 一张卡引用 N 条法条（1:N）；拆表的原因：法条原文独立维护、不在每张卡里重复，多条卡可引同一条法律的不同条文
- **分类不建表**：6 个分类是固定常量（§1.3），`count` 由 `cards.category_id` 聚合得出（`GROUP BY`），避免冗余和不一致

### 6.2 cards 字段 ↔ 契约字段对照

| 列 | 类型 | 来源/用途 |
|---|---|---|
| `slug` | VARCHAR(64) PK | §1.1/§1.2 的 `slug`，也是 URL 路径参数 |
| `title` / `summary` | VARCHAR(128) / TEXT | §1.1 列表页字段 |
| `category` / `category_id` | VARCHAR(32)/(16) | §1.1 的 `category`（中文名，冗余免联表）/ 筛选用 id |
| `tags` / `solution_steps` / `related_slugs` | JSONB | §1.2 的数组字段（JSONB 支持包含查询） |
| `scenario` | TEXT | §1.2 详情页情景 |
| `published_at` / `updated_at` / `last_verified_at` | DATE | §1.1/§1.2 的时间字段；`last_verified_at` 为 AGENTS §2-8 强制 |
| `author_type` / `reviewed_by` | VARCHAR(32)/(64) | §1.2 的来源标注与复核人 |
| `status` | VARCHAR(16) + CHECK | `draft/published/offline`，接口只返回 `published` |

（`laws`：`id` / `card_slug`(FK) / `name` / `text` / `source_url` / `sort_order`，对应 §1.2 响应的 `laws[]` 数组元素。）

### 6.3 种子数据与验证（Day 16 实测）

- 种子：`data/cards.js` 的 6 张卡 → `cards` 6 行；11 条法条 → `laws` 11 行
- `seed.sql` 用 `TRUNCATE ... RESTART IDENTITY CASCADE` 先清再插，重复执行不报错、结果一致（已连跑 2 遍验证）
- select 验证（云端真实执行）：每表 ≥5 行 ✅、`JOIN` 关联每卡法条数（1–3 条/卡）✅、`GROUP BY category_id` 聚合 = §1.3 的 count ✅、外键与 CHECK 约束拦截非法插入 ✅

---

## 4. 跨域（CORS）

静态托管域（`*.tcloudbaseapp.com`）与 API 网关域（`*.ap-shanghai.app.tcloudbase.com`）不同源，浏览器 fetch 必须有 CORS 头。**Day 17 实测结论**：HTTP 网关按请求 Origin 自动回 `Access-Control-Allow-Origin`（单值，正确）——但前提是**云函数自己不要设这个头**，否则网关把 Origin 和函数值拼成 `origin,*` 双值，浏览器直接拒绝（`Failed to fetch`）。Day 19 前端域名迁移时如遇问题再回来调网关 OPA/白名单。

---

## 5. 变更日志

- 2026-09-29 · Day 15：路线 A→B 重审后新增本文档；§1 内容接口上线；§2 用户数据两套方案待勾选。
- 2026-10-02 · Day 16：新增 §6 数据模型——`cards` + `laws` 两张表已建入 CloudBase PostgreSQL（`db/schema.sql` + `db/seed.sql` 可重复执行，种子 6+11 行）；§3 占位清单更新依赖状态。
- 2026-10-02 · Day 17：§1.1/§1.2/§1.3 三个读接口**部署并通过真库验证**（响应统一加 `ok` 字段；§1.2 因网关不支持子路径改为 `?slug=` 查询参数形态）；新增 `limit` 参数（加练）；§0 补 CORS 实测结论。数据通道：云函数 → `POST {envId}.api.tcloudbasegateway.com/v1/rdb/exec-pgsql`（参数化 SQL `$1/$2/$3`，默认只读角色；API Key 存函数环境变量 `CB_API_KEY`，不进仓库）。前端 `js/store.js` 内容读切到真 API、失败回落静态 mock（页面代码零改动）。
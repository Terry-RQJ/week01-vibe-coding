/**
 * cardsRepository.js — cards 表的数据访问层（Day 19 拆出）
 * 唯一职责：封装对 cards 表的全部 SQL。入口层只调函数，不写 SQL。
 * 所有 SQL 参数化（$1/$2/$3），禁止字符串拼接用户输入。
 */
'use strict';

const { execPg } = require('./db');

/** 列表与计数共用的 WHERE（$1 分类 / $2 关键词，全参数化）
 *  keyword 匹配范围（契约 §1.1）：标题/摘要/情景/标签/应对步骤/法条名称+原文 */
function buildWhere() {
  return [
    "status = 'published'",
    "($1::text IS NULL OR category_id = $1)",
    "($2::text IS NULL OR title ILIKE '%' || $2 || '%' OR summary ILIKE '%' || $2 || '%' " +
      "OR scenario ILIKE '%' || $2 || '%' OR tags::text ILIKE '%' || $2 || '%' " +
      "OR solution_steps::text ILIKE '%' || $2 || '%' " +
      "OR EXISTS (SELECT 1 FROM laws l WHERE l.card_slug = cards.slug " +
      "AND (l.name ILIKE '%' || $2 || '%' OR l.text ILIKE '%' || $2 || '%')))"
  ].join(' AND ');
}

/** 精确检索的排序档位（Day 31 新增）：按「关键词命中的字段含金量」分档，越小越靠前。
 *  标题 > 标签 > 摘要/情景 > 应对步骤 > 仅法条原文。
 *
 *  为什么需要它：精确检索原来只按 `published_at DESC` 排，完全不看相关度。
 *  实测搜「借条」，排第一的是「赌债、赌球输的钱，法律管不管？」——
 *  那张卡只是正文里提了一嘴「借条」，却因为发布最新压过了标题就叫「借条」的三张卡。
 *  精确检索是搜索的主路径，这个缺陷比近似检索的假命中更影响体感。
 *
 *  无关键词时（列表/分类页）CASE 恒为 0，退化为原来的 published_at DESC，行为不变。 */
const RANK_EXPR =
  'CASE ' +
  '  WHEN $2::text IS NULL THEN 0 ' +
  "  WHEN title ILIKE '%' || $2 || '%' THEN 1 " +
  "  WHEN tags::text ILIKE '%' || $2 || '%' THEN 2 " +
  "  WHEN summary ILIKE '%' || $2 || '%' OR scenario ILIKE '%' || $2 || '%' THEN 3 " +
  "  WHEN solution_steps::text ILIKE '%' || $2 || '%' THEN 4 " +
  '  ELSE 5 ' +
  'END';

/**
 * 关键词切片（Day 29 新增）：整串打头，再接所有相邻的 2 字片段，去重。
 *   例「公司不给加班费」→ [公司不给加班费, 公司, 司不, 不给, 给加, 加班, 班费]
 *
 * 存在的理由：纯子串匹配对「长句提问」太苛刻——用户敲一整句话，
 * 全站没有一个字段含这句话，结果就是 0 条，看着像搜索坏了。
 * 切成 2 字片段后，「加班」「班费」能把「加班费」那张卡捞回来。
 * 整串放第一位是为了让精确命中排在近似结果前面（排序权重见 listApprox）。
 */
function keywordFragments(keyword) {
  const kw = String(keyword || '').trim();
  if (!kw) return [];
  const out = [kw];
  const chars = Array.from(kw).filter(function (c) { return !/\s/.test(c); });
  for (let i = 0; i + 1 < chars.length; i++) {
    const frag = chars[i] + chars[i + 1];
    if (out.indexOf(frag) === -1) out.push(frag);
  }
  return out;
}

/** 通用片段表（Day 31 新增）：这些 2 字片段几乎出现在每一张卡的摘要里，
 *  对「讲的是什么事」零信息量，不能让它们帮无关卡片凑够召回门槛。
 *  例：搜「公司不给加班费怎么办」，若把「怎么」「么办」计入，
 *  任何一张提到「公司」的卡都能凑够 4 个片段命中而被召回。
 *
 *  ⚠️ 维护纪律：这份列表在 js/store.js 里有一份完全相同的副本（前端离线检索用）。
 *     改任一边都必须同步改另一边，否则「断网」时搜索结果会和线上不一致。 */
const STOP_FRAGS = [
  // 疑问与求助的通用尾巴
  '怎么', '么办', '么赔', '么算', '么处', '么维', '么要', '么证', '么分', '么追',
  '如何', '什么', '么时', '是否', '可否', '能否', '何办',
  // 情态与能力
  '可以', '能不', '不能', '该不', '该怎', '会不', '会不会',
  // 咨询开场白
  '请问', '请教', '咨询', '想问', '问问', '我想', '帮我',
  // 时间与时态（不指向具体场景）
  '现在', '目前', '已经', '以后', '之后', '最近', '一直',
  // 泛指量词与指代
  '一下', '这种', '这样', '那样', '那个', '这个'
];

/**
 * 近似检索的第一步（Day 31）：把关键词切成片段，去掉通用片段。
 *
 * 为什么需要门槛：2 字片段匹配太松——搜「搬家公司」，卡片只要含「公司」二字
 * 就会被捞回来，实测一次召回 24 张全是裁员的话题。用户体验上，
 * 「搜出一屏不相干的东西」比「诚实地说没找到」更糟（空态推荐已在 Day 30 做好）。
 *
 * 这里只做「去停用词」。真正的门槛在 SQL 里按 live 片段数算（见 listApprox），
 * 因为那需要先统计每个片段的文档频率。
 *
 * @param {string} keyword
 * @returns {string[]|null} 去停用后的片段数组；null 表示不值得做近似检索
 */
function relevancePlan(keyword) {
  const frags = keywordFragments(keyword).filter(function (f) {
    return STOP_FRAGS.indexOf(f) === -1;
  });
  // 剩 0~1 个片段：关键词只有 2 字（整串一个片段），或全是「怎么办」这类通用词。
  // 没有「近似」的余地——2 字词本来就该走精确检索，全通用词则交给空态推荐。
  return frags.length < 2 ? null : frags;
}


/**
 * 已发布卡片列表。
 * @param {object} p { category, keyword, limit } — 调用方已完成校验
 * @returns {Promise<{rows: Array, total: number}>}
 */
async function listPublished(p) {
  const where = buildWhere();
  const params = [p.category || null, p.keyword || null, p.limit];
  const rows = await execPg(
    "SELECT slug, title, summary, category, category_id AS \"categoryId\", tags, " +
      "to_char(published_at, 'YYYY-MM-DD') AS published_at, " +
      "to_char(last_verified_at, 'YYYY-MM-DD') AS last_verified_at " +
      'FROM cards WHERE ' + where +
      // Day 31：先按命中字段的含金量分档，再按发布日期（档位说明见 RANK_EXPR）
      ' ORDER BY ' + RANK_EXPR + ', published_at DESC, slug LIMIT $3',
    params
  );
  const counts = await execPg(
    'SELECT count(*) AS n FROM cards WHERE ' + where,
    [p.category || null, p.keyword || null]
  );
  return { rows: rows || [], total: counts && counts[0] ? Number(counts[0].n) : 0 };
}

/**
 * 近似检索（Day 29 新增 / Day 31 重写排序与门槛）：精确搜不到时的兜底。
 *
 * 与 listPublished 的差别：不要求整串命中，而是切成 2 字片段后按「有效片段覆盖率」召回。
 * 只在精确检索返回 0 条时调用（入口层决定），所以不会干扰正常搜索结果。
 *
 * Day 31 修掉的两个问题（用 docs/day31-search-relevance-probe.py 量化）：
 *   ① 假命中：原写法 `m.hits > 0`，只要蹭到一个通用片段就召回。
 *      搜「搬家公司」返回 24 张裁员卡、「装修合同」返回 50 张——因为都含「公司」「合同」。
 *      现在按 relevancePlan() 算出门槛 minHits，命中数不够的直接淘汰，走空态推荐。
 *   ② 排序无区分度：原 ORDER BY 里的 weight 是命中片段的 char_length 之和，
 *      而除整串外所有片段都是 2 字，weight 恒等于 hits × 2，等于没排。
 *      现在改成字段加权：标题 10 / 标签 6 / 情景摘要 3 / 步骤与法条 1。
 *
 * 字段权重的理由：法条原文里「公司」「合同」这类词到处都是，权重最低；
 * 标题是人工写的问题原话，权重最高；tags 是 Day 30 起兼作「口语别名」的人工标注，次之。
 *
 * @param {object} p { category, keyword, limit }
 * @returns {Promise<{rows: Array, total: number}>} total 即本次返回条数（已受 limit 约束）
 */
async function listApprox(p) {
  const plan = relevancePlan(p.keyword);
  if (!plan) return { rows: [], total: 0 };

  // 先在 src 里把五个字段区的文本一次算好，避免同一个 laws 子查询在 LATERAL 里被重复求值。
  // src 同时按 status / category 过滤，LATERAL 只在剩下的行上跑。
  //
  // hay_core 刻意**不含法条**：门槛只认卡片自己写的内容。
  // 实测：搜「装修合同」时，有 3 张卡靠消保法条文里的「装饰装修」凑够门槛被召回，
  // 但它们讲的是三包、瑕疵举证，跟装修毫无关系。法条是通用法律文本，不代表这张卡的主题，
  // 它只参与排序且权重最低（law_hits × 1）。
  // 安全性：精确检索（listPublished 的 buildWhere）仍包含法条全文，
  // 所以「照着法条原文搜」不受影响，只有近似兜底这一层收紧了。
  // 三个 CTE 依次是：
  //   src  —— 候选卡片 + 五个字段区的文本（预先算好，避免 laws 子查询在 LATERAL 里重复求值）
  //   df   —— 每个片段的文档频率（命中多少张卡）。停用片段已在 JS 侧滤掉，这里不用再判
  //   live —— df > 0 的片段，即「内容库里真实存在的证据」
  //
  // 门槛为什么只按 live 算，而不是按全部片段算：
  // 中文长句切出的 2 字片段里，有一大半是跨词粘连出来的伪片段——
  // 「楼上老是吵我睡不着」里的「上老」「是吵」「我睡」「不着」在内容库里根本不存在（DF=0）。
  // 它们永远匹配不上，却会把门槛的分母撑大：按全部 9 个片段算要凑够 3 个，
  // 而噪音卡只有「楼上」「睡不」2 个能命中 → 真实的口语提问反而搜不到。
  // 只按 live 算，这句话的门槛就是 2，噪音卡刚好够。
  //
  // 门槛公式：live ≤ 2 时取 2，否则取 ceil(live × 0.5)。
  //   · live < 2（只剩 1 个内容库存在的片段）→ 直接不召回。
  //     例：「搬家公司」只有「公司」DF>0，而「搬家」内容库没有 → 判为无此场景，走空态推荐。
  //     这正是消灭假命中的主力：靠单个通用词凑数的卡片无法过线。
  //   · live = 2 → 两个证据都要命中，才够得上「相关」。
  //   · live ≥ 3 → 长句里伪片段多，按比例放宽到一半。
  const rows = await execPg(
    'WITH src AS (' +
      '  SELECT c.slug, c.title, c.summary, c.category, c.category_id, c.tags, ' +
      '         c.published_at, c.last_verified_at, ' +
      "         (' ' || c.title || ' ' || c.summary || ' ' || c.scenario || ' ' || " +
      "          c.category || ' ' || c.tags::text || ' ' || c.solution_steps::text) AS hay_core, " +
      '         c.title AS f_title, ' +
      '         c.tags::text AS f_tags, ' +
      "         (c.summary || ' ' || c.scenario) AS f_body, " +
      '         c.solution_steps::text AS f_steps, ' +
      "         COALESCE((SELECT string_agg(l.name || ' ' || l.text, ' ') " +
      '                   FROM laws l WHERE l.card_slug = c.slug), \'\') AS f_laws ' +
      "  FROM cards c WHERE c.status = 'published' " +
      '  AND ($2::text IS NULL OR c.category_id = $2)' +
      '), df AS (' +
      '  SELECT f, count(*) AS n FROM src s, unnest($1::text[]) AS f ' +
      "  WHERE s.hay_core ILIKE '%' || f || '%' GROUP BY f" +
      '), live AS (SELECT f FROM df WHERE n > 0) ' +
      'SELECT s.slug, s.title, s.summary, s.category, s.category_id AS "categoryId", s.tags, ' +
      "  to_char(s.published_at, 'YYYY-MM-DD') AS published_at, " +
      "  to_char(s.last_verified_at, 'YYYY-MM-DD') AS last_verified_at " +
      'FROM src s CROSS JOIN LATERAL (' +
      '  SELECT ' +
      "    count(*) FILTER (WHERE s.hay_core ILIKE '%' || v.f || '%') AS hits, " +
      "    count(*) FILTER (WHERE s.f_title ILIKE '%' || v.f || '%') AS title_hits, " +
      "    count(*) FILTER (WHERE s.f_tags ILIKE '%' || v.f || '%') AS tags_hits, " +
      "    count(*) FILTER (WHERE s.f_body ILIKE '%' || v.f || '%') AS body_hits, " +
      "    count(*) FILTER (WHERE s.f_steps ILIKE '%' || v.f || '%') AS steps_hits, " +
      "    count(*) FILTER (WHERE s.f_laws ILIKE '%' || v.f || '%') AS law_hits " +
      '  FROM live v' +
      ') m ' +
      'CROSS JOIN (SELECT count(*) AS n FROM live) lc ' +
      'WHERE lc.n >= 2 ' +
      '  AND m.hits >= CASE WHEN lc.n <= 2 THEN 2 ELSE ceil(lc.n * 0.5) END ' +
      'ORDER BY (m.title_hits * 10 + m.tags_hits * 6 + m.body_hits * 3 + ' +
      '          m.steps_hits * 2 + m.law_hits) DESC, ' +
      '         m.hits DESC, s.published_at DESC, s.slug ' +
      'LIMIT $3',
    [plan, p.category || null, p.limit]
  );
  return { rows: rows || [], total: rows ? rows.length : 0 };
}

/**
 * 按 slug 取已发布卡片详情（不含 laws，laws 走 lawsRepository）。
 * @returns {Promise<Object|null>} 找不到返回 null（404 判断留给入口层）
 */
async function getPublishedBySlug(slug) {
  const rows = await execPg(
    'SELECT slug, title, summary, category, category_id AS "categoryId", tags, scenario, ' +
      'solution_steps, related_slugs, ' +
      "to_char(published_at, 'YYYY-MM-DD') AS published_at, " +
      "to_char(updated_at, 'YYYY-MM-DD') AS updated_at, " +
      "to_char(last_verified_at, 'YYYY-MM-DD') AS last_verified_at, " +
      'author_type, reviewed_by ' +
      'FROM cards WHERE slug = $1 AND status = $2',
    [slug, 'published']
  );
  return rows && rows.length ? rows[0] : null;
}

module.exports = {
  listPublished,
  listApprox,
  getPublishedBySlug,
  keywordFragments,
  relevancePlan,
  STOP_FRAGS
};

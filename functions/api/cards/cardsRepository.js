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

/** 全部可搜字段拼成一段文本（含关联法条的条名与原文）。
 *  近似匹配要逐片段 ILIKE，用一整段文本只需写一次条件，
 *  不必把 6 个字段 × N 个片段摊成几十个 OR。 */
const HAYSTACK =
  "(' ' || c.title || ' ' || c.summary || ' ' || c.scenario || ' ' || " +
  "c.tags::text || ' ' || c.solution_steps::text || ' ' || " +
  "COALESCE((SELECT string_agg(l.name || ' ' || l.text, ' ') " +
  "FROM laws l WHERE l.card_slug = c.slug), ''))";


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
      'FROM cards WHERE ' + where + ' ORDER BY published_at DESC, slug LIMIT $3',
    params
  );
  const counts = await execPg(
    'SELECT count(*) AS n FROM cards WHERE ' + where,
    [p.category || null, p.keyword || null]
  );
  return { rows: rows || [], total: counts && counts[0] ? Number(counts[0].n) : 0 };
}

/**
 * 近似检索（Day 29 新增）：精确搜不到时的兜底。
 *
 * 与 listPublished 的差别：不再要求整串命中，而是「任一 2 字片段命中即召回」，
 * 再按相关度排序——命中片段的总字符数（weight）越多越靠前，
 * 于是「公司不给加班费」里同时命中「加班」「班费」的卡片会排在只命中「公司」的前面。
 *
 * 只在精确检索返回 0 条时调用（入口层决定），所以不会干扰正常搜索结果。
 *
 * @param {object} p { category, keyword, limit }
 * @returns {Promise<{rows: Array, total: number}>} total 即本次返回条数（已受 limit 约束）
 */
async function listApprox(p) {
  const frags = keywordFragments(p.keyword);
  // 切片只有一个元素 = 关键词本身（长度 1 或 2），没有「近似」的余地
  if (frags.length <= 1) return { rows: [], total: 0 };
  const rows = await execPg(
    'SELECT c.slug, c.title, c.summary, c.category, c.category_id AS "categoryId", c.tags, ' +
      "to_char(c.published_at, 'YYYY-MM-DD') AS published_at, " +
      "to_char(c.last_verified_at, 'YYYY-MM-DD') AS last_verified_at " +
      'FROM cards c CROSS JOIN LATERAL (' +
      '  SELECT count(*) AS hits, COALESCE(sum(char_length(f)), 0) AS weight, ' +
      "         count(*) FILTER (WHERE c.title ILIKE '%' || f || '%') AS title_hits " +
      '  FROM unnest($1::text[]) AS f WHERE ' + HAYSTACK + " ILIKE '%' || f || '%'" +
      ') m ' +
      "WHERE c.status = 'published' AND m.hits > 0 " +
      'AND ($2::text IS NULL OR c.category_id = $2) ' +
      // 相关度三档（实测调出来的顺序）：
      //   ① title_hits —— 标题命中的片段数。「公司不给加班费」若不看这一档，
      //      会因发布时间新而把「不签劳动合同」排在「加班费」前面。
      //   ② weight —— 命中片段的总字符数，长片段更具体。
      //   ③ hits —— 命中片段个数。
      'ORDER BY m.title_hits DESC, m.weight DESC, m.hits DESC, ' +
      'c.published_at DESC, c.slug LIMIT $3',
    [frags, p.category || null, p.limit]
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

module.exports = { listPublished, listApprox, getPublishedBySlug, keywordFragments };

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

module.exports = { listPublished, getPublishedBySlug };

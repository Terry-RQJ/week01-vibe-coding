/**
 * lawsRepository.js —— 「法条速查」的数据访问层（Day 30 新增）
 *
 * 设计要点：**以法条为主体、不是在卡片上挂法条**。
 * `laws` 表里同一条法条会被多张卡引用（例如消保法第 24 条被 6 张消费卡引用）。
 * 若按引用行平铺，速查页会出现 6 个一模一样的条文块——所以这里用 GROUP BY l.name
 * 把同一条法条聚成一行，再把引用它的卡片聚成 cards 数组，前端渲染成
 * 「出自情形 A、B、C」。搜索结果因此「一条法条只出现一次」。
 *
 * 排序：先按法律名分组，再按条号数字升序（条号在 name 里是阿拉伯数字，可安全取整），
 * 最后用 name 兜底保证稳定。这样浏览《民法典》时是第 10 条 → 第 100 条 → 第 1179 条
 * 的自然顺序，而不是字符串顺序。
 */
'use strict';

const { execPg } = require('./db');

/** 法律名提取：从 name 形如《民法典》第 714 条 里剥出「民法典」 */
const LAW_NAME_SQL = "regexp_replace(l.name, '^《([^》]+)》.*$', '\\1')";
/** 条号数值：name 里的第一段阿拉伯数字；无数字则 NULL（排最后） */
const LAW_NO_SQL = "NULLIF(substring(l.name from '[0-9]+'), '')::int";

/**
 * 查询法条（已按法条聚合）
 *
 * keyword 的检索范围**不限于法条原文**：同时命中关联卡片的 title/summary/scenario/tags。
 * 原因：普通人搜的是口语词（押金、退钱、扰民），而这些词往往只写在卡片里，
 * 法条原文用的是「租赁合同」「定金」「噪声」这类法言法语。只搜条文原文时，
 * 「押金」会 0 结果——对用户就是「搜不出来」。扩到卡片字段后，
 * 关键词先命中卡片、再顺着卡片把法条带出来，和首页搜索的行为也保持一致。
 *
 * @param {{keyword:string|null, law:string|null, category:string|null, limit:number}} p
 * @returns {Promise<Array>} [{ name, text, source_url, cards:[{slug,title,category,categoryId}] }]
 */
async function listLaws(p) {
  const rows = await execPg(
    'SELECT l.name AS "name", ' +
      '       max(l.text) AS "text", ' +
      '       max(l.source_url) AS "source_url", ' +
      '       jsonb_agg(DISTINCT jsonb_build_object(' +
      "         'slug', c.slug, 'title', c.title," +
      "         'category', c.category, 'categoryId', c.category_id)) AS \"cards\" " +
      'FROM laws l JOIN cards c ON c.slug = l.card_slug ' +
      "WHERE c.status = 'published' " +
      "  AND ($1::text IS NULL" +
      "       OR l.name ILIKE '%' || $1 || '%'" +
      "       OR l.text ILIKE '%' || $1 || '%'" +
      "       OR c.title ILIKE '%' || $1 || '%'" +
      "       OR c.summary ILIKE '%' || $1 || '%'" +
      "       OR c.scenario ILIKE '%' || $1 || '%'" +
      "       OR c.tags::text ILIKE '%' || $1 || '%') " +
      "  AND ($2::text IS NULL OR l.name ILIKE '%《' || $2 || '》%') " +
      '  AND ($3::text IS NULL OR c.category_id = $3) ' +
      'GROUP BY l.name ' +
      'ORDER BY ' + LAW_NAME_SQL + ', ' + LAW_NO_SQL + ', l.name ' +
      'LIMIT $4',
    [p.keyword || null, p.law || null, p.category || null, p.limit]
  );
  return rows || [];
}

/**
 * 法律名清单（筛选器用）：每个法律名下去重后的**法条数**。
 * 用 count(DISTINCT l.name) 而非引用行数，否则「消保法 20 条」会把重复引用也算进去。
 * @returns {Promise<Array>} [{ name, count }]
 */
async function listLawNames() {
  const rows = await execPg(
    'SELECT ' + LAW_NAME_SQL + ' AS name, ' +
      '       count(DISTINCT l.name)::int AS count ' +
      'FROM laws l JOIN cards c ON c.slug = l.card_slug ' +
      "WHERE c.status = 'published' " +
      'GROUP BY 1 ORDER BY count DESC, name'
  );
  return rows || [];
}

module.exports = { listLaws, listLawNames };

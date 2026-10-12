/**
 * lawsRepository.js — laws 表的数据访问层（Day 19 拆出）
 * 唯一职责：封装对 laws 表的全部 SQL。所有 SQL 参数化（$1/$2），禁止拼接用户输入。
 */
'use strict';

const { execPg } = require('./db');

/** 某张卡片关联的法条（按 sort_order 排序） */
async function listByCardSlug(slug) {
  const rows = await execPg(
    'SELECT name, text, source_url FROM laws WHERE card_slug = $1 ORDER BY sort_order, id',
    [slug]
  );
  return rows || [];
}

/**
 * 按关键词搜法条（Day 29 新增）——「直接查到法条」的后端支撑。
 *
 * 与 cardsRepository 的关键词检索互补：那边回答「哪些**情形**相关」，
 * 这边回答「哪些**法条**相关」。用户搜「劳动合同法」时卡片标题里并没有这个词，
 * 命中的其实是法条原文，必须把条文本身摊开给他看，否则搜索结果看着像没反应。
 *
 * 取数有两条来源，缺一不可（实测踩出来的）：
 *   ① 法条自身的名称/原文命中关键词 —— 搜「劳动合同法」「彩礼」这类走的这条；
 *   ② 命中的**卡片**所关联的全部法条 —— 搜「押金」时法条原文里根本没有「押金」
 *      二字（民法典 714 条写的是「租赁物转租」），若只按 ① 取数，
 *      用户会看到「搜到了情形，法条区却是空的」。②保证凡有卡片命中就一定有法条可看。
 *
 * 连表只为取「这条法条属于哪张卡」，好让前端一键跳到对应情形。
 *
 * @param {string} keyword 已 trim 的关键词
 * @param {string[]} slugs 本次命中的卡片 slug（可能为空数组）
 * @param {number} limit   条数上限（调用方已夹紧范围）
 * @returns {Promise<Array<{name,text,source_url,cardSlug,cardTitle}>>}
 */
async function searchByKeyword(keyword, slugs, limit) {
  const rows = await execPg(
    'SELECT l.name, l.text, l.source_url, ' +
      'l.card_slug AS "cardSlug", c.title AS "cardTitle" ' +
      'FROM laws l JOIN cards c ON c.slug = l.card_slug ' +
      "WHERE c.status = 'published' " +
      "AND (l.name ILIKE '%' || $1 || '%' OR l.text ILIKE '%' || $1 || '%' " +
      'OR l.card_slug = ANY($2::text[])) ' +
      // 排序三档：
      //   ① 法条原文/名称直接命中的排前面（更贴合关键词）
      //   ② 其余按「命中卡片的相关度顺序」——$2 是卡片检索排好序的 slug 数组，
      //      用 array_position 让第一张最相关的卡片的法条紧跟其后
      //      （不加这一档，搜「房东不退押金」的头条法条会是另一张卡的劳动合同法条文）
      //   ③ 同一张卡内按 sort_order
      "ORDER BY (CASE WHEN l.name ILIKE '%' || $1 || '%' OR l.text ILIKE '%' || $1 || '%' " +
      'THEN 0 ELSE 1 END), ' +
      'COALESCE(array_position($2::text[], l.card_slug), 9999), l.sort_order, l.id LIMIT $3',
    [keyword, (slugs && slugs.length) ? slugs : [], limit]
  );
  return rows || [];
}

module.exports = { listByCardSlug, searchByKeyword };

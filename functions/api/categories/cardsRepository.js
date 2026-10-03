/**
 * cardsRepository.js — cards 表的数据访问层（Day 19 拆出）
 * 唯一职责：封装对 cards 表的全部 SQL。
 * 分类列表接口只用到「按分类聚合计数」这一个查询，也在 cards 表上。
 */
'use strict';

const { execPg } = require('./db');

/**
 * 6 个固定分类（契约 §1.3 常量）+ 每类已发布卡片数。
 * LEFT JOIN 保证 count=0 的分类也返回、顺序稳定。
 * @returns {Promise<Array<{id, name, count}>>}
 */
async function countByCategory() {
  const rows = await execPg(
    "SELECT c.id, c.name, COALESCE(t.n, 0) AS count " +
      "FROM (VALUES ('labor','劳动类'), ('consume','消费类'), ('loan','借贷类'), " +
      "('marriage','婚姻家庭类'), ('traffic','交通类'), ('neighbor','邻里 / 名誉类')) AS c(id, name) " +
      "LEFT JOIN (SELECT category_id, count(*) AS n FROM cards WHERE status = 'published' GROUP BY category_id) t " +
      "ON t.category_id = c.id " +
      "ORDER BY c.id",
    []
  );
  return rows || [];
}

module.exports = { countByCategory };

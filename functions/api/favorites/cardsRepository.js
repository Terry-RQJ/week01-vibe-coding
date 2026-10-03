/**
 * cardsRepository.js — cards 表的数据访问层（Day 19 拆出）
 * favorites 接口只用到「卡片是否存在」这一个查询（收藏前校验）。
 */
'use strict';

const { execPg } = require('./db');

/** 已发布卡片是否存在（外键会拦，但提前给出人话报错） */
async function existsPublished(slug) {
  const rows = await execPg(
    'SELECT slug FROM cards WHERE slug = $1 AND status = $2',
    [slug, 'published']);
  return rows && rows.length > 0;
}

module.exports = { existsPublished };

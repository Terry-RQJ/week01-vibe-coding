/**
 * lawsRepository.js — laws 表的数据访问层（Day 19 拆出）
 * 唯一职责：封装对 laws 表的全部 SQL。
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

module.exports = { listByCardSlug };

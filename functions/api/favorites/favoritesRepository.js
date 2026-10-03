/**
 * favoritesRepository.js — favorites 表的数据访问层（Day 19 拆出）
 * 唯一职责：封装对 favorites 表的全部 SQL（读 + 写，写操作显式提权）。
 * 防重复：表级 UNIQUE(client_id, card_slug) 兜底，冲突时 DB 抛 23505，
 *         由入口层捕获转 409（人话报错属请求层职责）。
 */
'use strict';

const { execPg } = require('./db');

const WRITE_ROLE = 'cloudbase_postgres'; // 只读角色写不了，写操作显式提权

/** 某用户的收藏列表（按时间倒序） */
async function listByClient(clientId) {
  const rows = await execPg(
    'SELECT card_slug AS slug, created_at AS favorited_at FROM favorites WHERE client_id = $1 ORDER BY created_at DESC',
    [clientId]);
  return rows || [];
}

/**
 * 新增收藏。重复（UNIQUE 冲突 23505）时 reject，e.code 含 '23505'。
 * @returns {Promise<{favorited_at}>} 新行
 */
async function insert(clientId, slug) {
  const rows = await execPg(
    'INSERT INTO favorites (client_id, card_slug) VALUES ($1, $2) RETURNING created_at',
    [clientId, slug], WRITE_ROLE);
  return rows[0];
}

/**
 * 取消收藏（幂等：不存在也成功）。
 * @returns {Promise<number>} 实际删除的行数
 */
async function remove(clientId, slug) {
  const rows = await execPg(
    'DELETE FROM favorites WHERE client_id = $1 AND card_slug = $2 RETURNING card_slug',
    [clientId, slug], WRITE_ROLE);
  return rows.length;
}

module.exports = { listByClient, insert, remove };

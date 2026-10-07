/**
 * favoritesRepository.js — favorites 表的数据访问层（Day 19 拆出 / Day 22 扩展）
 * 唯一职责：封装对 favorites 表的全部 SQL（读 + 写，写操作显式提权）。
 *
 * 两条贯穿全表的规则：
 *   1) 软删除（Day 22）：所有「读」都带 is_deleted = false；删除只置标记不删行。
 *   2) 防重复：部分唯一索引 uq_favorites_active 兜底，冲突时 DB 抛 23505，
 *      由入口层捕获转 409（人话报错属请求层职责）。
 */
'use strict';

const { execPg } = require('./db');

const WRITE_ROLE = 'cloudbase_postgres'; // 只读角色写不了，写操作显式提权

/** 某用户的收藏列表（按时间倒序；软删除的行不返回） */
async function listByClient(clientId) {
  const rows = await execPg(
    'SELECT id, card_slug AS slug, note, created_at AS favorited_at FROM favorites ' +
    'WHERE client_id = $1 AND is_deleted = false ORDER BY created_at DESC',
    [clientId]);
  return rows || [];
}

/**
 * 新增收藏。重复（唯一索引冲突 23505）时 reject，e.code 含 '23505'。
 * @returns {Promise<{id, favorited_at}>} 新行
 */
async function insert(clientId, slug) {
  const rows = await execPg(
    'INSERT INTO favorites (client_id, card_slug) VALUES ($1, $2) ' +
    'RETURNING id, created_at AS favorited_at',
    [clientId, slug], WRITE_ROLE);
  return rows[0];
}

/**
 * 取消收藏（按 client_id + slug，幂等：不存在也成功）。走软删除。
 * @returns {Promise<number>} 实际影响的行数
 */
async function remove(clientId, slug) {
  const rows = await execPg(
    'UPDATE favorites SET is_deleted = true ' +
    'WHERE client_id = $1 AND card_slug = $2 AND is_deleted = false RETURNING id',
    [clientId, slug], WRITE_ROLE);
  return rows.length;
}

/* ---------- Day 22 新增：按 id 的修改与删除 ---------- */

/** 按 id 取一条（只取未删除的；不存在 → null）。带 client_id 兜底防越权。 */
async function findById(id, clientId) {
  const rows = await execPg(
    'SELECT id, card_slug AS slug, note, created_at AS favorited_at FROM favorites ' +
    'WHERE id = $1 AND client_id = $2 AND is_deleted = false',
    [id, clientId]);
  return (rows && rows[0]) || null;
}

/**
 * PATCH：按 id 改备注（唯一可改字段）。
 * @returns {Promise<object|null>} 更新后的行；id 不存在 → null
 */
async function updateNote(id, clientId, note) {
  const rows = await execPg(
    'UPDATE favorites SET note = $3 ' +
    'WHERE id = $1 AND client_id = $2 AND is_deleted = false ' +
    'RETURNING id, card_slug AS slug, note, created_at AS favorited_at',
    [id, clientId, note], WRITE_ROLE);
  return (rows && rows[0]) || null;
}

/**
 * DELETE（软删除）：按 id 置 is_deleted = true。
 * @returns {Promise<object|null>} 被删的行（便于回执）；id 不存在/已删 → null
 */
async function softDeleteById(id, clientId) {
  const rows = await execPg(
    'UPDATE favorites SET is_deleted = true ' +
    'WHERE id = $1 AND client_id = $2 AND is_deleted = false ' +
    'RETURNING id, card_slug AS slug',
    [id, clientId], WRITE_ROLE);
  return (rows && rows[0]) || null;
}

module.exports = { listByClient, insert, remove, findById, updateNote, softDeleteById };

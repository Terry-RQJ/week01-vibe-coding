/**
 * apiFavorites — 用户收藏接口（POST 写入 + GET 读回）
 * Day 19 分层重构后：本文件只剩「接请求 → 校验 → 调 repository → 返响应」。
 *   - SQL 全部下沉到 favoritesRepository.js / cardsRepository.js
 *   - 数据库连接细节（含写操作提权）在 db.js
 *   - 响应形状与重构前逐字段一致（契约 §2B.1 / §2B.2）
 */
'use strict';

const favoritesRepository = require('./favoritesRepository');
const cardsRepository = require('./cardsRepository');

/** 统一 JSON 响应（不设 CORS 头——网关按 Origin 自动回，函数自设会被拼成双值） */
function json(status, obj) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    body: JSON.stringify(obj)
  };
}

/** 服务端日志（Day 18 加练）：一条 JSON 一行，云函数日志页可直接过滤 */
function log(action, extra) {
  console.log(JSON.stringify(Object.assign(
    { t: new Date().toISOString(), fn: 'apiFavorites', action: action }, extra || {})));
}

/** 主入口 */
exports.main = async function (event) {
  const method = (event && event.httpMethod) || 'GET';
  log('in', { method: method, path: (event && event.path) || '' });
  try {
    if (method === 'OPTIONS') return { statusCode: 204, headers: {}, body: '' };
    if (method === 'GET') return await handleList(event);
    if (method === 'POST') return await handleCreate(event);
    return json(405, { ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: '只支持 GET / POST' } });
  } catch (e) {
    log('error', { message: e.message, code: e.code });
    return json(500, { ok: false, error: { code: 'INTERNAL', message: '服务器开小差了，稍后再试' } });
  }
};

/** GET /api/favorites?client_id=xxx —— 收藏列表（读回验证用） */
async function handleList(event) {
  const q = (event && event.queryStringParameters) || {};
  let clientId = typeof q.client_id === 'string' && q.client_id.trim() ? q.client_id.trim() : 'anon';
  if (clientId.length > 64) return json(400, { ok: false, error: { code: 'INVALID_PARAM', message: 'client_id 太长（≤64）' } });
  const rows = await favoritesRepository.listByClient(clientId);
  log('list', { client_id: clientId, count: rows.length });
  return json(200, { ok: true, data: rows, meta: { total: rows.length } });
}

/** POST /api/favorites —— body { slug, on, client_id? } */
async function handleCreate(event) {
  let body;
  try {
    body = JSON.parse((event && event.body) || '{}');
  } catch (e) {
    return json(400, { ok: false, error: { code: 'INVALID_BODY', message: '请求体不是合法的 JSON' } });
  }

  // ── 1. 必填校验（中文报错，说清缺了什么）──
  if (body.slug === undefined || body.slug === null || body.slug === '') {
    return json(400, { ok: false, error: { code: 'MISSING_FIELD', message: '缺少必填字段 slug（要收藏的卡片短名）' } });
  }
  if (typeof body.slug !== 'string' || !/^[a-z0-9-]{1,64}$/.test(body.slug)) {
    return json(400, { ok: false, error: { code: 'INVALID_PARAM', message: 'slug 格式不对：应为 1-64 位小写字母/数字/连字符' } });
  }
  if (body.on === undefined || body.on === null) {
    return json(400, { ok: false, error: { code: 'MISSING_FIELD', message: '缺少必填字段 on（true=收藏，false=取消收藏）' } });
  }
  if (typeof body.on !== 'boolean') {
    return json(400, { ok: false, error: { code: 'INVALID_PARAM', message: '字段 on 必须是布尔值 true 或 false' } });
  }
  let clientId = typeof body.client_id === 'string' && body.client_id.trim() ? body.client_id.trim() : 'anon';
  if (clientId.length > 64) {
    return json(400, { ok: false, error: { code: 'INVALID_PARAM', message: 'client_id 太长（≤64）' } });
  }
  const slug = body.slug, on = body.on;

  // ── 2. 卡片存在性（查数据走 repository）──
  if (!(await cardsRepository.existsPublished(slug))) {
    log('reject', { reason: 'card_not_found', slug: slug });
    return json(404, { ok: false, error: { code: 'CARD_NOT_FOUND', message: '找不到这个情形：' + slug } });
  }

  // ── 3. 写入 / 取消（SQL 在 favoritesRepository）──
  if (on) {
    try {
      const row = await favoritesRepository.insert(clientId, slug);
      log('insert', { slug: slug, client_id: clientId });
      return json(200, { ok: true, data: { slug: slug, on: true, favorited_at: row.created_at } });
    } catch (e) {
      // 唯一约束冲突（23505）= 重复提交 → 409 拒绝
      const code = String(e.code || '');
      const msg = String(e.message || '');
      if (code.indexOf('23505') >= 0 || msg.indexOf('duplicate key') >= 0) {
        log('reject', { reason: 'duplicate', slug: slug, client_id: clientId });
        return json(409, { ok: false, error: { code: 'ALREADY_FAVORITED', message: '这张卡片已经收藏过了，请勿重复提交' } });
      }
      throw e;
    }
  } else {
    const removed = await favoritesRepository.remove(clientId, slug);
    log('delete', { slug: slug, client_id: clientId, removed: removed });
    // 取消不存在的收藏 → 幂等成功（重复取消不报错）
    return json(200, { ok: true, data: { slug: slug, on: false, removed: removed } });
  }
}

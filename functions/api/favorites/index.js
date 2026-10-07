/**
 * apiFavorites — 用户收藏接口（Day 22：增删改查四类操作闭环）
 *   GET    /api/favorites?client_id=xxx   列表
 *   POST   /api/favorites                 新增/取消（body: slug + on）
 *   PATCH  /api/favorites?id=N            改备注（body: note + client_id）
 *   DELETE /api/favorites?id=N            删除（软删除，返回后 GET 不再返回该条）
 *
 * ⚠️ id 走查询参数而不是路径（/api/favorites/:id）：CloudBase HTTP 网关会把
 *    子路径归一化到函数根路径（Day 17 踩过，见 DEPLOY.md §12），故统一用 ?id=。
 *
 * 分层（Day 19 起）：本文件只做「接请求 → 校验 → 调 repository → 返响应」，
 *   SQL 全在 favoritesRepository.js，连接细节在 db.js。
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
    if (method === 'PATCH') return await handlePatch(event);
    if (method === 'DELETE') return await handleDelete(event);
    return json(405, { ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: '只支持 GET / POST / PATCH / DELETE' } });
  } catch (e) {
    log('error', { message: e.message, code: e.code });
    return json(500, { ok: false, error: { code: 'INTERNAL', message: '服务器开小差了，稍后再试' } });
  }
};

/** 解析 body（非法 JSON 统一 400） */
function parseBody(event) {
  try {
    return { body: JSON.parse((event && event.body) || '{}') };
  } catch (e) {
    return { error: json(400, { ok: false, error: { code: 'INVALID_BODY', message: '请求体不是合法的 JSON' } }) };
  }
}

/** 从 query 取 id（正整数），失败返回 {error} */
function parseId(event) {
  const q = (event && event.queryStringParameters) || {};
  const raw = q.id;
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return { error: json(400, { ok: false, error: { code: 'MISSING_FIELD', message: '缺少必填参数 id（要操作的收藏记录编号）' } }) };
  }
  const id = Number(String(raw).trim());
  if (!Number.isInteger(id) || id <= 0) {
    return { error: json(400, { ok: false, error: { code: 'INVALID_PARAM', message: 'id 格式不对：应为正整数' } }) };
  }
  return { id: id };
}

/** 解析 client_id（可选，默认 anon） */
function parseClientId(value) {
  const v = typeof value === 'string' && value.trim() ? value.trim() : 'anon';
  if (v.length > 64) return { error: json(400, { ok: false, error: { code: 'INVALID_PARAM', message: 'client_id 太长（≤64）' } }) };
  return { clientId: v };
}

/** GET /api/favorites?client_id=xxx —— 收藏列表（读回验证用） */
async function handleList(event) {
  const parsed = parseClientId(((event && event.queryStringParameters) || {}).client_id);
  if (parsed.error) return parsed.error;
  const rows = await favoritesRepository.listByClient(parsed.clientId);
  log('list', { client_id: parsed.clientId, count: rows.length });
  return json(200, { ok: true, data: rows, meta: { total: rows.length } });
}

/** POST /api/favorites —— body { slug, on, client_id? } */
async function handleCreate(event) {
  const p = parseBody(event);
  if (p.error) return p.error;
  const body = p.body;

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
  const cp = parseClientId(body.client_id);
  if (cp.error) return cp.error;
  const clientId = cp.clientId, slug = body.slug, on = body.on;

  // ── 2. 卡片存在性（查数据走 repository）──
  if (!(await cardsRepository.existsPublished(slug))) {
    log('reject', { reason: 'card_not_found', slug: slug });
    return json(404, { ok: false, error: { code: 'CARD_NOT_FOUND', message: '找不到这个情形：' + slug } });
  }

  // ── 3. 写入 / 取消（SQL 在 favoritesRepository）──
  if (on) {
    try {
      const row = await favoritesRepository.insert(clientId, slug);
      log('insert', { id: row.id, slug: slug, client_id: clientId });
      return json(200, { ok: true, data: { id: row.id, slug: slug, on: true, favorited_at: row.favorited_at } });
    } catch (e) {
      // 部分唯一索引冲突（23505）= 重复提交 → 409 拒绝
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
    log('delete_by_slug', { slug: slug, client_id: clientId, removed: removed });
    // 取消不存在的收藏 → 幂等成功（重复取消不报错）
    return json(200, { ok: true, data: { slug: slug, on: false, removed: removed } });
  }
}

/** PATCH /api/favorites?id=N —— body { note, client_id? } 改备注 */
async function handlePatch(event) {
  const idp = parseId(event);
  if (idp.error) return idp.error;
  const p = parseBody(event);
  if (p.error) return p.error;
  const body = p.body;

  // 先查未知字段（白名单）——不然「传了别的字段但没传 note」会被报成「缺 note」，
  // 提示不准（Day 22 冒烟发现：传 {card_slug:'hack'} 时报的是缺 note）
  const unknown = Object.keys(body).filter(function (k) { return k !== 'note' && k !== 'client_id'; });
  if (unknown.length) {
    return json(400, { ok: false, error: { code: 'INVALID_PARAM', message: '本接口只能改 note，不支持改：' + unknown.join(', ') } });
  }
  // 仅允许改 note 一个字段（白名单）
  if (body.note === undefined || body.note === null) {
    return json(400, { ok: false, error: { code: 'MISSING_FIELD', message: '缺少必填字段 note（要改成什么备注）' } });
  }
  if (typeof body.note !== 'string') {
    return json(400, { ok: false, error: { code: 'INVALID_PARAM', message: '字段 note 必须是字符串' } });
  }
  if (body.note.length > 200) {
    return json(400, { ok: false, error: { code: 'INVALID_PARAM', message: '备注太长（≤200 字）' } });
  }
  const cp = parseClientId(body.client_id);
  if (cp.error) return cp.error;

  const row = await favoritesRepository.updateNote(idp.id, cp.clientId, body.note);
  if (!row) {
    log('reject', { reason: 'not_found', id: idp.id, client_id: cp.clientId });
    return json(404, { ok: false, error: { code: 'FAVORITE_NOT_FOUND', message: '找不到这条收藏记录（id=' + idp.id + '），可能已被删除' } });
  }
  log('patch', { id: idp.id, client_id: cp.clientId });
  return json(200, { ok: true, data: row });
}

/** DELETE /api/favorites?id=N —— 软删除 */
async function handleDelete(event) {
  const idp = parseId(event);
  if (idp.error) return idp.error;
  const q = (event && event.queryStringParameters) || {};
  const cp = parseClientId(q.client_id);
  if (cp.error) return cp.error;

  const row = await favoritesRepository.softDeleteById(idp.id, cp.clientId);
  if (!row) {
    log('reject', { reason: 'not_found', id: idp.id, client_id: cp.clientId });
    return json(404, { ok: false, error: { code: 'FAVORITE_NOT_FOUND', message: '找不到这条收藏记录（id=' + idp.id + '），可能已被删除' } });
  }
  log('delete', { id: idp.id, client_id: cp.clientId });
  // soft:true 让调用方知道这是软删除（数据还在库里，可找回）
  return json(200, { ok: true, data: { id: row.id, slug: row.slug, deleted: true, soft: true } });
}

/**
 * apiFavorites — Day 18 用户收藏接口（POST 写入 + GET 读回）
 *
 * 契约：api-contract.md §2B.1（GET）/ §2B.2（POST）
 * 数据通道：POST https://{envId}.api.tcloudbasegateway.com/v1/rdb/exec-pgsql
 *   - 读（GET）：默认只读角色（已 GRANT SELECT ON favorites）
 *   - 写（POST）：显式 role=cloudbase_postgres（只读角色无 INSERT/DELETE 权限）
 * 防重复：表级 UNIQUE(client_id, card_slug) 兜底 + 业务层捕获 23505 → 409
 */
'use strict';

const ENV_ID = 'rqj-2006-d0gl1ael531a243a1';
const GW_HOST = ENV_ID + '.api.tcloudbasegateway.com';
const WRITE_ROLE = 'cloudbase_postgres'; // 只读角色写不了，写操作显式提权
const API_KEY = process.env.CB_API_KEY;

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

function makeErr(status, code, message) {
  const e = new Error(message);
  e.status = status;
  e.code = code;
  return e;
}

/** 调 exec-pgsql（与 Day 17 cards 函数同款 https.request，Node 16 运行时无 fetch）
 *  成功 → 直接返回行数组；失败 → reject（e.code 保留 DB 错误码，如 23505 唯一冲突） */
function execPg(sql, parameters, role) {
  return new Promise((resolve, reject) => {
    if (!API_KEY) return reject(makeErr(500, 'DB_NOT_CONFIGURED', '云函数缺少 CB_API_KEY 环境变量'));
    const body = JSON.stringify(Object.assign({ sql, parameters: parameters || [] }, role ? { role: role } : {}));
    const req = require('https').request({
      hostname: GW_HOST,
      path: '/v1/rdb/exec-pgsql',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + API_KEY,
        'Content-Length': Buffer.byteLength(body)
      },
      timeout: 8000
    }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => {
        let parsed;
        try { parsed = JSON.parse(d); } catch (e) { parsed = null; }
        // 网关错误形状：HTTP >= 400 或顶层 { code, message }（如 23505 唯一冲突）
        if (res.statusCode >= 400 || (parsed && parsed.code)) {
          const code = (parsed && parsed.code) || ('HTTP_' + res.statusCode);
          const msg = (parsed && parsed.message) || ('HTTP ' + res.statusCode);
          return reject(makeErr(500, code, msg));
        }
        resolve(parsed);
      });
    });
    req.on('error', (e) => reject(makeErr(500, 'DB_REQUEST_FAILED', e.message)));
    req.on('timeout', () => req.destroy(makeErr(504, 'DB_TIMEOUT', '数据库查询超时')));
    req.end(body);
  });
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
  const rows = await execPg(
    'SELECT card_slug AS slug, created_at AS favorited_at FROM favorites WHERE client_id = $1 ORDER BY created_at DESC',
    [clientId]);
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

  // ── 2. 卡片存在性（外键会拦，但提前给出人话报错）──
  const found = await execPg('SELECT slug FROM cards WHERE slug = $1 AND status = $2', [slug, 'published']);
  if (!found.length) {
    log('reject', { reason: 'card_not_found', slug: slug });
    return json(404, { ok: false, error: { code: 'CARD_NOT_FOUND', message: '找不到这个情形：' + slug } });
  }

  // ── 3. 写入 / 取消 ──
  if (on) {
    try {
      const rows = await execPg(
        'INSERT INTO favorites (client_id, card_slug) VALUES ($1, $2) RETURNING created_at',
        [clientId, slug], WRITE_ROLE);
      log('insert', { slug: slug, client_id: clientId });
      return json(200, { ok: true, data: { slug: slug, on: true, favorited_at: rows[0].created_at } });
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
    const rows = await execPg(
      'DELETE FROM favorites WHERE client_id = $1 AND card_slug = $2 RETURNING card_slug',
      [clientId, slug], WRITE_ROLE);
    log('delete', { slug: slug, client_id: clientId, removed: rows.length });
    // 取消不存在的收藏 → 幂等成功（重复取消不报错）
    return json(200, { ok: true, data: { slug: slug, on: false, removed: rows.length } });
  }
}

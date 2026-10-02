/**
 * CloudBase 云函数：GET /api/cards（列表）+ GET /api/cards/:slug（详情）
 * Day 17 第一个真读接口 — 从 PostgreSQL 的 cards + laws 表读真实数据
 * 数据通道：CloudBase HTTP API exec-pgsql（参数化 SQL，只读角色）
 * 响应形状：{ ok, data, meta? } / { ok:false, error:{ code, message } }，与 api-contract.md §1 一致
 */
'use strict';

// —— 配置（envId 本来就公开在 DEPLOY.md / cloudbaserc.json，密钥走环境变量 CB_API_KEY）——
const ENV_ID = 'rqj-2006-d0gl1ael531a243a1';
const GW_HOST = ENV_ID + '.api.tcloudbasegateway.com';
const API_KEY = process.env.CB_API_KEY || '';

// 契约 §1.1 允许的 6 个分类 id
const CATEGORY_IDS = ['labor', 'consume', 'loan', 'marriage', 'traffic', 'neighbor'];

// ---------- exec-pgsql 调用（Node 16 内置 https，无第三方依赖） ----------
function execPg(sql, parameters) {
  return new Promise((resolve, reject) => {
    if (!API_KEY) {
      return reject(makeErr(500, 'DB_NOT_CONFIGURED', '云函数缺少 CB_API_KEY 环境变量'));
    }
    const body = JSON.stringify({ sql, parameters: parameters || [] });
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
        if (res.statusCode >= 400 || (parsed && parsed.code)) {
          const code = (parsed && parsed.code) || 'DB_ERROR';
          const msg = (parsed && parsed.message) || ('HTTP ' + res.statusCode);
          return reject(makeErr(500, code, msg));
        }
        resolve(parsed);
      });
    });
    req.on('error', (e) => reject(makeErr(500, 'DB_REQUEST_FAILED', e.message)));
    req.on('timeout', () => {
      req.destroy(makeErr(504, 'DB_TIMEOUT', '数据库查询超时'));
    });
    req.end(body);
  });
}

function makeErr(status, code, message) {
  const e = new Error(message);
  e.status = status;
  e.code = code;
  return e;
}

function json(status, obj) {
  return {
    statusCode: status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    },
    body: JSON.stringify(obj)
  };
}

// ---------- 列表：GET /api/cards?category=&keyword=&limit= ----------
async function listCards(q) {
  // 参数校验（契约 §1.1：非法值 400）
  const category = q.category || null;
  if (category !== null && !CATEGORY_IDS.includes(category)) {
    throw makeErr(400, 'INVALID_PARAM', 'category 不在允许范围');
  }
  const keyword = (q.keyword || '').trim() || null;
  // 加练：limit 条数限制（默认 12，1–50）
  let limit = 12;
  if (q.limit !== undefined && q.limit !== '') {
    limit = Number(q.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
      throw makeErr(400, 'INVALID_PARAM', 'limit 必须是 1–50 的整数');
    }
  }

  // SQL 参数化：$1 分类 / $2 关键词 / $3 条数，全部走 parameters，禁止拼接
  // keyword 匹配范围（契约 §1.1）：标题/摘要/情景/标签/应对步骤/法条名称+原文
  const where = [
    "status = 'published'",
    "($1::text IS NULL OR category_id = $1)",
    "($2::text IS NULL OR title ILIKE '%' || $2 || '%' OR summary ILIKE '%' || $2 || '%' " +
      "OR scenario ILIKE '%' || $2 || '%' OR tags::text ILIKE '%' || $2 || '%' " +
      "OR solution_steps::text ILIKE '%' || $2 || '%' " +
      "OR EXISTS (SELECT 1 FROM laws l WHERE l.card_slug = cards.slug " +
      "AND (l.name ILIKE '%' || $2 || '%' OR l.text ILIKE '%' || $2 || '%')))"
  ].join(' AND ');

  const rows = await execPg(
    "SELECT slug, title, summary, category, category_id AS \"categoryId\", tags, " +
      "to_char(published_at, 'YYYY-MM-DD') AS published_at, " +
      "to_char(last_verified_at, 'YYYY-MM-DD') AS last_verified_at " +
      'FROM cards WHERE ' + where + ' ORDER BY published_at DESC, slug LIMIT $3',
    [category, keyword, limit]
  );
  const counts = await execPg(
    'SELECT count(*) AS n FROM cards WHERE ' + where,
    [category, keyword]
  );

  return json(200, {
    ok: true,
    data: rows || [],
    meta: { total: counts && counts[0] ? Number(counts[0].n) : 0, limit }
  });
}

// ---------- 详情：GET /api/cards/:slug ----------
async function getCard(slug) {
  const rows = await execPg(
    'SELECT slug, title, summary, category, category_id AS "categoryId", tags, scenario, ' +
      'solution_steps, related_slugs, ' +
      "to_char(published_at, 'YYYY-MM-DD') AS published_at, " +
      "to_char(updated_at, 'YYYY-MM-DD') AS updated_at, " +
      "to_char(last_verified_at, 'YYYY-MM-DD') AS last_verified_at, " +
      'author_type, reviewed_by ' +
      'FROM cards WHERE slug = $1 AND status = $2',
    [slug, 'published']
  );
  if (!rows || !rows.length) {
    throw makeErr(404, 'CARD_NOT_FOUND', '找不到这个情形');
  }
  const laws = await execPg(
    'SELECT name, text, source_url FROM laws WHERE card_slug = $1 ORDER BY sort_order, id',
    [slug]
  );
  const card = rows[0];
  card.laws = laws || [];
  return json(200, { ok: true, data: card });
}

// ---------- 入口 ----------
exports.main = async (event) => {
  try {
    if (event && event.httpMethod && event.httpMethod === 'OPTIONS') {
      // CORS 预检（GET 简单请求本不触发，浏览器扩展/工具可能发）
      return { statusCode: 204, headers: {}, body: '' };
    }
    if (event && event.httpMethod && event.httpMethod !== 'GET') {
      return json(405, { ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: '只支持 GET' } });
    }
    const q = (event && event.queryStringParameters) || {};
    // 路径形态 /api/cards/<slug> → 详情；否则看 ?slug= 也进详情（兜底）
    let pathSlug = '';
    const m = (event && event.path || '').match(/^\/api\/cards\/([^/?]+)/);
    if (m) pathSlug = decodeURIComponent(m[1]);
    const slug = pathSlug || (q.slug || '').trim();

    if (slug) return await getCard(slug);
    return await listCards(q);
  } catch (e) {
    return json(e.status || 500, {
      ok: false,
      error: { code: e.code || 'INTERNAL', message: e.message || '服务内部错误' }
    });
  }
};

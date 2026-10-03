/**
 * CloudBase 云函数：GET /api/cards（列表）+ GET /api/cards/:slug（详情）
 * Day 19 分层重构后：本文件只剩「接请求 → 调 repository → 返响应」。
 *   - SQL 全部下沉到 cardsRepository.js / lawsRepository.js
 *   - 数据库连接细节在 db.js
 *   - 响应形状 { ok, data, meta? } / { ok:false, error:{ code, message } } 与重构前逐字段一致
 */
'use strict';

const { makeErr } = require('./db');
const cardsRepository = require('./cardsRepository');
const lawsRepository = require('./lawsRepository');

// 契约 §1.1 允许的 6 个分类 id
const CATEGORY_IDS = ['labor', 'consume', 'loan', 'marriage', 'traffic', 'neighbor'];

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
  // 参数校验（契约 §1.1：非法值 400）——校验属请求层，留在入口
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

  // 查数据：一句 repository，入口不碰 SQL
  const { rows, total } = await cardsRepository.listPublished({ category, keyword, limit });
  return json(200, { ok: true, data: rows, meta: { total: total, limit: limit } });
}

// ---------- 详情：GET /api/cards/:slug ----------
async function getCard(slug) {
  const card = await cardsRepository.getPublishedBySlug(slug);
  if (!card) {
    throw makeErr(404, 'CARD_NOT_FOUND', '找不到这个情形');
  }
  card.laws = await lawsRepository.listByCardSlug(slug);
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

/**
 * CloudBase 云函数：GET /api/cards（列表）+ GET /api/cards/:slug（详情）
 * Day 19 分层重构后：本文件只剩「接请求 → 调 repository → 返响应」。
 *   - SQL 全部下沉到 cardsRepository.js / lawsRepository.js
 *   - 数据库连接细节在 db.js
 *   - 响应形状 { ok, data, meta? } / { ok:false, error:{ code, message } } 与重构前逐字段一致
 *
 * Day 29 扩展：带 keyword 时 meta 多两个字段
 *   - matchMode: 'exact' | 'fuzzy' | 'none' —— 精确/近似/无结果，前端据此换文案
 *   - matchedLaws: 命中的法条原文（含所属卡片），支撑「直接查到法条」
 * 无 keyword 时响应与之前完全一致（不新增字段），老调用方不受影响。
 */
'use strict';

const { makeErr } = require('./db');
const { toErrorResponse } = require('./errors');
const cardsRepository = require('./cardsRepository');
const lawsRepository = require('./lawsRepository');

// 契约 §1.1 允许的 6 个分类 id
const CATEGORY_IDS = ['labor', 'consume', 'loan', 'marriage', 'traffic', 'neighbor'];

// 单次最多回带多少条命中法条（“相关法条”区），够列满一屏又不至于把响应撑大
const MATCHED_LAWS_LIMIT = 12;


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

  // 无关键词：老路径，按发布时间倒序，行为与重构前一致
  if (!keyword) {
    const r = await cardsRepository.listPublished({ category, keyword: null, limit });
    return json(200, { ok: true, data: r.rows, meta: { total: r.total, limit: limit } });
  }

  // 有关键词（Day 29 起）：三段式
  //   ① 精确——整串命中，命中即停
  //   ② 近似——整串颗粒无收时，用 2 字片段兜底召回，避免长句提问 0 结果
  //   ③ 空——两条路都没结果，matchMode='none'，前端据此展示「为你推荐」
  const exact = await cardsRepository.listPublished({ category, keyword, limit });
  let cards = exact.rows;
  let total = exact.total;
  let matchMode = 'exact';

  if (cards.length === 0) {
    const approx = await cardsRepository.listApprox({ category, keyword, limit });
    cards = approx.rows;
    total = approx.total;
    matchMode = cards.length > 0 ? 'fuzzy' : 'none';
  }

  // 命中的卡片要一起传给法条检索：搜「押金」时法条原文里没有「押金」二字，
  // 靠「命中卡片关联的法条」才能让法条区有内容（详见 lawsRepository.searchByKeyword）
  const matchedLaws = await lawsRepository.searchByKeyword(
    keyword, cards.map(function (c) { return c.slug; }), MATCHED_LAWS_LIMIT);

  return json(200, {
    ok: true,
    data: cards,
    meta: { total: total, limit: limit, matchMode: matchMode, matchedLaws: matchedLaws }
  });
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
  // 加练（Day 23）：一行 JSON 请求日志——时间、方法、路径
  console.log(JSON.stringify({
    t: new Date().toISOString(), fn: 'apiCards', action: 'in',
    method: (event && event.httpMethod) || 'GET', path: (event && event.path) || ''
  }));
  try {
    if (event && event.httpMethod && event.httpMethod === 'OPTIONS') {
      // CORS 预检（GET 简单请求本不触发，浏览器扩展/工具可能发）
      return { statusCode: 204, headers: {}, body: '' };
    }
    if (event && event.httpMethod && event.httpMethod !== 'GET') {
      return json(405, { ok: false, error: { code: 'METHOD_NOT_ALLOWED', kind: 'input', message: '只支持 GET' } });
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
    // Day 23：统一中文错误映射——输入错回校验文案，网络/服务端错回人话兜底，
    // 数据库原始英文报错只进日志（不再像以前那样 e.message 直出给用户）
    return toErrorResponse(e, function (code, info) {
      console.log(JSON.stringify(Object.assign(
        { t: new Date().toISOString(), fn: 'apiCards', action: 'error', code: code }, info)));
    });
  }
};

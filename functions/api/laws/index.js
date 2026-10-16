/**
 * CloudBase 云函数：GET /api/laws —— 「法条速查」页的后端（Day 30 新增）
 *
 * 为什么单开一个函数：Day 29 把命中法条塞在 /api/cards 的 meta.matchedLaws 里，
 * 那是「跟着搜索结果捎带看的法条」。用户这次要的是一个**独立入口**——
 * 不问情形、直接按法律名或条文关键词查法条，所以给它自己的路由与函数。
 *
 * 分层与 apiCards 保持一致：入口只做参数校验与响应组装，SQL 全在 lawsRepository.js。
 *
 * 查询参数：
 *   keyword  string  关键词（匹配法条名称/原文，**也匹配关联卡片的标题、摘要、情境、标签**）
 *   law      string  法律名筛选（如「民法典」——对应 name 形如《民法典》第 714 条）
 *   category string  分类 id（labor/consume/...）
 *   limit    int     条数上限（1–500，默认 200）
 *
 * 响应（data 已按法条聚合，一条法条只出现一次）：
 *   { ok: true,
 *     data: [{ name, text, source_url, lawName,
 *              cards: [{ slug, title, category, categoryId }] }],
 *     meta: { total, limit, lawNames: [{ name, count }] } }
 */
'use strict';

const { makeErr } = require('./db');
const { toErrorResponse } = require('./errors');
const lawsRepository = require('./lawsRepository');

const CATEGORY_IDS = ['labor', 'consume', 'loan', 'marriage', 'traffic', 'neighbor'];
const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;


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

/** 从「《民法典》第 714 条」里取出法律名「民法典」——前端按法律名分组／筛选要用 */
function lawNameOf(fullName) {
  const m = /^《([^》]+)》/.exec(fullName || '');
  return m ? m[1] : '';
}

// ---------- GET /api/laws ----------
async function listLaws(q) {
  const category = q.category || null;
  if (category !== null && !CATEGORY_IDS.includes(category)) {
    throw makeErr(400, 'INVALID_PARAM', 'category 不在允许范围');
  }
  const keyword = (q.keyword || '').trim() || null;
  const law = (q.law || '').trim() || null;

  let limit = DEFAULT_LIMIT;
  if (q.limit !== undefined && q.limit !== '') {
    limit = Number(q.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
      throw makeErr(400, 'INVALID_PARAM', 'limit 必须是 1–' + MAX_LIMIT + ' 的整数');
    }
  }

  const rows = await lawsRepository.listLaws({ keyword, law, category, limit });
  // 法律名清单（含各自条数）用于筛选器；只查一次，随响应带回
  const lawNames = await lawsRepository.listLawNames();

  const data = rows.map(function (r) {
    return Object.assign({}, r, { lawName: lawNameOf(r.name) });
  });

  return json(200, {
    ok: true,
    data: data,
    meta: { total: data.length, limit: limit, lawNames: lawNames }
  });
}

// ---------- 入口 ----------
exports.main = async (event) => {
  console.log(JSON.stringify({
    t: new Date().toISOString(), fn: 'apiLaws', action: 'in',
    method: (event && event.httpMethod) || 'GET', path: (event && event.path) || ''
  }));
  try {
    if (event && event.httpMethod && event.httpMethod === 'OPTIONS') {
      return { statusCode: 204, headers: {}, body: '' };
    }
    if (event && event.httpMethod && event.httpMethod !== 'GET') {
      return json(405, { ok: false, error: { code: 'METHOD_NOT_ALLOWED', kind: 'input', message: '只支持 GET' } });
    }
    const q = (event && event.queryStringParameters) || {};
    return await listLaws(q);
  } catch (e) {
    return toErrorResponse(e, function (code, info) {
      console.log(JSON.stringify(Object.assign(
        { t: new Date().toISOString(), fn: 'apiLaws', action: 'error', code: code }, info)));
    });
  }
};

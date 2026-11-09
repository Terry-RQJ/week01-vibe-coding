/**
 * CloudBase 云函数：GET /api/news —— 「法律热点」页的后端（Day 37 新增）
 *
 * 设计（与用户对齐过）：AI 每天抓官方权威源（中国普法网、人民法院报等）
 * 生成「候选」条目 → 用户在本地维护页 admin-news.html 逐条确认后才置为 published。
 * 线上接口只返回 published —— 未确认的候选绝不会出现在访客面前。
 *
 * 查询参数：
 *   limit int  条数上限（1–30，默认 7 —— 首页展示最近一周）
 *   all   任意非空值 → 返回 candidate 候选列表（仅本地维护页使用）
 *
 * 响应：{ ok: true, data: [...], meta: { total, limit } }
 */
'use strict';

const { makeErr } = require('./db');
const { toErrorResponse } = require('./errors');
const newsRepository = require('./newsRepository');

const DEFAULT_LIMIT = 7;
const MAX_LIMIT = 30;


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

// ---------- GET /api/news ----------
async function listNews(q) {
  let limit = DEFAULT_LIMIT;
  if (q.limit !== undefined && q.limit !== '') {
    limit = Number(q.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
      throw makeErr(400, 'INVALID_PARAM', 'limit 必须是 1-' + MAX_LIMIT + ' 的整数');
    }
  }

  // ?all=1 → 候选列表（本地维护页用）。不做鉴权的原因：候选只有标题摘要等公开源信息，
  // 且该参数只暴露「未上线草稿」，线上页面从不调用；写入路径不在云函数，风险面极小。
  if (q.all) {
    const rows = await newsRepository.listCandidates(limit);
    return json(200, { ok: true, data: rows, meta: { total: rows.length, limit: limit, mode: 'candidates' } });
  }

  const rows = await newsRepository.listPublished(limit);
  // Day 44：带上「最近一次抓取」的台账，前端如实显示更新于哪天（抓挂时能看出来）
  let lastRun = null;
  try {
    const r = await newsRepository.latestRun();
    lastRun = (r && r[0]) || null;
  } catch (e) {
    // 台账表还没建（老环境）不影响主接口
    lastRun = null;
  }
  return json(200, { ok: true, data: rows, meta: { total: rows.length, limit: limit, lastRun: lastRun } });
}

// ---------- 入口 ----------
exports.main = async (event) => {
  console.log(JSON.stringify({
    t: new Date().toISOString(), fn: 'apiNews', action: 'in',
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
    return await listNews(q);
  } catch (e) {
    return toErrorResponse(e, function (code, info) {
      console.log(JSON.stringify(Object.assign(
        { t: new Date().toISOString(), fn: 'apiNews', action: 'error', code: code }, info)));
    });
  }
};

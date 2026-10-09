/**
 * CloudBase 云函数：GET /api/categories
 * Day 19 分层重构后：本文件只剩「接请求 → 调 repository → 返响应」。
 *   - 聚合 SQL 下沉到 cardsRepository.countByCategory()
 *   - 响应形状与重构前一致：{ ok, data: [{ id, name, count }] }
 */
'use strict';

const { toErrorResponse } = require('./errors');
const cardsRepository = require('./cardsRepository');

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

exports.main = async (event) => {
  // 加练（Day 23）：一行 JSON 请求日志
  console.log(JSON.stringify({
    t: new Date().toISOString(), fn: 'apiCategories', action: 'in',
    method: (event && event.httpMethod) || 'GET', path: (event && event.path) || ''
  }));
  try {
    if (event && event.httpMethod && event.httpMethod === 'OPTIONS') {
      return { statusCode: 204, headers: {}, body: '' };
    }
    if (event && event.httpMethod && event.httpMethod !== 'GET') {
      return json(405, { ok: false, error: { code: 'METHOD_NOT_ALLOWED', kind: 'input', message: '只支持 GET' } });
    }
    // 查数据：一句 repository，入口不碰 SQL
    const rows = await cardsRepository.countByCategory();
    return json(200, { ok: true, data: rows.map(r => ({ ...r, count: Number(r.count) })) });
  } catch (e) {
    // Day 23：统一中文错误映射（同 apiCards）
    return toErrorResponse(e, function (code, info) {
      console.log(JSON.stringify(Object.assign(
        { t: new Date().toISOString(), fn: 'apiCategories', action: 'error', code: code }, info)));
    });
  }
};

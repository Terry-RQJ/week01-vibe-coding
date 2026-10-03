/**
 * CloudBase 云函数：GET /api/categories
 * Day 19 分层重构后：本文件只剩「接请求 → 调 repository → 返响应」。
 *   - 聚合 SQL 下沉到 cardsRepository.countByCategory()
 *   - 响应形状与重构前一致：{ ok, data: [{ id, name, count }] }
 */
'use strict';

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
  try {
    if (event && event.httpMethod && event.httpMethod === 'OPTIONS') {
      return { statusCode: 204, headers: {}, body: '' };
    }
    if (event && event.httpMethod && event.httpMethod !== 'GET') {
      return json(405, { ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: '只支持 GET' } });
    }
    // 查数据：一句 repository，入口不碰 SQL
    const rows = await cardsRepository.countByCategory();
    return json(200, { ok: true, data: rows.map(r => ({ ...r, count: Number(r.count) })) });
  } catch (e) {
    return json(e.status || 500, {
      ok: false,
      error: { code: e.code || 'INTERNAL', message: e.message || '服务内部错误' }
    });
  }
};

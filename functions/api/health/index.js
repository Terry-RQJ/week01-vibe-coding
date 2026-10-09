/**
 * CloudBase 云函数：GET /api/health
 * Day 15 冒烟测试 — 不连数据库、不写业务
 * 路径映射：functions/api/health/index.js → HTTP 路径 /api/health
 *
 * Day 23 修正两处：
 *   ① 405 响应补 `ok: false`（此前缺，与其余接口形状不一致）
 *   ② 加 try/catch，异常不再裸崩；对外文案走统一中文兜底
 */
'use strict';

const { toErrorResponse } = require('./errors');

exports.main = async (event) => {
  // 加练（Day 23）：一行 JSON 请求日志
  console.log(JSON.stringify({
    t: new Date().toISOString(), fn: 'apiHealth', action: 'in',
    method: (event && event.httpMethod) || 'GET', path: (event && event.path) || ''
  }));
  try {
    if (event && event.httpMethod && event.httpMethod === 'OPTIONS') {
      return { statusCode: 204, headers: {}, body: '' };
    }
    // 健康检查只接 GET，其他方法 405（形状与其余接口对齐）
    if (event && event.httpMethod && event.httpMethod !== 'GET') {
      return {
        statusCode: 405,
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
        body: JSON.stringify({
          ok: false,
          error: { code: 'METHOD_NOT_ALLOWED', kind: 'input', message: '只支持 GET' }
        })
      };
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
      },
      body: JSON.stringify({
        ok: true,
        service: 'law-mini-site',
        version: 'v1',
        time: new Date().toISOString()
      })
    };
  } catch (e) {
    // 契约 §1.4：本接口不允许返回非 200 之外的语义错误，异常一律 500（但文案要人话）
    return toErrorResponse(e, function (code, info) {
      console.log(JSON.stringify(Object.assign(
        { t: new Date().toISOString(), fn: 'apiHealth', action: 'error', code: code }, info)));
    });
  }
};

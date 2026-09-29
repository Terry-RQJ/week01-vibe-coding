/**
 * CloudBase 云函数：GET /api/health
 * Day 15 冒烟测试 — 不连数据库、不写业务
 * 路径映射：functions/api/health/index.js → HTTP 路径 /api/health
 */
'use strict';

exports.main = async (event, context) => {
  // CloudBase HTTP 触发：event.httpMethod / event.path / event.headers / event.queryStringParameters
  // 健康检查只接 GET，其他方法 405
  if (event && event.httpMethod && event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        error: {
          code: 'METHOD_NOT_ALLOWED',
          message: '只支持 GET'
        }
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
};
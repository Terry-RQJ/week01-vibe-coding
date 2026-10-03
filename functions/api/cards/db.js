/**
 * db.js — 数据库访问底层（Day 19 拆出）
 * 唯一职责：把 SQL 发到 CloudBase exec-pgsql 网关，返回行数组。
 * 不含任何业务 SQL（业务 SQL 全部在 *Repository.js），不含任何 HTTP 处理。
 *
 * 数据通道：POST https://{envId}.api.tcloudbasegateway.com/v1/rdb/exec-pgsql
 * Node 16 运行时无全局 fetch，用内置 https.request。
 */
'use strict';

const ENV_ID = 'rqj-2006-d0gl1ael531a243a1';
const GW_HOST = ENV_ID + '.api.tcloudbasegateway.com';
const API_KEY = process.env.CB_API_KEY || '';

/** 统一错误对象：带 status / code，入口层按它拼响应 */
function makeErr(status, code, message) {
  const e = new Error(message);
  e.status = status;
  e.code = code;
  return e;
}

/**
 * 执行一条参数化 SQL（只读角色；本函数只有读操作，不需要提权）。
 * 成功 → resolve(行数组)；失败 → reject(makeErr)
 */
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

module.exports = { execPg, makeErr };

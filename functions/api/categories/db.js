/**
 * db.js — 数据库访问底层（Day 19 拆出，与 api/cards 同款）
 * 唯一职责：把 SQL 发到 CloudBase exec-pgsql 网关，返回行数组。
 * 不含业务 SQL，不含 HTTP 处理。
 */
'use strict';

const ENV_ID = 'rqj-2006-d0gl1ael531a243a1';
const GW_HOST = ENV_ID + '.api.tcloudbasegateway.com';
const API_KEY = process.env.CB_API_KEY || '';

function makeErr(status, code, message) {
  const e = new Error(message);
  e.status = status;
  e.code = code;
  return e;
}

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
          return reject(makeErr(500, (parsed && parsed.code) || 'DB_ERROR', (parsed && parsed.message) || 'HTTP ' + res.statusCode));
        }
        resolve(parsed);
      });
    });
    req.on('error', (e) => reject(makeErr(500, 'DB_REQUEST_FAILED', e.message)));
    req.on('timeout', () => req.destroy(makeErr(504, 'DB_TIMEOUT', '数据库查询超时')));
    req.end(body);
  });
}

module.exports = { execPg, makeErr };

/**
 * db.js — 数据库访问底层（Day 19 拆出）
 * 唯一职责：把 SQL 发到 CloudBase exec-pgsql 网关，返回行数组。
 * 不含业务 SQL，不含 HTTP 处理。
 *
 * 数据通道：POST https://{envId}.api.tcloudbasegateway.com/v1/rdb/exec-pgsql
 *   - 读（GET）：默认只读角色（已 GRANT SELECT ON favorites）
 *   - 写（POST）：显式 role=cloudbase_postgres（只读角色无 INSERT/DELETE 权限）
 * Node 16 运行时无全局 fetch，用内置 https.request。
 */
'use strict';

const ENV_ID = 'rqj-2006-d0gl1ael531a243a1';
const GW_HOST = ENV_ID + '.api.tcloudbasegateway.com';
const API_KEY = process.env.CB_API_KEY;

function makeErr(status, code, message) {
  const e = new Error(message);
  e.status = status;
  e.code = code;
  return e;
}

/** 调 exec-pgsql（成功 → 直接返回行数组；失败 → reject，e.code 保留 DB 错误码，如 23505 唯一冲突） */
function execPg(sql, parameters, role) {
  return new Promise((resolve, reject) => {
    if (!API_KEY) return reject(makeErr(500, 'DB_NOT_CONFIGURED', '服务器开小差了，稍后再试', '云函数缺少 CB_API_KEY 环境变量'));
    const body = JSON.stringify(Object.assign({ sql, parameters: parameters || [] }, role ? { role: role } : {}));
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
        // 网关错误形状：HTTP >= 400 或顶层 { code, message }（如 23505 唯一冲突）
        if (res.statusCode >= 400 || (parsed && parsed.code)) {
          const code = (parsed && parsed.code) || ('HTTP_' + res.statusCode);
          // Day 23：数据库原始报错只进 detail（日志用），对外文案由入口层统一成中文兜底
          const internal = (parsed && parsed.message) || ('HTTP ' + res.statusCode);
          return reject(makeErr(500, code, internal, internal));
        }
        resolve(parsed);
      });
    });
    req.on('error', (e) => reject(makeErr(500, 'DB_REQUEST_FAILED', '数据库连接失败', e.message)));
    req.on('timeout', () => req.destroy(makeErr(504, 'DB_TIMEOUT', '数据库查询超时')));
    req.end(body);
  });
}

module.exports = { execPg, makeErr };

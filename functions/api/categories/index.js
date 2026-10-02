/**
 * CloudBase 云函数：GET /api/categories
 * Day 17 — 分类列表 + 每类卡片数（cards 表 GROUP BY 聚合，契约 §1.3）
 * 分类是 6 个固定常量：LEFT JOIN 保证 count=0 的分类也返回、顺序稳定
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

exports.main = async (event) => {
  try {
    if (event && event.httpMethod && event.httpMethod === 'OPTIONS') {
      return { statusCode: 204, headers: {}, body: '' };
    }
    if (event && event.httpMethod && event.httpMethod !== 'GET') {
      return json(405, { ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: '只支持 GET' } });
    }
    // 6 个固定分类（契约 §1.3 常量）LEFT JOIN 聚合计数；COUNT 无参数，纯静态 SQL
    const rows = await execPg(
      "SELECT c.id, c.name, COALESCE(t.n, 0) AS count " +
        "FROM (VALUES ('labor','劳动类'), ('consume','消费类'), ('loan','借贷类'), " +
        "('marriage','婚姻家庭类'), ('traffic','交通类'), ('neighbor','邻里 / 名誉类')) AS c(id, name) " +
        "LEFT JOIN (SELECT category_id, count(*) AS n FROM cards WHERE status = 'published' GROUP BY category_id) t " +
        "ON t.category_id = c.id " +
        "ORDER BY c.id"
    , []);
    return json(200, { ok: true, data: (rows || []).map(r => ({ ...r, count: Number(r.count) })) });
  } catch (e) {
    return json(e.status || 500, {
      ok: false,
      error: { code: e.code || 'INTERNAL', message: e.message || '服务内部错误' }
    });
  }
};

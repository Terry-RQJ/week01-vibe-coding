'use strict';
/**
 * CloudBase HTTP 函数启动脚本（被 scf_bootstrap 调起的 Node 进程）
 * 在容器内启动 HTTP 服务器监听 9000 端口
 * 每收到请求 → 构造 event → 调 exports.main → 返回响应
 */
const http = require('http');
const handler = require('./index.js');

const PORT = 9000;

const server = http.createServer(async (req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', async () => {
    try {
      const url = new URL(req.url, 'http://x');
      const event = {
        httpMethod: req.method,
        path: req.url,
        headers: req.headers,
        queryStringParameters: Object.fromEntries(url.searchParams),
        body: body || null,
      };
      const context = {};
      const result = await handler.main(event, context);
      res.statusCode = result.statusCode || 200;
      Object.entries(result.headers || {}).forEach(([k, v]) => res.setHeader(k, v));
      res.end(result.body || '');
    } catch (err) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: { code: 'INTERNAL', message: String(err && err.message || err) } }));
    }
  });
});

server.listen(PORT, () => {
  console.log(`HTTP function listening on ${PORT}`);
});
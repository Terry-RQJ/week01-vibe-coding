/**
 * Day 23 本地冒烟：三类错误提示统一验证（不联网，直接调 mock event）
 *   ① 输入错：非法参数 / 缺字段 / 不存在的资源
 *   ② 网络错：模拟数据库超时 / 连接失败
 *   ③ 服务端错：模拟数据库未配置 / 内部异常
 */
'use strict';

const path = require('path');
const ROOT = path.join(__dirname, 'functions', 'api');

function load(fnDir) {
  delete require.cache[require.resolve(path.join(ROOT, fnDir, 'index.js'))];
  return require(path.join(ROOT, fnDir, 'index.js'));
}

const R = [];
function show(label, expected, res) {
  let body;
  try { body = JSON.parse(res.body); } catch (e) { body = res.body; }
  const kind = body && body.error && body.error.kind;
  const msg = body && body.error && body.error.message;
  // 检查文案是否含中文（三类都应含）
  const cn = /[\u4e00-\u9fa5]/.test(String(msg || ''));
  // 检查是否泄露英文技术词
  const leak = /relation|constraint|duplicate key|syntax error|ECONNREFUSED|does not exist|undefined|null/i.test(String(msg || ''));
  const ok = res.statusCode === expected && cn && !leak;
  R.push({ label, status: res.statusCode, expected, kind, msg, cn, leak, ok });
  console.log((ok ? '  [PASS] ' : '  [FAIL] ') + label
    + ' | ' + res.statusCode + ' | kind=' + kind + ' | ' + msg);
}

async function main() {
  console.log('════ Day 23 三类错误提示冒烟 ════\n');

  console.log('【① 输入错】');
  const cards = load('cards');
  show('category 非法', 400, await cards.main({
    httpMethod: 'GET', path: '/api/cards', queryStringParameters: { category: 'hack' } }));
  show('limit 越界', 400, await cards.main({
    httpMethod: 'GET', path: '/api/cards', queryStringParameters: { limit: '999' } }));
  show('slug 不存在', 404, await cards.main({
    httpMethod: 'GET', path: '/api/cards', queryStringParameters: { slug: 'no-such-card-xyz' } }));
  show('方法不支持', 405, await cards.main({
    httpMethod: 'POST', path: '/api/cards', queryStringParameters: {} }));

  const fav = load('favorites');
  show('缺 slug', 400, await fav.main({
    httpMethod: 'POST', path: '/api/favorites', body: JSON.stringify({ on: true }) }));
  show('body 非法 JSON', 400, await fav.main({
    httpMethod: 'POST', path: '/api/favorites', body: '{not json' }));
  show('PATCH 缺 id', 400, await fav.main({
    httpMethod: 'PATCH', path: '/api/favorites', queryStringParameters: {}, body: JSON.stringify({ note: 'x' }) }));
  show('PATCH 改未知字段', 400, await fav.main({
    httpMethod: 'PATCH', path: '/api/favorites', queryStringParameters: { id: '1' },
    body: JSON.stringify({ card_slug: 'hack' }) }));
  show('DELETE 不存在的 id', 404, await fav.main({
    httpMethod: 'DELETE', path: '/api/favorites', queryStringParameters: { id: '99999999' } }));

  const health = load('health');
  show('health 方法不支持', 405, await health.main({ httpMethod: 'POST', path: '/api/health' }));

  console.log('\n【② 网络错 / ③ 服务端错】（用 errors.js 直接构造，模拟通道异常）');
  const { makeErr, toErrorResponse } = require(path.join(ROOT, 'common', 'errors.js'));
  const netErr = makeErr(504, 'DB_TIMEOUT', '数据库查询超时', 'ETIMEDOUT 10.0.0.1:5432');
  show('数据库超时', 504, toErrorResponse(netErr));

  const netErr2 = makeErr(500, 'DB_REQUEST_FAILED', '数据库连接失败', 'ECONNREFUSED ::1:443');
  show('连接失败', 500, toErrorResponse(netErr2));

  const svrErr = makeErr(500, 'DB_NOT_CONFIGURED', '服务器开小差了，稍后再试', 'missing CB_API_KEY');
  show('服务未配置', 500, toErrorResponse(svrErr));

  const rawErr = makeErr(500, 'DB_ERROR',
    'duplicate key value violates unique constraint "uq_favorites_active"', 'pg detail');
  show('原始英文报错被兜住', 500, toErrorResponse(rawErr));

  console.log('\n════ 汇总 ════');
  const pass = R.filter(r => r.ok).length;
  console.log(pass + ' / ' + R.length + ' 通过');
  const failed = R.filter(r => !r.ok);
  if (failed.length) {
    console.log('\n失败明细：');
    failed.forEach(r => console.log(' - ' + r.label + ' status=' + r.status + ' kind=' + r.kind
      + ' cn=' + r.cn + ' leak=' + r.leak + ' msg=' + r.msg));
    process.exitCode = 1;
  }
}

main().catch(e => { console.error('冒烟脚本自身出错：', e); process.exitCode = 1; });

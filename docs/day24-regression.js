/**
 * Day 24 回归验证清单（本地冒烟，不联网）
 * 覆盖：修复的 3 个 Bug + 原有功能不回归
 * 运行：node docs/day24-regression.js
 *
 * 说明：本地没有 CB_API_KEY，凡是通过校验进入数据库层的用例都会得到
 *   500 DB_NOT_CONFIGURED —— 这恰好证明「校验已通过、走进了 DB」；
 *   真实验证在线上跑（docs/day24-verify-online.py）。
 *   另有少量用例故意传不存在的 id，本地一律 500（同因）。
 */
'use strict';

const path = require('path');
const ROOT = path.join(__dirname, '..', 'functions', 'api');

function load(d) {
  delete require.cache[require.resolve(path.join(ROOT, d, 'index.js'))];
  return require(path.join(ROOT, d, 'index.js'));
}

const R = [];
function pad(s, n) {
  s = String(s);
  // 中文按 2 个宽度估算
  let w = 0;
  for (const ch of s) w += /[\u4e00-\u9fa5\uff00-\uffef]/.test(ch) ? 2 : 1;
  return s + ' '.repeat(Math.max(0, n - w));
}

function check(label, expectStatus, res, expectCode) {
  let b = {};
  try { b = JSON.parse(res.body); } catch (e) { /* ignore */ }
  const st = res.statusCode;
  const code = (b.error && b.error.code) || (b.ok ? 'OK' : '-');
  const msg = (b.error && b.error.message) || '';
  let ok = st === expectStatus;
  if (expectCode && code !== expectCode) ok = false;
  R.push({ label, st, code, ok });
  console.log('%s %s HTTP %s   code=%s   %s',
    ok ? '[PASS]' : '[FAIL]', pad(label, 46), pad(String(st), 5), pad(code, 22), msg.slice(0, 40));
}

async function main() {
  console.log('════ Day 24 回归验证清单 ════\n');
  const fav = load('favorites');

  console.log('【Bug 1 回归：body 非对象不再 500】');
  for (const [lab, raw] of [
    ['body = null', 'null'],
    ['body = 数字 123', '123'],
    ['body = 字符串 "abc"', '"abc"'],
    ['body = 布尔 true', 'true'],
    ['body = 数组 [1,2]', '[1,2]'],
  ]) {
    check(lab, 400, await fav.main({
      httpMethod: 'PATCH', path: '/api/favorites', queryStringParameters: { id: '31' }, body: raw
    }), 'INVALID_BODY');
  }
  check('body = 非法 JSON（回归不破）', 400, await fav.main({
    httpMethod: 'PATCH', path: '/api/favorites', queryStringParameters: { id: '31' }, body: '{bad'
  }), 'INVALID_BODY');
  check('body = 合法对象（正常路径，进 DB 即算通过）', 500, await fav.main({
    httpMethod: 'PATCH', path: '/api/favorites', queryStringParameters: { id: '31' }, body: '{"note":"x"}'
  }), 'DB_NOT_CONFIGURED');   // 本地无 Key；能报 DB_NOT_CONFIGURED 说明请求体校验已通过

  console.log('\n【Bug 2 回归：id 严格十进制】');
  for (const bad of ['1e2', '+1', '0x10', '1.5', '0', '-1', 'abc', '1_0', 'Infinity']) {
    check('id = ' + bad, 400, await fav.main({
      httpMethod: 'PATCH', path: '/api/favorites', queryStringParameters: { id: bad }, body: '{"note":"x"}'
    }), 'INVALID_PARAM');
  }
  check('id 缺失', 400, await fav.main({
    httpMethod: 'PATCH', path: '/api/favorites', queryStringParameters: {}, body: '{"note":"x"}'
  }), 'MISSING_FIELD');
  check('id = 31（正常）', 500, await fav.main({
    httpMethod: 'PATCH', path: '/api/favorites', queryStringParameters: { id: '31' }, body: '{"note":"x"}'
  }), 'DB_NOT_CONFIGURED');

  console.log('\n【Bug 3 回归：note 长度按码点（emoji 不再被误拒）】');
  check('200 汉字（边界内）', 500, await fav.main({
    httpMethod: 'PATCH', path: '/api/favorites', queryStringParameters: { id: '31' },
    body: JSON.stringify({ note: '中'.repeat(200) })
  }), 'DB_NOT_CONFIGURED');
  check('200 个 emoji（码点=200，应通过）', 500, await fav.main({
    httpMethod: 'PATCH', path: '/api/favorites', queryStringParameters: { id: '31' },
    body: JSON.stringify({ note: '😀'.repeat(200) })
  }), 'DB_NOT_CONFIGURED');
  check('201 汉字（越界）', 400, await fav.main({
    httpMethod: 'PATCH', path: '/api/favorites', queryStringParameters: { id: '31' },
    body: JSON.stringify({ note: '中'.repeat(201) })
  }), 'INVALID_PARAM');
  check('201 个 emoji（码点=201，越界）', 400, await fav.main({
    httpMethod: 'PATCH', path: '/api/favorites', queryStringParameters: { id: '31' },
    body: JSON.stringify({ note: '😀'.repeat(201) })
  }), 'INVALID_PARAM');

  console.log('\n【原有功能不回归】');
  check('PATCH 白名单（改 card_slug）', 400, await fav.main({
    httpMethod: 'PATCH', path: '/api/favorites', queryStringParameters: { id: '31' }, body: '{"card_slug":"hack"}'
  }), 'INVALID_PARAM');
  check('POST 缺 slug', 400, await fav.main({
    httpMethod: 'POST', path: '/api/favorites', body: '{"on":true}'
  }), 'MISSING_FIELD');
  check('DELETE 缺 id', 400, await fav.main({
    httpMethod: 'DELETE', path: '/api/favorites', queryStringParameters: {}
  }), 'MISSING_FIELD');
  check('方法不支持', 405, await fav.main({
    httpMethod: 'PUT', path: '/api/favorites'
  }), 'METHOD_NOT_ALLOWED');

  const cards = load('cards');
  check('cards category 非法', 400, await cards.main({
    httpMethod: 'GET', path: '/api/cards', queryStringParameters: { category: 'hack' }
  }), 'INVALID_PARAM');
  check('cards 方法不支持', 405, await cards.main({
    httpMethod: 'POST', path: '/api/cards'
  }), 'METHOD_NOT_ALLOWED');

  const health = load('health');
  check('health 方法不支持', 405, await health.main({ httpMethod: 'POST', path: '/api/health' }), 'METHOD_NOT_ALLOWED');

  console.log('\n════ 汇总 ════');
  const p = R.filter(r => r.ok).length;
  console.log(p + ' / ' + R.length + ' 通过');
  if (p !== R.length) {
    R.filter(r => !r.ok).forEach(r => console.log('  FAIL:', r.label, 'status=' + r.st, 'code=' + r.code));
    process.exitCode = 1;
  }
}

main().catch(e => { console.error('脚本出错：', e); process.exitCode = 1; });

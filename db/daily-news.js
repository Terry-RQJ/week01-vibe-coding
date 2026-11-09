#!/usr/bin/env node
/**
 * db/daily-news.js — 法律热点每日自动流水线（Day 44）
 *
 * 一句话：抓官方源 → 挑与普通人有关的 → 生成「这跟你有啥关系」解读 → 合规校验 → 入库上线 → 记台账。
 *
 * 用法：
 *   node db/daily-news.js --feed fetched.json            # 用外部抓好的条目（推荐：内容由 AI 检索后落盘）
 *   node db/daily-news.js --feed fetched.json --dry-run  # 只看会入库什么，不写库
 *   node db/daily-news.js --publish-only --ids 12,13     # 把指定 id 置为上线
 *
 * ── 为什么分成「抓取」和「入库」两步 ──
 * 用户的诉求是「每天自己更新 + 有解读」。抓取（读网页）和写解读（理解+判断）是两种能力：
 * 脚本能可靠地做后者（校验、去重、入库、台账），前者交给检索能力每天跑一次，产出 JSON。
 * 这样流水线稳定可重跑，抓取失败也不会把库写坏——失败只记一条 status='failed' 的台账。
 *
 * ── 解读的合规底线（写死在 validateTakeaway 里，不由模型自由发挥）──
 *   ① 60–200 字，必须给「对普通人意味着什么」，不能只是复述新闻
 *   ② 不得出现「建议你起诉/一定能赔/包赢」这类许诺式表述
 *   ③ 不得出现具体金额承诺、不得直接给个案结论
 *   ④ 必须至少命中一个「生活场景词」，否则说明对普通人没用，退回
 * 校验不过的条目**不入库**，并写明原因——宁可今天少一条，也不上一条看不懂或会误导的。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync, spawnSync } = require('child_process');

const ENV_ID = 'rqj-2006-d0gl1ael531a243a1';
const GATEWAY = 'https://' + ENV_ID + '.api.tcloudbasegateway.com/v1/rdb/exec-pgsql';
const ROOT = path.resolve(__dirname, '..');

/* ---------- 参数 ---------- */
const argv = process.argv.slice(2);
function arg(name, def) {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
}
const FEED = arg('feed', '');
const DRY = argv.includes('--dry-run');
const PUBLISH_ONLY = argv.includes('--publish-only');
const IDS = arg('ids', '');
const AUTO_PUBLISH = !argv.includes('--manual'); // 默认自动上线；--manual 则落候选等人工

/* ---------- 工具 ---------- */
function log(s) { console.log(s); }

function readKey() {
  const k = process.env.CB_API_KEY;
  if (k) return k.trim();
  const p = path.join(ROOT, '.tmp-key.txt');
  if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8').trim();
  throw new Error('缺少 CB_API_KEY（环境变量或 .tmp-key.txt）');
}

/** 写操作走 tcb CLI（网关 exec-pgsql 是只读事务，UPDATE/INSERT 会报 DATABASE_25006） */
function tcbSql(sql) {
  const node = process.execPath;
  const js = path.join(os.homedir(),
    '.workbuddy/binaries/node/workspace/node_modules/@cloudbase/cli/bin/tcb');
  const argv2 = [js, 'db', 'execute', '-e', ENV_ID, '--sql', sql, '--json'];
  const r = spawnSync(node, argv2, { encoding: 'buffer', timeout: 120000, maxBuffer: 8 * 1024 * 1024 });
  const out = Buffer.concat([r.stdout || Buffer.alloc(0), r.stderr || Buffer.alloc(0)]).toString('utf8');
  if (/"error"/i.test(out) || (r.status !== 0 && !/AffectedRows/.test(out))) {
    throw new Error('SQL 失败: ' + out.slice(0, 400));
  }
  return out;
}

/** 只读查询走网关（快、无 CLI 启动开销） */
function query(sql, params) {
  const body = JSON.stringify({ sql: sql, parameters: params || [] });
  const r = spawnSync('curl', ['-s', '--max-time', '25', '-X', 'POST', GATEWAY,
    '-H', 'Content-Type: application/json',
    '-H', 'Authorization: Bearer ' + readKey(),
    '-d', body], { encoding: 'utf8', timeout: 40000 });
  try {
    const j = JSON.parse(r.stdout);
    if (j.code) throw new Error(j.message || j.code);
    return j;
  } catch (e) {
    throw new Error('查询失败: ' + (r.stdout || e.message).slice(0, 300));
  }
}

function sq(s) {
  if (s === null || s === undefined) return 'NULL';
  return "'" + String(s).replace(/'/g, "''") + "'";
}
function today() {
  // 用上海时区，避免 23:00 抓的在库里算成昨天
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

/* ---------- 合规校验：解读 ---------- */
const BANNED = [
  /一定(能|会)(赢|赔|胜诉)/, /包赢/, /百分百/, /保证(你)?(赢|胜诉)/,
  /必须(立刻|马上)(起诉|报警)/, /我建议你(起诉|离婚|报警)/,
  /(赔|要回|拿到)[0-9０-９]+\s*(元|万)/
];
const SCENE_WORDS = ['你', '咱们', '普通人', '打工人', '租客', '业主', '消费者', '家长', '老人', '车主',
  '上班', '租房', '买房', '买东西', '网购', '看病', '养老', '养孩子', '开车', '借钱', '签合同', '入职', '离职'];

function validateTakeaway(t) {
  const s = String(t || '').trim();
  if (!s) return '解读为空';
  const len = Array.from(s).length;
  if (len < 60) return '解读太短（' + len + ' 字，需 ≥60）';
  if (len > 200) return '解读太长（' + len + ' 字，需 ≤200）';
  for (const re of BANNED) {
    if (re.test(s)) return '含许诺/结论式表述：' + re;
  }
  if (!SCENE_WORDS.some(w => s.includes(w))) return '没有落到普通人的生活场景（缺场景词）';
  return '';
}

function validateItem(it) {
  const need = { title: '标题', summary: '摘要', sourceName: '来源', takeaway: '解读' };
  for (const k in need) {
    if (!String(it[k] || '').trim()) return '缺' + need[k];
  }
  if (Array.from(it.title).length > 255) return '标题超长';
  if (Array.from(it.summary).length < 20) return '摘要太短（<20 字）';
  if (Array.from(it.summary).length > 300) return '摘要太长（>300 字）';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(it.newsDate || '')) return '日期格式须为 YYYY-MM-DD';
  if (it.sourceUrl && !/^https?:\/\//.test(it.sourceUrl)) return '来源链接非法';
  return validateTakeaway(it.takeaway);
}

/* ---------- 台账 ---------- */
function recordRun(found, added, status, note) {
  const sql = 'INSERT INTO news_runs (run_date, source, found, added, status, note) VALUES (' +
    sq(today()) + ', ' + sq(arg('source', 'maxsearch')) + ', ' + Number(found || 0) + ', ' +
    Number(added || 0) + ', ' + sq(status) + ', ' + sq(note || '') + ')';
  if (DRY) { log('[dry-run] 台账: ' + sql); return; }
  tcbSql(sql);
}

/* ---------- 主流程 ---------- */
function publishOnly() {
  const ids = IDS.split(',').map(x => parseInt(x, 10)).filter(Boolean);
  if (!ids.length) throw new Error('--publish-only 需要 --ids 1,2,3');
  const sql = 'UPDATE news SET status = ' + sq('published') + ', published_at = now() WHERE id IN (' + ids.join(',') + ')';
  if (DRY) { log('[dry-run] ' + sql); return; }
  const out = tcbSql(sql);
  const m = /"AffectedRows":\s*(\d+)/.exec(out);
  log('已上线 ' + (m ? m[1] : '?') + ' 条');
}

/**
 * 关联卡自动挂接：新闻标题/摘要里出现卡片的 tags 或标题关键词 → 挂最近的卡。
 * 为什么不让人工一条条指定：每天 3–6 条，人工迟早会漏；而挂错卡的代价（点进去发现不相关）
 * 比不挂更大，所以要求**至少命中 2 个关键词**才算数。
 */
function autoMatchCard(item, cards) {
  const text = (item.title || '') + ' ' + (item.summary || '');
  let best = null, bestScore = 0;
  for (const c of cards) {
    let score = 0;
    const words = [].concat(c.tags || [], [c.title || '']);
    for (const w of words) {
      const kw = String(w).trim();
      if (kw.length >= 2 && text.includes(kw)) score += 1;
    }
    if (score > bestScore) { bestScore = score; best = c; }
  }
  return bestScore >= 2 ? best.slug : null;
}

function loadCards() {
  try {
    const src = fs.readFileSync(path.join(ROOT, 'data', 'cards.js'), 'utf8');
    // 文件里有 LAW_CARDS 和 LAW_CATEGORIES 两个数组，必须只取第一个
    // （取 [ … 最后一个 ] 会把 categories 也包进来，JSON.parse 直接失败）
    const start = src.indexOf('window.LAW_CARDS');
    const open = src.indexOf('[', start);
    const close = src.indexOf('\n];', open);
    return JSON.parse(src.slice(open, close + 2));
  } catch (e) {
    log('⚠ 读不到 data/cards.js（' + e.message + '），关联卡自动挂接跳过');
    return [];
  }
}

function run() {
  if (PUBLISH_ONLY) { publishOnly(); return; }

  if (!FEED || !fs.existsSync(FEED)) {
    recordRun(0, 0, 'failed', '没有提供抓取文件 --feed');
    throw new Error('请用 --feed <json> 传入抓取结果；本次已记一条 failed 台账');
  }
  const raw = JSON.parse(fs.readFileSync(FEED, 'utf8'));
  const items = Array.isArray(raw) ? raw : (raw.items || []);
  log('抓到 ' + items.length + ' 条，开始校验…');

  // 已有标题（最近 30 天）用于去重：同一件事第二天又被不同媒体报一次，不该重复上
  const existing = query(
    "SELECT title FROM news WHERE news_date >= (CURRENT_DATE - INTERVAL '30 days')");
  const seen = new Set((existing || []).map(r => r[0] + '|' + String(r[1]).replace(/\s/g, '')));

  const cards = loadCards();
  const ok = [], skipped = [];

  for (const it of items) {
    const item = {
      newsDate: it.newsDate || today(),
      title: (it.title || '').trim(),
      summary: (it.summary || '').trim(),
      takeaway: (it.takeaway || '').trim(),
      sourceName: (it.sourceName || '').trim(),
      sourceUrl: (it.sourceUrl || '').trim(),
      relatedCardSlug: it.relatedCardSlug || null
    };
    if (!item.relatedCardSlug) item.relatedCardSlug = autoMatchCard(item, cards);

    const why = validateItem(item);
    if (why) { skipped.push({ title: item.title, why }); continue; }
    if (seen.has(item.newsDate + '|' + item.title.replace(/\s/g, ''))) {
      skipped.push({ title: item.title, why: '重复（同期已有）' }); continue;
    }
    ok.push(item);
  }

  skipped.forEach(s => log('  ✗ ' + s.title.slice(0, 28) + ' —— ' + s.why));
  log('通过 ' + ok.length + ' 条');

  if (!ok.length) {
    recordRun(items.length, 0, 'partial', '全部未通过校验：' + skipped.map(s => s.why).join('；').slice(0, 300));
    log('没有可入库的条目');
    return;
  }

  const status = AUTO_PUBLISH ? 'published' : 'candidate';
  const values = ok.map(it => '(' + [
    sq(it.newsDate), sq(it.title), sq(it.summary), sq(it.takeaway), sq(it.sourceName),
    sq(it.sourceUrl || null), sq(it.relatedCardSlug), sq(status),
    AUTO_PUBLISH ? 'now()' : 'NULL'
  ].join(', ') + ')').join(',\n');

  const sql = 'INSERT INTO news (news_date, title, summary, takeaway, source_name, source_url, ' +
    'related_card_slug, status, published_at) VALUES\n' + values +
    '\nON CONFLICT (news_date, title) DO NOTHING';

  if (DRY) {
    log('[dry-run] 将执行：\n' + sql);
    recordRun(items.length, ok.length, 'ok', 'dry-run');
    return;
  }

  const out = tcbSql(sql);
  const m = /"AffectedRows":\s*(\d+)/.exec(out);
  const added = m ? Number(m[1]) : 0;
  recordRun(items.length, added, 'ok', AUTO_PUBLISH ? '自动上线' : '落候选等确认');
  log('入库 ' + added + ' 条（' + (AUTO_PUBLISH ? '已自动上线' : '候选待确认') + '）');

  ok.forEach(it => log('  ✓ ' + it.newsDate + ' ' + it.title.slice(0, 30) +
    (it.relatedCardSlug ? '  → ' + it.relatedCardSlug : '')));
}

try {
  run();
} catch (e) {
  console.error('✗ ' + e.message);
  process.exit(1);
}

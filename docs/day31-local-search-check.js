/* docs/day31-local-search-check.js —— 搜索相关度回归（Day 31 建，常驻资产，非临时脚本）
 *
 * 盯两件事：
 *   ① 假命中 —— 内容库里没有的场景（搬家公司/医疗纠纷…）不该搜出一屏不相干的卡
 *   ② 前后端一致性 —— js/store.js 的离线算法 与 云函数 cardsRepository.listApprox 的 SQL
 *      规则必须等价。两者是两份独立实现（前端要能在断网时兜底），
 *      改一边忘另一边就会变成「有网一个结果、没网另一个结果」。
 *
 * 用法：
 *   node docs/day31-local-search-check.js             # 本地 + 线上全跑
 *   node docs/day31-local-search-check.js --local     # 只跑本地（改完先自测，快）
 *
 * 判读标准：
 *   组 A 假命中 0 / 组 B 漏召回 0 / 前后端不一致 0
 * 任何一项不为 0 就是回归失败（退出码 1）。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const API_BASE = 'https://rqj-2006-d0gl1ael531a243a1-1497985433.ap-shanghai.app.tcloudbase.com/api';
const ONLY_LOCAL = process.argv.indexOf('--local') !== -1;

// 把 Node 原生 fetch 留一份：loadStoreOffline() 会把 global.fetch 换成「必然失败」的桩，
// 后面打线上 API 还得用真的。
const REAL_FETCH = global.fetch;

/* 组 A：内容库里确实没有这些场景，理想是 0 条、干净地落到空态推荐。
 * 这一组是 Day 31 修复的直接目标——修复前 15/15 全部假命中，
 * 「搬家公司」召回 24 张裁员卡、「装修合同」召回 50 张。 */
const FAKE = [
  '搬家公司', '快递丢了', '快递损坏', '虚拟财产', '租房中介',
  '装修合同', '群租房', '冒名办公司', '医疗纠纷', '游戏充值',
  '快递代收', '打球受伤', '身份证被冒用', '劳务派遣', '账号被封'
];

/* 组 A 的已知残留：这 2 个词各会召回 1 条，判定为可接受，不进失败统计。
 *
 * 为什么不再往下修：它们和「搬家公司」在统计特征上完全无法区分——
 * 都是 4~6 字短词、都只命中 1~2 个片段，区别只在语义（「合同」「身份证」算不算相关），
 * 而区分语义需要引入中文分词或 IDF 加权。收益是少 2 条近似联想，
 * 代价是给搜索加一层黑盒、且会对这 15 个探针词过拟合。
 * 且残留的都只有 1 条结果，用户一眼可辨；而修复前是 24~50 条无关卡，两者不是一个量级。
 *
 * 判据：若哪天这里某个词召回了 2 条以上，说明算法退化，脚本会把它重新计入失败。 */
const FAKE_KNOWN = { '装修合同': 1, '身份证被冒用': 1 };

/* 组 B：必须能搜到、且首条要相关。
 * 存在的理由：门槛收严过头会误伤正常搜索——这一组是防止「为了消灭假命中把搜索改废」的护栏。
 *
 * 分两部分：
 *   ① 长句（带「怎么办」这类尾巴）：通用片段表最容易在这里出事
 *   ② Day 31 收严门槛后真实退化过的 5 个词（见 TIGHTENED 注释）——留作回归护栏 */
const GOOD = [
  '加班费', '押金', '公司不给加班费怎么办', '老板拖欠我工资',
  '被车撞了怎么赔', '楼上噪音太大怎么办', '房东不退我押金',
  '买到过期食品怎么赔', '离婚房子怎么分', '朋友借钱不还怎么办',
  '借条', '工伤', '遛狗不拴绳', '家暴'
];

/* Day 31 收严门槛后真实退化过的 5 个词：原本 Day 30 能做到 142/142 全覆盖，
 * 收严后这 5 个从「能搜到」变成「搜不到」，而其中 4 个内容库里确实有对应卡片。
 * 根因不是门槛太严，而是 tags 别名覆盖不足（Day 30 定过「tags 兼作口语别名」）：
 *   · 年卡卡补了「退卡」「美容院」→ 办卡退卡 / 美容院跑路 各凑够 2 个片段
 *   · 会员续费卡补了「会员卡」    → 会员 + 员卡 两个片段
 *   · 车位卡补了「占车位」        → 整串 + 车位
 *   · 房产加名：内容库真没有，新增了一张卡
 * 这 5 个词现在是护栏——以后再动搜索算法，它们必须仍然能搜到。 */
const TIGHTENED = ['办卡退卡', '会员卡', '美容院跑路', '房产加名', '占车位'];

/* ---------- 1. 在 Node 里造一个浏览器环境，加载真实的 js/store.js ---------- */

function loadStoreOffline() {
  const sandboxWindow = {};
  global.window = sandboxWindow;
  global.localStorage = { getItem: () => null, setItem: () => {} };
  global.location = { search: '' };
  // 关键：让 fetch 直接失败，逼 Store 走 data/cards.js 的本地检索分支。
  // 我们要测的就是这条离线路径。
  //
  // 坑（Day 31 踩过）：store.js 里是 `if (!window.fetch)` 检查、却调用**裸** fetch(...)。
  // 只 stub 掉 window.fetch 的话，Node 22 的全局 fetch 会顶上来，把请求真发到线上——
  // 于是「本地测试」跑的其实是线上结果，数字对不上还以为是算法写错了。
  // 所以 window.fetch 和 global.fetch 必须一起 stub。
  const offlineFetch = () => Promise.reject(new Error('离线测试：强制走本地回落'));
  sandboxWindow.fetch = offlineFetch;
  global.fetch = offlineFetch;

  const load = (rel) => {
    const code = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    // eslint-disable-next-line no-new-func
    new Function('window', 'localStorage', 'location', code)(
      sandboxWindow, global.localStorage, global.location
    );
  };
  load('data/cards.js');
  if (fs.existsSync(path.join(ROOT, 'data/categories.js'))) load('data/categories.js');
  load('js/store.js');
  return sandboxWindow.Store;
}

// 本地路径有 600ms 的模拟延迟（MOCK_DELAY），串行跑 29 个词会等 17 秒，
// 所以这里直接并发发起，靠 Promise.all 一次性等。
function searchLocal(Store, kw) {
  return Store.searchCards(kw).then((r) => (r && r.cards) || []);
}

/* ---------- 2. 线上：打真实 API ---------- */

function searchOnline(kw) {
  const url = API_BASE + '/cards?keyword=' + encodeURIComponent(kw) + '&limit=50';
  // 线上信封是 { ok, data:[卡片...], meta:{...} }——data 本身就是卡片数组，不是 { cards }
  return REAL_FETCH(url, { method: 'GET' })
    .then((r) => r.json())
    .then((j) => (j && j.ok === true && Array.isArray(j.data) ? j.data : []))
    .catch(() => null); // 网络不通返回 null，脚本会标注「线上未测」而不算失败
}

const slugList = (cards) => cards.map((c) => c.slug);
const firstTitle = (cards) => (cards.length ? cards[0].title : '（无）');

function pad(str, width) {
  // 中文按 2 个字符宽算，不然表格会歪
  let w = 0;
  for (const ch of String(str)) w += /[\u4e00-\u9fa5（）【】]/.test(ch) ? 2 : 1;
  return String(str) + ' '.repeat(Math.max(0, width - w));
}

(async function main() {
  const Store = loadStoreOffline();
  const words = [].concat(
    FAKE.map((w) => ({ w: w, group: 'A' })),
    GOOD.map((w) => ({ w: w, group: 'B' })),
    TIGHTENED.map((w) => ({ w: w, group: 'C' }))
  );

  // ⚠️ 坑（Day 31 踩过）：别用 `await Promise.all(arr.map(x => fn(x).then(r => out.push(r))))`
  // 收集结果——push 的顺序是**完成顺序**，不是请求顺序。并发请求延迟参差时数组会被打乱，
  // 于是「第 i 个词」对上的是「第 i 个返回的结果」，前后端一致性校验全线飘红，
  // 看起来像算法写错了，其实是比对错了行。Promise.all 本身保证按入参顺序返回，直接用它。
  const localResults = await Promise.all(words.map((x) => searchLocal(Store, x.w)));
  const onlineResults = ONLY_LOCAL
    ? []
    : await Promise.all(words.map((x) => searchOnline(x.w)));

  let fakeHits = 0, missed = 0, mismatch = 0, onlineUntested = 0;

  console.log('');
  console.log('===== 组 A · 假命中词（期望 0 条，干净地落到空态推荐）=====');
  words.forEach((x, i) => {
    if (x.group !== 'A') return;
    const loc = localResults[i];
    const onl = onlineResults[i];
    // 已知残留：召回条数未超过登记的上限就不算失败，但仍打印出来，退化时立刻可见
    const quota = FAKE_KNOWN[x.w] || 0;
    const bad = loc.length > quota;
    if (bad) fakeHits++;
    const tag = bad ? '✗假命中' : (quota ? '· 残留 ' : '✓ 干净 ');
    console.log('  ' + tag + '  ' + pad(x.w, 18) + ' 本地 ' + pad(loc.length + ' 条', 8) +
      (loc.length ? firstTitle(loc) : ''));
    if (!onl) onlineUntested++;
    else if (onl.length !== loc.length) {
      mismatch++;
      console.log('       ⚠ 前后端不一致：线上 ' + onl.length + ' 条 / 本地 ' + loc.length + ' 条');
    }
  });

  console.log('');
  console.log('===== 组 B · 必须召回词（期望有结果，且首条相关）=====');
  words.forEach((x, i) => {
    if (x.group !== 'B') return;
    const loc = localResults[i];
    const onl = onlineResults[i];
    const bad = loc.length === 0;
    if (bad) missed++;
    const tag = bad ? '✗漏召回' : '✓ 命中 ';
    console.log('  ' + tag + '  ' + pad(x.w, 22) + ' 本地 ' + pad(loc.length + ' 条', 8) + firstTitle(loc));
    if (!onl) onlineUntested++;
    else if (onl.length !== loc.length || (loc.length && onl[0].slug !== loc[0].slug)) {
      mismatch++;
      console.log('       ⚠ 前后端不一致：线上 ' + onl.length + ' 条（首条「' + firstTitle(onl) +
        '」）/ 本地 ' + loc.length + ' 条');
    }
  });

  console.log('');
  console.log('===== 组 C · 收严门槛后退化过的词（回归护栏，必须能搜到）=====');
  words.forEach((x, i) => {
    if (x.group !== 'C') return;
    const loc = localResults[i];
    const onl = onlineResults[i];
    const bad = loc.length === 0;
    if (bad) missed++;
    const tag = bad ? '✗漏召回' : '✓ 命中 ';
    console.log('  ' + tag + '  ' + pad(x.w, 18) + ' 本地 ' + pad(loc.length + ' 条', 8) + firstTitle(loc));
    if (!onl) onlineUntested++;
    else if (onl.length !== loc.length || (loc.length && onl[0].slug !== loc[0].slug)) {
      mismatch++;
      console.log('       ⚠ 前后端不一致：线上 ' + onl.length + ' 条（首条「' + firstTitle(onl) +
        '」）/ 本地 ' + loc.length + ' 条');
    }
  });

  console.log('');
  console.log('================================================================');
  console.log('组 A 假命中：        ' + fakeHits + ' / ' + FAKE.length +
    '   （目标 0；已登记 ' + Object.keys(FAKE_KNOWN).length + ' 条已知残留）');
  console.log('组 B 漏召回：        ' + missed + ' / ' + (GOOD.length + TIGHTENED.length) + '   （目标 0）');
  console.log('前后端结果不一致：   ' + mismatch + ' / ' + words.length +
    (ONLY_LOCAL || onlineUntested ? '   （线上未测 ' + onlineUntested + ' 个词）' : '   （目标 0）'));
  console.log('================================================================');

  const ok = fakeHits === 0 && missed === 0 && mismatch === 0;
  console.log(ok ? '✅ 通过' : '❌ 回归失败');
  process.exit(ok ? 0 : 1);
})();

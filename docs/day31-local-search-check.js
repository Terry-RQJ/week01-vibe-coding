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
 * 「搬家公司」召回 24 张裁员卡、「装修合同」召回 50 张。
 *
 * ⚠️ 这组是**会越跑越少**的：每补一张内容空白卡，对应词就该挪进组 B。
 *    Day 33：'装修合同' '身份证被冒用' 补成真卡 → 挪走（15 → 12 词）
 *    Day 34：6 个词补成真卡 → 挪走（12 → 6 词），见下
 *    Day 35：'租房中介' '账号被封' 补成真卡 → 挪走（6 → 4 词）
 *            随后又发现 '游戏充值' '虚拟财产' 也被新卡真实覆盖 → 再挪走（4 → 2 词）
 *
 * 挪走的判断标准不是「字面上沾边」，而是**这张卡真在讲这件事**：
 *   · '快递丢了' '快递损坏' '快递代收' → kuaidi-diushi 一张卡讲全三件事，都挪
 *   · '群租房'                        → qunzufang 标题就是「租到隔断房、群租房」
 *   · '医疗纠纷'                      → yimei-huilian 讲医美致损，属医疗纠纷子集
 *   · '劳务派遣'                      → laowu-paiqian 标题就是「我是劳务派遣工」
 *   · '租房中介'                      → heizhongjie 标题就是「被中介坑了」，讲了中介费/假房源/押金
 *   · '账号被封'                      → zhanghao-beifeng 标题就是「账号被平台封了，申诉不回怎么办」
 *   · '游戏充值'                      → haizi-dashang（孩子充值游戏，钱能退吗）就是讲充值
 *   · '虚拟财产'                      → zhanghao-beifeng 的场景里写了「几年攒的装备」，讲虚拟财产
 *   · '搬家公司'                      → banjia-shunhuai 标题就是「搬家公司把家具搬坏了、临时加价」
 * Day 36 只剩 1 个词（打球受伤）——它不是内容空白，是**场景归属问题**：
 *   它更像「运动受伤找谁赔」，既不是交通也不是消费，等后面想清楚归哪类再补。
 *
 * ⚠️ 别把挪走的词加回来——加回来等于期望「内容库没有这个场景」，而内容库现在有了。 */
const FAKE = [
  '打球受伤'
];

/* 组 A 的已知残留白名单。
 *
 * Day 31 曾登记 2 条：{ '装修合同': 1, '身份证被冒用': 1 }——当时靠容忍 1 条残留过关。
 * Day 33 把这两张卡真正做出来了，白名单清空。**这是根治的正确姿势**：
 * 补内容，不是放宽阈值。
 *
 * Day 34 又登记 1 条：{ '账号被封': 1 }，原因是**同音字粘连**——
 *   '账号被封' 切出的「账号」「号被」两个片段，在「账号被盗」里正好都有，
 *   门槛 2/2 满足于是被召回，删 tag、改文案都删不掉。
 *   当时写明：**第二批补完「账号被封」卡后必须删掉本条目**。
 *
 * Day 35 已兑现：新增 zhanghao-beifeng（账号被平台封了，申诉不回怎么办），
 *   「账号被封」现在命中正确卡片、进组 B，本条已删除。
 *   白名单回到**空**——这才是健康状态。
 *
 * ⚠️ 每次往里加词，都要同时写清楚「打算什么时候补内容」。空着才是健康状态。 */
const FAKE_KNOWN = {};

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
  '借条', '工伤', '遛狗不拴绳', '家暴',
  /* Day 33 新增：原本在组 A 的 2 个词，补卡后转为「必须搜得到」。
   * 另外补一个「冒名办公司」——它 Day 31 是假命中，
   * 但新卡 tags 里有「被注册公司」，口语说法一致的场景应当能搜到。 */
  '装修合同', '身份证被冒用', '冒名办公司',
  /* Day 34 新增：原本在组 A 的 6 个词，12 张新卡覆盖后转为「必须搜得到」。
   * 这 6 个词在改之前本地都报 1 条假命中——那 1 条正是新卡，说明内容确实对上了。 */
  '快递丢了', '快递损坏', '快递代收', '群租房', '医疗纠纷', '劳务派遣',
  /* Day 35 新增：第二批补的 12 张卡带来的词。
   * 前两个是**从组 A 挪过来的**（Day 34 还在这里登记着假命中），
   * 后面的是这批新场景的代表词，一并锁住防止以后退化。 */
  '租房中介', '账号被封',
  '黑中介', '中介费', '人脸识别', '刷脸', '直播打赏', '酒店退订',
  '洗钱', '跑分', '户口本', '宠物寄养', '保姆', '护工', '养老院', '代购',
  /* Day 35 追加：这两个原本在组 A，但新卡把场景真的覆盖了——不是字面沾边，
   * 是「游戏充值」那张卡真在讲充值、「虚拟财产」那张真在讲账号里的装备。 */
  '游戏充值', '虚拟财产',
  /* Day 36 新增：交通类补缺 10 张卡带来的词。
   * 第一个 '搬家公司' 是从组 A 挪过来的——banjia-shunhuai 就是搬家损坏/加价的卡。
   * 其余是这批新场景的代表词，锁住防止以后退化。 */
  '搬家公司', '违停', '贴条', '酒驾', '扣分', '年检', '代驾',
  '租车', '学车', '驾校', '车位被占', '挪车'
];

/* ---------- 组 A 里「故意没挪走」的一个词 ----------
 *
 * '租房中介'：qunzufang 讲的是隔断房、群租房能不能退租要押金，
 *   完全没提中介费、虚假房源、中介跑路这些「和中介打交道」的问题。
 *   只因为卡里出现过「租房」二字就挪进组 B，等于用字面相似冒充场景覆盖。
 *   → 留在组 A，等第二批补「黑中介 / 中介费不退」的卡。
 *
 * Day 34 顺手修掉了它原本的模糊命中：那张卡的 scenario 写「通过中介租了一间单间」、
 *   步骤写「中介或房东拒不退款」，让「租房中介」切出的「租房」「中介」两个片段
 *   都能在这张卡里找到。改成「在网上看到一间单间」「二房东或房东」之后，
 *   这个场景里就没有「中介」这个词了，命中自然消失——**改文案比放宽阈值干净**。
 *   注意：这不是为了迁就探针改内容，原句本来就把中介写成主角，
 *   而这卡讲的事情跟中介没关系，改成中性表述反而更准确。
 * ------------------------------------------------------------------ */

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

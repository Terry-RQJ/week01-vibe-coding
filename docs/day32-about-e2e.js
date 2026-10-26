/* docs/day32-about-e2e.js — Day 32「关于页」端到端（合规 F7 / U-04）
 *
 * 覆盖：① 全站每个页面都有「关于」入口（导航 + 页脚），且能真的跳到 about.html
 *       ② 关于页 7 个板块齐全（是什么 / 免责声明 / 紧急联系 / 生产流程 / 法条出处 / 反馈 / 技术）
 *       ③ 免责声明三要素（不构成法律咨询 / 12348 / 110 / 不提供个案咨询）
 *       ④ 数字由真实数据填充（不是写死的 120+ / 260+）
 *       ⑤ 全站免责声明表述一致，且**不再出现「律师人工复核」**（合规 U-04）
 *       ⑥ 手机端 375px 导航不横向溢出（第 5 个导航项是这次新加的，重点验它）
 *       ⑦ 无 JS 时页面正文仍可读（关于页是合规页，不能被脚本卡住）
 *
 * 运行：node docs/day32-about-e2e.js            打线上
 *       node docs/day32-about-e2e.js --local    打本地 8765（需先起 http.server）
 *   截图产出 day32-about-*.png 到仓库根目录
 */
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const CWD = process.cwd();
const LOCAL = process.argv.indexOf("--local") !== -1;
const SITE = LOCAL
  ? "http://localhost:8765"
  : "https://rqj-2006-d0gl1ael531a243a1-1497985433.tcloudbaseapp.com";
const W = 1280, H = 900, DSF = 1;
const PORT = 9500 + Math.floor(Math.random() * 300);
const UDD = path.join(os.tmpdir(), "edge-day32-about-" + Date.now());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let ws, id = 0;
const pending = new Map();
let pass = 0, fail = 0;
function check(desc, ok, extra) {
  if (ok) { pass++; console.log("   [PASS] " + desc + (extra ? " ｜ " + extra : "")); }
  else { fail++; console.log("   [FAIL] " + desc + (extra ? " ｜ " + extra : "")); }
}
function send(method, params, timeoutMs) {
  return new Promise((res, rej) => {
    const mid = ++id;
    const t = setTimeout(() => {
      if (pending.delete(mid)) rej(new Error("CDP 超时（" + (timeoutMs || 60000) + "ms）：" + method));
    }, timeoutMs || 60000);
    pending.set(mid, {
      res: (v) => { clearTimeout(t); res(v); },
      rej: (e) => { clearTimeout(t); rej(e); },
    });
    ws.send(JSON.stringify({ id: mid, method, params: params || {} }));
  });
}
async function evalJs(expr) {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error("页面报错: " + JSON.stringify(r.exceptionDetails.exception || {}).slice(0, 200));
  return r.result ? r.result.value : undefined;
}
async function shot(name) {
  try {
    const s = await send("Page.captureScreenshot", { format: "png" }, 45000);
    fs.writeFileSync(path.join(CWD, name), Buffer.from(s.data, "base64"));
    console.log("   📸 " + name);
  } catch (e) {
    console.log("   ⚠ 截图跳过 " + name + "（" + e.message + "）");
  }
}
async function clickAt(x, y) {
  for (const type of ["mousePressed", "mouseReleased"]) {
    await send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1, buttons: type === "mousePressed" ? 1 : 0 });
  }
}
async function waitCond(desc, expr, timeoutMs) {
  const t0 = Date.now();
  while (Date.now() - t0 < (timeoutMs || 15000)) {
    try { if (await evalJs(expr)) return true; } catch (e) { /* 导航中会短暂报错 */ }
    await sleep(400);
  }
  console.log("   ⏱ 超时：" + desc);
  return false;
}
async function nav(url) {
  await send("Page.navigate", { url });
  await waitCond("页面加载完成", "document.readyState === 'complete'", 25000);
  await sleep(500);
}
/** CloudBase 免费版中间页（等倒计时 + 真实点击，JS .click() 无效） */
async function passGate(label) {
  if (LOCAL) return;
  for (let i = 0; i < 45; i++) {
    const st = await evalJs(`(function(){
      // ⚠️ 坑（Day 32 线上首跑踩到）：原来只靠 innerText.length > 400 判「已过中间页」，
      // 但 card.html(246字) / history.html(295字) / bookmarks.html(342字) 的**静态骨架**
      // 正文都不到 400 字——它们靠 JS 渲染后才够长。于是这三页永远被判成「还在中间页」，
      // 45 轮空转后抛「中间页一直过不去」，而页面其实早进站了。
      // 改法：中间页的特征是「几乎没有正文 + 有一个倒计时按钮」，用「正文变长 **或**
      // 本站导航栏出现」双条件判定，后者与正文长度无关，对短页面也可靠。
      var txt = document.body ? (document.body.innerText || '') : '';
      var hasNav = !!document.querySelector('.site-header, nav .nav-link, a[href="./about.html"]');
      var hasApp = txt.length > 400 || (hasNav && txt.length > 150);
      var b = document.querySelector('button, a.btn, input[type=submit]');
      var rc = b ? b.getBoundingClientRect() : null;
      return { hasApp: hasApp, len: txt.length, nav: hasNav,
               btn: b ? (b.textContent||'').trim().slice(0,50) : '',
               x: rc ? Math.round(rc.x + rc.width/2) : 0, y: rc ? Math.round(rc.y + rc.height/2) : 0 };
    })()`);
    if (st.hasApp) { console.log("   ✅ " + label + " 已过中间页（正文 " + st.len + " 字）"); return; }
    if (i % 10 === 0) console.log("   … " + label + " 第 " + i + " 轮：正文 " + st.len + " 字 / 导航 " + st.nav + " / 按钮「" + st.btn + "」 url=" + (await evalJs("location.href")).slice(-60));
    if (st.btn && st.x) await clickAt(st.x, st.y);
    await sleep(1100);
  }
  throw new Error("中间页一直过不去");
}

const PAGES = ["index.html", "laws.html", "card.html", "bookmarks.html", "history.html"];

async function main() {
  const child = spawn(EDGE, [
    "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
    "--no-proxy-server", "--proxy-server=direct://", "--hide-scrollbars",
    "--remote-debugging-port=" + PORT, "--user-data-dir=" + UDD, "about:blank",
  ], { detached: true, stdio: "ignore" });
  child.unref();

  let target = null;
  for (let i = 0; i < 60; i++) {
    await sleep(500);
    try {
      const list = await (await fetch("http://127.0.0.1:" + PORT + "/json/list")).json();
      target = list.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
      if (target) break;
    } catch (e) { /* 没起来 */ }
  }
  if (!target) throw new Error("Edge/CDP 未就绪");

  ws = new WebSocket(target.webSocketDebuggerUrl);
  ws.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id); pending.delete(m.id);
      m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result);
    }
  });
  await new Promise((res, rej) => { ws.addEventListener("open", res); ws.addEventListener("error", rej); });
  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: DSF, mobile: false });

  console.log("\n站点：" + SITE + (LOCAL ? "（本地）" : "（线上）"));

  /* ---------- ① 每页都有「关于」入口，且能跳过去 ---------- */
  console.log("\n【1】全站每个页面都有「关于」入口（导航 + 页脚）");
  for (const p of PAGES) {
    await nav(SITE + "/" + p + "?cb=" + Date.now());
    await passGate(p);
    const r = await evalJs(`(function(){
      var navA = Array.prototype.slice.call(document.querySelectorAll('a.nav-link'))
        .filter(function(a){ return /about\\.html$/.test(a.getAttribute('href')||''); });
      var footA = Array.prototype.slice.call(document.querySelectorAll('.site-footer a'))
        .filter(function(a){ return /about\\.html$/.test(a.getAttribute('href')||''); });
      var navTxt = navA.map(function(a){ return (a.textContent||'').trim(); }).join(',');
      var footTxt = footA.map(function(a){ return (a.textContent||'').trim(); }).join(',');
      // 各页正文都用了同样的免责声明，而那份声明里绝不该再出现「律师人工复核」
      var body = document.body.innerText;
      return { nav: navA.length, foot: footA.length, navTxt: navTxt, footTxt: footTxt,
               hasLawyerClaim: body.indexOf('律师人工复核') >= 0,
               hasCorrectClaim: body.indexOf('人工核对法条') >= 0 };
    })()`);
    check(p + " 导航含「关于」", r.nav === 1, "文本=" + r.navTxt);
    check(p + " 页脚含「关于本站」", r.foot >= 1, "文本=" + r.footTxt);
    check(p + " 不再出现「律师人工复核」", r.hasLawyerClaim === false);
    check(p + " 免责声明用「人工核对法条」", r.hasCorrectClaim === true);
  }

  /* ---------- ② 从导航真跳一次 ---------- */
  console.log("\n【2】从首页点「关于」能真的跳过去");
  await nav(SITE + "/index.html?cb=" + Date.now());
  await passGate("首页");
  await evalJs(`document.querySelector('a.nav-link[href$="about.html"]').click()`);
  const jumped = await waitCond("跳到 about.html", "/about\\.html$/.test(location.pathname)", 12000);
  check("导航点击跳转成功", jumped, await evalJs("location.pathname"));

  /* ---------- ③ 关于页 7 个板块齐全 ---------- */
  console.log("\n【3】关于页板块齐全");
  await nav(SITE + "/about.html?cb=" + Date.now());
  await passGate("关于页");
  const blocks = await evalJs(`(function(){
    var hs = Array.prototype.slice.call(document.querySelectorAll('.about-h2')).map(function(h){
      return (h.textContent||'').trim();
    });
    return { n: hs.length, list: hs };
  })()`);
  check("板块数 = 7", blocks.n === 7, "实际 " + blocks.n + "：" + blocks.list.join(" / "));
  const need = ["免责声明", "紧急", "内容是怎么做出来的", "法条出处", "发现错误", "技术说明"];
  need.forEach((k) => {
    check("含板块「" + k + "」", blocks.list.some((t) => t.indexOf(k) >= 0));
  });

  /* ---------- ④ 免责声明三要素（合规硬指标） ---------- */
  console.log("\n【4】免责声明要素（合规 U-04）");
  const disc = await evalJs(`(function(){
    var card = document.querySelector('.about-card--warn');
    return card ? (card.innerText || '') : '';
  })()`);
  check("免责声明区块存在且非空", disc.length > 100, disc.length + " 字");
  check("写明「不构成法律咨询」", /不构成具体法律咨询/.test(disc));
  check("写明「不构成个案法律意见」", /不构成对任何个案的法律意见/.test(disc));
  check("写明「不提供个案咨询」", /不提供个案咨询/.test(disc));
  check("写明「不是执业律师」", /不是执业律师/.test(disc));
  check("提到以官方来源为准", /官方/.test(disc));

  const emerg = await evalJs(`(function(){
    var t = document.querySelector('.about-table');
    return t ? (t.innerText || '') : '';
  })()`);
  console.log("\n【5】紧急联系方式");
  check("含 12348 法律服务热线", /12348/.test(emerg));
  check("含 110 报警", /110/.test(emerg));
  check("含法律援助", /法律援助/.test(emerg));
  check("含 12315 消费投诉", /12315/.test(emerg));
  check("含 12333 劳动投诉", /12333/.test(emerg));
  await shot("day32-about-01-top.png");

  /* ---------- ⑥ 数字由真实数据填充 ---------- */
  console.log("\n【6】统计数字来自真实数据（不是写死的占位）");
  const stats = await evalJs(`(function(){
    var c = document.getElementById('stat-cards');
    var l = document.getElementById('stat-laws');
    var raw = (window.LAW_CARDS || []).length;
    var laws = 0;
    (window.LAW_CARDS || []).forEach(function(x){ laws += (x.laws||[]).length; });
    return { cards: c ? c.textContent.trim() : '', laws: l ? l.textContent.trim() : '',
             rawCards: raw, rawLaws: laws };
  })()`);
  check("卡片数已替换为真实值", /^\d+$/.test(stats.cards) && stats.cards !== "120+",
        "页面=" + stats.cards + " / 数据=" + stats.rawCards);
  check("卡片数与数据源一致", String(stats.rawCards) === stats.cards);
  check("法条数已替换为真实值", /^\d+$/.test(stats.laws) && stats.laws !== "260+",
        "页面=" + stats.laws + " / 数据=" + stats.rawLaws);
  check("法条数与数据源一致", String(stats.rawLaws) === stats.laws);

  /* ---------- ⑦ 手机上导航不横向溢出 ---------- */
  console.log("\n【7】手机端 375px 导航不横向溢出（第 5 个导航项重点）");
  for (const p of ["index.html", "about.html"]) {
    await send("Emulation.setDeviceMetricsOverride", { width: 375, height: 780, deviceScaleFactor: 2, mobile: true });
    await nav(SITE + "/" + p + "?cb=" + Date.now());
    await passGate(p);
    await sleep(300);
    const mob = await evalJs(`(function(){
      var de = document.documentElement;
      var overflow = de.scrollWidth - de.clientWidth;
      var navs = document.querySelectorAll('a.nav-link');
      var last = navs.length ? navs[navs.length-1].getBoundingClientRect() : null;
      // 断言「关于」这一项没有跑出视口右边
      var off = last ? (last.right > de.clientWidth + 1) : null;
      var hdr = document.querySelector('.site-header .container');
      var hdrOverflow = hdr ? (hdr.scrollWidth - hdr.clientWidth) : 0;
      return { overflow: overflow, navCount: navs.length, lastRight: last ? Math.round(last.right) : 0,
               clientW: de.clientWidth, lastOffscreen: off, hdrOverflow: hdrOverflow };
    })()`);
    check(p + " 375px 无横向滚动", mob.overflow <= 1, "溢出 " + mob.overflow + "px");
    check(p + " 导航共 5 项", mob.navCount === 5, "实际 " + mob.navCount);
    check(p + " 最后一项「关于」未跑出视口", mob.lastOffscreen === false,
          "right=" + mob.lastRight + " / 视口宽=" + mob.clientW);
    check(p + " 顶栏容器内部不溢出", mob.hdrOverflow <= 1, "内部溢出 " + mob.hdrOverflow + "px");
  }
  await shot("day32-about-02-mobile.png");
  await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: DSF, mobile: false });

  /* ---------- ⑧ 无 JS 时正文仍可读 ---------- */
  console.log("\n【8】禁用 JS 后关于页正文仍可读（合规页不能靠脚本）");
  await send("Emulation.setScriptExecutionDisabled", { value: true });
  await nav(SITE + "/about.html?cb=" + Date.now());
  await sleep(600);
  // 脚本禁用后 Runtime.evaluate 仍可用，但页面脚本不会执行
  const noJs = await evalJs(`(function(){
    var t = document.body ? document.body.innerText : '';
    return { len: t.length, hasDisc: t.indexOf('不构成具体法律咨询') >= 0,
             has12348: t.indexOf('12348') >= 0, blocks: document.querySelectorAll('.about-card').length };
  })()`);
  await send("Emulation.setScriptExecutionDisabled", { value: false });
  check("无 JS 时正文非空", noJs.len > 300, noJs.len + " 字");
  check("无 JS 时免责声明可见", noJs.hasDisc === true);
  check("无 JS 时 12348 可见", noJs.has12348 === true);
  check("无 JS 时 7 个板块都在", noJs.blocks === 7, "实际 " + noJs.blocks);

  /* ---------- 汇总 ---------- */
  console.log("\n" + "=".repeat(64));
  console.log("通过 " + pass + " / 失败 " + fail + " / 共 " + (pass + fail) + " 项");
  console.log("=".repeat(64));
  if (fail > 0) process.exitCode = 1;

  try { ws.close(); } catch (e) {}
  try { process.kill(-child.pid); } catch (e) {}
  setTimeout(() => process.exit(fail > 0 ? 1 : 0), 300);
}

main().catch((e) => {
  console.error("\n❌ 测试本身异常：" + e.message);
  process.exit(1);
});

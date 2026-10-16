/* docs/day30-laws-e2e.js — Day 30「法条速查」页公网端到端
 *
 * 覆盖：导航入口 / 首屏渲染 / 法律名筛选 chip / 关键词搜条文（含口语词）/
 *       深链 laws.html?law=… / 「出自情形」跳回详情页 / 断网回落（静态池）
 *
 * 运行：node docs/day30-laws-e2e.js   （约 1 分钟，产出 day30-laws-*.png 到仓库根目录）
 * 依赖：本机 Edge + CDP（headless）；CloudBase 免费版中间页需等倒计时后真实点击
 */
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const CWD = process.cwd();
const SITE = "https://rqj-2006-d0gl1ael531a243a1-1497985433.tcloudbaseapp.com";
const W = 1280, H = 900, DSF = 1;
const PORT = 9500 + Math.floor(Math.random() * 300);
const UDD = path.join(os.tmpdir(), "edge-day30-laws-" + Date.now());
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
    // Day 30：给每个 CDP 调用加超时。原来没有超时，一旦 Edge 对超大页面（法条速查页
    // 158 条法条全文）不回应，promise 永不 resolve、事件循环空转 → 进程会静默 exit(0)，
    // 表现为「跑一半就结束、没有报错、退出码还是 0」，排查成本极高。
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
  // Day 30：改为只截视口。法条速查页有 158 条全文，整页截图（captureBeyondViewport）会产出
  // 3MB+ 的 base64，CDP 容易失败；视口截图已足够说明问题，且失败时降级跳过、不中断整轮测试。
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
async function clickEl(sel, desc) {
  const p = await evalJs(`(function(){
    var el = document.querySelector(${JSON.stringify(sel)});
    if (!el) return null;
    el.scrollIntoView({block:'center'});
    var rc = el.getBoundingClientRect();
    return { x: Math.round(rc.x + rc.width/2), y: Math.round(rc.y + rc.height/2), txt: (el.textContent||'').trim().slice(0,40) };
  })()`);
  if (!p) throw new Error("找不到 " + desc + " (" + sel + ")");
  await sleep(250);
  const p2 = await evalJs(`(function(){
    var el = document.querySelector(${JSON.stringify(sel)});
    var rc = el.getBoundingClientRect();
    return { x: Math.round(rc.x + rc.width/2), y: Math.round(rc.y + rc.height/2) };
  })()`);
  await clickAt(p2.x, p2.y);
  console.log("   👆 点了 " + desc + (p.txt ? "（“" + p.txt + "”）" : ""));
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
  await sleep(400);
}
/** CloudBase 免费版中间页（等倒计时 + 真实点击，JS .click() 无效） */
async function passGate(label) {
  for (let i = 0; i < 45; i++) {
    const st = await evalJs(`(function(){
      var hasApp = !!document.getElementById('law-area') || !!document.getElementById('card-area');
      var b = document.querySelector('button, a.btn, input[type=submit]');
      var rc = b ? b.getBoundingClientRect() : null;
      return { hasApp: hasApp, btn: b ? (b.textContent||'').trim().slice(0,50) : '',
               x: rc ? Math.round(rc.x + rc.width/2) : 0, y: rc ? Math.round(rc.y + rc.height/2) : 0 };
    })()`);
    if (st.hasApp) { console.log("   ✅ " + label + " 已过中间页"); return; }
    if (st.btn && st.x) { console.log("   ⛨ 中间页按钮：“" + st.btn + "” → 真实点击"); await clickAt(st.x, st.y); }
    await sleep(1100);
  }
  throw new Error("中间页一直过不去");
}

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

  console.log("\n【1】首页导航有「法条速查」入口");
  await nav(SITE + "/index.html?cb=" + Date.now());
  await passGate("首页");
  const navOk = await evalJs(`(function(){
    var as = document.querySelectorAll('a.nav-link');
    for (var i=0;i<as.length;i++){ if ((as[i].textContent||'').indexOf('法条速查')>=0 && /laws\\.html/.test(as[i].getAttribute('href')||'')) return true; }
    return false;
  })()`);
  check("首页导航含法条速查链接", navOk === true);

  console.log("\n【2】进入法条速查页，首屏渲染");
  await nav(SITE + "/laws.html?cb=" + Date.now());
  await passGate("法条速查页");
  await waitCond("法条列表渲染", "document.querySelectorAll('.law-item').length > 0", 25000);
  const first = await evalJs(`(function(){
    return {
      items: document.querySelectorAll('.law-item').length,
      chips: document.querySelectorAll('.law-chip').length,
      count: (document.querySelector('.law-count')||{}).textContent || '',
      name: (document.querySelector('.law-item-name')||{}).textContent || '',
      hasSrc: !!document.querySelector('.law-src'),
      hasFrom: !!document.querySelector('.law-item-from a'),
      activeChip: (document.querySelector('.law-chip.is-active')||{}).textContent || ''
    };
  })()`);
  check("渲染出法条条目", first.items > 0, "条数=" + first.items);
  check("渲染出法律名筛选 chip", first.chips > 1, "chip 数=" + first.chips);
  check("有统计行", /共收录/.test(first.count), "「" + first.count.trim() + "」");
  check("首条含法条名", /^《/.test(first.name.trim()), first.name.trim());
  check("含官方原文链接", first.hasSrc === true);
  check("含「出自情形」链接", first.hasFrom === true);
  check("默认选中「全部」", /全部/.test(first.activeChip), first.activeChip.trim().slice(0, 12));
  await shot("day30-laws-01-list.png");

  console.log("\n【3】搜条文关键词（法言法语）");
  await evalJs(`(function(){
    var i = document.getElementById('law-search');
    i.value = '竞业限制';
    i.dispatchEvent(new Event('input', {bubbles:true}));
  })()`);
  await waitCond("关键词结果回来", "document.querySelectorAll('.law-item').length > 0 && document.querySelector('.law-count').textContent.indexOf('关键词') >= 0", 20000);
  const kw1 = await evalJs(`(function(){
    var items = [].slice.call(document.querySelectorAll('.law-item-name')).map(function(e){return e.textContent;});
    return { n: items.length, first: items[0] || '', marks: document.querySelectorAll('.law-hl').length };
  })()`);
  check("「竞业限制」有结果", kw1.n > 0, "条数=" + kw1.n + " 首条=" + kw1.first);
  check("命中的关键词有高亮", kw1.marks > 0, "高亮 " + kw1.marks + " 处");
  await shot("day30-laws-02-keyword.png");

  console.log("\n【4】搜口语词（法条原文里没有的词，靠关联卡片命中）");
  await evalJs(`(function(){
    var i = document.getElementById('law-search');
    i.value = '押金';
    i.dispatchEvent(new Event('input', {bubbles:true}));
  })()`);
  await waitCond("口语词结果回来", "document.querySelectorAll('.law-item').length > 0 && document.querySelector('.law-count').textContent.indexOf('押金') >= 0", 20000);
  const kw2 = await evalJs(`(function(){
    var names = [].slice.call(document.querySelectorAll('.law-item-name')).map(function(e){return e.textContent;});
    var froms = [].slice.call(document.querySelectorAll('.law-item-from a')).map(function(e){return e.textContent;});
    return { n: names.length, names: names, froms: froms };
  })()`);
  check("「押金」有结果（原文里没有这个词）", kw2.n > 0, "条数=" + kw2.n);
  check("结果带出了相关卡片", kw2.froms.length > 0, "首张卡=" + (kw2.froms[0] || ''));
  await shot("day30-laws-03-colloquial.png");

  console.log("\n【5】按法律名筛选");
  await evalJs("document.getElementById('law-search').value=''; document.getElementById('law-search').dispatchEvent(new Event('input',{bubbles:true}));");
  await sleep(600);
  const civilChipIdx = await evalJs(`(function(){
    var cs = document.querySelectorAll('.law-chip');
    for (var i=0;i<cs.length;i++){ if ((cs[i].getAttribute('data-law')||'') === '民法典') return i; }
    return -1;
  })()`);
  check("筛选器里有「民法典」", civilChipIdx > 0, "chip 序号=" + civilChipIdx);
  await evalJs(`document.querySelectorAll('.law-chip')[${civilChipIdx}].click()`);
  await waitCond("筛选结果回来", "document.querySelector('.law-count').textContent.indexOf('法律「民法典」') >= 0", 20000);
  const filtered = await evalJs(`(function(){
    var names = [].slice.call(document.querySelectorAll('.law-item-name')).map(function(e){return e.textContent.trim();});
    var bad = names.filter(function(n){ return n.indexOf('《民法典》') !== 0; });
    var chip = document.querySelector('.law-chip.is-active');
    return { n: names.length, bad: bad.length, chip: chip ? chip.getAttribute('data-law') : '' };
  })()`);
  check("筛选后只剩该法律条文", filtered.bad === 0, "共 " + filtered.n + " 条，非民法典 " + filtered.bad + " 条");
  check("对应 chip 高亮", filtered.chip === '民法典', "active=" + filtered.chip);
  check("URL 同步筛选参数", (await evalJs("location.search")).indexOf("law=") >= 0, await evalJs("location.search"));
  await shot("day30-laws-04-filter.png");

  console.log("\n【6】深链 laws.html?law=民法典 直接进入已筛状态");
  await nav(SITE + "/laws.html?law=" + encodeURIComponent("民法典") + "&cb=" + Date.now());
  await passGate("深链页");
  await waitCond("深链筛选生效", "document.querySelector('.law-count') && document.querySelector('.law-count').textContent.indexOf('法律「民法典」') >= 0", 25000);
  const deep = await evalJs(`(function(){
    var names = [].slice.call(document.querySelectorAll('.law-item-name')).map(function(e){return e.textContent.trim();});
    var bad = names.filter(function(n){ return n.indexOf('《民法典》') !== 0; });
    return { n: names.length, bad: bad.length,
             chip: (document.querySelector('.law-chip.is-active')||{}).getAttribute ? document.querySelector('.law-chip.is-active').getAttribute('data-law') : '' };
  })()`);
  check("深链进入即按民法典筛选", deep.bad === 0 && deep.n > 0, "条数=" + deep.n + " active=" + deep.chip);

  console.log("\n【7】「出自情形」跳回详情页");
  await clickEl(".law-item-from a", "第一条法条的「出自情形」");
  await waitCond("进入详情页", "location.pathname.indexOf('card.html') >= 0", 12000);
  await waitCond("详情页渲染", "document.body.innerText.indexOf('相关法条') >= 0", 20000);
  const back = await evalJs("document.body.innerText.indexOf('相关法条') >= 0");
  check("跳到卡片详情且含「相关法条」", back === true, await evalJs("location.pathname + location.search"));
  await shot("day30-laws-05-to-card.png");

  console.log("\n【8】断网回落（API 不可达时用静态法条池）");
  await send("Network.enable");
  await send("Network.setBlockedURLs", { urls: ["*api.tcloudbasegateway.com*", "*app.tcloudbase.com*"] });
  await nav(SITE + "/laws.html?cb=" + Date.now());
  await passGate("断网页");
  await waitCond("本地法条池渲染", "document.querySelectorAll('.law-item').length > 0", 25000);
  const offline = await evalJs(`(function(){
    return { n: document.querySelectorAll('.law-item').length,
             chips: document.querySelectorAll('.law-chip').length,
             count: (document.querySelector('.law-count')||{}).textContent || '' };
  })()`);
  check("断网也能渲染法条列表", offline.n > 0, "条数=" + offline.n + " chips=" + offline.chips);
  await shot("day30-laws-06-offline.png");
  await send("Network.setBlockedURLs", { urls: [] });

  console.log("\n================================");
  console.log("结果：" + pass + " 通过 / " + fail + " 失败");
  console.log("================================");

  try { child.kill(); } catch (e) { /* 忽略 */ }
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error("\n💥 脚本中断：" + e.message);
  console.log("结果：" + pass + " 通过 / " + (fail + 1) + " 失败");
  try { await send("Page.captureScreenshot", { format: "png" }).then((s) => fs.writeFileSync(path.join(CWD, "day30-laws-error.png"), Buffer.from(s.data, "base64"))); } catch (x) { /* 忽略 */ }
  process.exit(1);
});

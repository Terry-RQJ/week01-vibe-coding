/* docs/day27-mobile-walkthrough.js — Day 27 加练：375px 手机宽度完整打卡（收藏）流程
 *
 * 用途：① 验证外行试用脚本的 6 步在真实公网站点上每一步都能走通（不发死链给试用者）
 *       ② 彩排时圈出最可能的卡点（本次发现：收藏页点 ☆ 后列表不刷新，见 docs/day27-fix-and-recheck.md §4.1）
 *
 * 运行：node docs/day27-mobile-walkthrough.js   （约 1.5 分钟，产出 day27-mob-*.png 到仓库根目录）
 * 依赖：本机 Edge + CDP（headless），CloudBase 免费版中间页需等倒计时后真实点击（JS click 无效，Day 26 教训）
 * 注意：headless 下每次都是全新 localStorage，可重复跑；不改任何线上数据（收藏只存浏览器本地）
 */
// Day 27 加练：375px 手机宽度完整打卡（收藏）流程 · 真实公网站点
// 同时当作外行试用脚本的彩排：每一步都对应脚本的第 1~6 步
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const CWD = process.cwd();
const BASE = "https://rqj-2006-d0gl1ael531a243a1-1497985433.tcloudbaseapp.com";
const W = 375, H = 812, DSF = 3;
const PORT = 9800 + Math.floor(Math.random() * 150);
const UDD = path.join(os.tmpdir(), "edge-day27-walk-" + Date.now());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let ws, id = 0;
const pending = new Map();
function send(method, params) {
  return new Promise((res, rej) => {
    const mid = ++id;
    pending.set(mid, { res, rej });
    ws.send(JSON.stringify({ id: mid, method, params: params || {} }));
  });
}
async function evalJs(expr) {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error("页面报错: " + JSON.stringify(r.exceptionDetails.exception || {}).slice(0, 200));
  return r.result ? r.result.value : undefined;
}
async function shot(name) {
  const s = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  fs.writeFileSync(path.join(CWD, name), Buffer.from(s.data, "base64"));
  console.log("   📸 " + name);
}
/** 视口截图：先把第一张卡的收藏按钮滚进屏幕中央，再拍 —— 按钮状态看得清 */
async function shotVp(name) {
  await evalJs("var el=document.querySelector('.fav-btn'); if(el){el.scrollIntoView({block:'center'});}");
  await sleep(350);
  const s = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(CWD, name), Buffer.from(s.data, "base64"));
  console.log("   📸 " + name + "（视口）");
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
  await sleep(250); // 等 scroll 稳定
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
  while (Date.now() - t0 < (timeoutMs || 12000)) {
    try { if (await evalJs(expr)) return; } catch (e) {}
    await sleep(400);
  }
  throw new Error("超时：" + desc);
}
async function nav(url) {
  await send("Page.navigate", { url });
  await waitCond("页面加载完成 " + url, "document.readyState === 'complete'", 25000);
  await sleep(400);
}
/** CloudBase 免费版中间页：等倒计时走完 + 可信点击（JS .click() 无效，Day 26 教训） */
async function passGate(label) {
  for (let i = 0; i < 45; i++) {
    const st = await evalJs(`(function(){
      var hasApp = !!document.getElementById('card-area');
      var b = document.querySelector('button, a.btn, input[type=submit]');
      var rc = b ? b.getBoundingClientRect() : null;
      return { hasApp: hasApp, title: document.title.slice(0,40), url: location.href.slice(0,80),
               btn: b ? (b.textContent||'').trim().slice(0,50) : '',
               x: rc ? Math.round(rc.x + rc.width/2) : 0, y: rc ? Math.round(rc.y + rc.height/2) : 0 };
    })()`);
    if (st.hasApp) { console.log("   ✅ " + label + " 已过中间页（第 " + i + " 次探测）"); return; }
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
    } catch (e) {}
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
  await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: DSF, mobile: true });
  console.log("视口已锁定 " + W + "px（移动端），开始彩排试用脚本\n");

  // ── 第 1 步：打开公网链接 ──
  console.log("第 1 步：打开公网链接");
  await nav(BASE + "/");
  await passGate("首页");
  await waitCond("首页出现卡片", "document.querySelectorAll('.fav-btn').length > 0", 20000);
  const nCards = await evalJs("document.querySelectorAll('.fav-btn').length");
  console.log("   ✅ 首页渲染出 " + nCards + " 张卡片");

  // ── 第 2 步：点开一张卡片看内容 ──
  console.log("第 2 步：点开一张卡片");
  const slug = await evalJs("document.querySelector('.card-title-link').getAttribute('href')");
  await clickEl(".card-title-link", "第一张卡片标题");
  await waitCond("进入详情页", "location.pathname.indexOf('card.html') >= 0", 10000);
  await waitCond("详情内容出现", "document.body.innerText.indexOf('发生了什么') >= 0", 15000);
  const secs = await evalJs("['发生了什么','第一步该做什么','相关法条'].map(function(k){return document.body.innerText.indexOf(k) >= 0;})");
  console.log("   ✅ 详情页三区块齐全: " + JSON.stringify(secs));
  await shot("day27-mob-02-detail.png");

  // ── 第 3 步：把卡片「收起来」（点 ☆）──
  console.log("第 3 步：回首页把卡片收起来（点 ☆）");
  await nav(BASE + "/index.html");
  await passGate("回首页");
  await waitCond("卡片出现", "document.querySelectorAll('.fav-btn').length > 0", 20000);
  await clickEl(".fav-btn", "卡片右下角 ☆");
  await waitCond("按钮变为已收藏", "document.querySelector('.fav-btn').textContent.indexOf('已收藏') >= 0", 8000);
  const toast = await evalJs("var t=document.querySelector('.fav-toast'); t ? t.textContent : '(无)'");
  console.log("   ✅ 按钮 → 已收藏，toast：「" + toast + "」");
  await shotVp("day27-mob-03-bookmarked.png");

  // ── 第 4 步：刷新确认 ──
  console.log("第 4 步：刷新确认");
  await send("Page.reload"); await sleep(1200);
  await passGate("刷新后");
  await waitCond("卡片出现", "document.querySelectorAll('.fav-btn').length > 0", 20000);
  const afterReload = await evalJs("document.querySelector('.fav-btn').textContent.trim()");
  console.log("   ✅ 刷新后按钮文案：「" + afterReload.trim() + "」");
  await shotVp("day27-mob-04-after-reload.png");

  // ── 第 5 步：进详情页看按钮，并「弄回去」──
  console.log("第 5 步：进详情页看状态一致性，再弄回去");
  await nav(BASE + "/" + slug.replace("./", ""));
  await waitCond("详情加载", "document.body.innerText.indexOf('发生了什么') >= 0", 15000);
  const detailBtn = await evalJs("document.querySelector('.fav-btn').textContent.trim()");
  const detailOn = await evalJs("document.querySelector('.fav-btn').classList.contains('is-on')");
  console.log("   详情页按钮初始：「" + detailBtn.trim() + "」  is-on=" + detailOn + (detailOn ? " ✅ 与列表页一致" : " ⚠️ 与列表页不一致"));
  await shotVp("day27-mob-05-detail-state.png");
  await clickEl(".fav-btn", "详情页收藏按钮");
  await waitCond("按钮变回未收藏", "var t=document.querySelector('.fav-btn').textContent; t.indexOf('收藏')>=0 && t.indexOf('已收藏')<0 && t.indexOf('中')<0", 8000);
  console.log("   ✅ 点击后按钮：「" + (await evalJs("document.querySelector('.fav-btn').textContent.trim()")).trim() + "」");

  // 重新收藏（第 6 步删除需要它存在）
  await clickEl(".fav-btn", "详情页收藏按钮(再收藏)");
  await waitCond("再次变为已收藏", "document.querySelector('.fav-btn').textContent.indexOf('已收藏') >= 0", 8000);

  // ── 第 6 步：去「我的收藏」删掉，刷新确认 ──
  console.log("第 6 步：去我的收藏删掉");
  await nav(BASE + "/bookmarks.html");
  await passGate("收藏页");
  await waitCond("收藏页出现卡片", "document.querySelectorAll('.fav-btn').length > 0", 20000);
  const collCount = await evalJs("document.querySelectorAll('.fav-btn').length");
  console.log("   ✅ 收藏页有 " + collCount + " 张卡");
  await shotVp("day27-mob-06-bookmarks.png");
  await clickEl(".fav-btn", "收藏页的 ☆（删除）");
  await sleep(1800); // 等 toggle 完成（按钮有 600ms 过渡态）
  const btnAfterClick = await evalJs("document.querySelector('.fav-btn') ? document.querySelector('.fav-btn').textContent.trim() : '(按钮没了)'");
  const stillVisible = await evalJs("document.querySelectorAll('.fav-btn').length");
  console.log("   ⚠️ 点完 ☆ 后（未刷新）：按钮「" + btnAfterClick + "」，列表里仍有 " + stillVisible + " 张卡");
  await shotVp("day27-mob-06b-after-click-no-refresh.png");
  await nav(BASE + "/bookmarks.html");
  await passGate("删除后刷新");
  await sleep(1500);
  const after = await evalJs("document.querySelectorAll('.fav-btn').length");
  const emptyText = await evalJs("document.body.innerText.slice(0,120).replace(/\\n/g,' | ')");
  console.log("   ✅ 删除+刷新后收藏页卡片数 = " + after + "（应为 0）");
  console.log("   页面文案：「" + emptyText.slice(0, 90) + "」");
  await shotVp("day27-mob-07-after-delete.png");

  console.log("\n彩排完成：6 步全部走通");
  ws.close();
  try { process.kill(-child.pid); } catch (e) { try { child.kill(); } catch (e2) {} }
}

main().then(() => process.exit(0)).catch((e) => { console.error("FAIL: " + e.message); process.exit(1); });

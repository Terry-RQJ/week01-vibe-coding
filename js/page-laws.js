/* js/page-laws.js — 「法条速查」页（Day 30）
 *
 * 与首页搜索的区别：首页从「我遇到了什么事」出发，这里是**以法条为主体**检索——
 * 按法律名浏览、按条文关键词搜，每条都给出处链接和「出自哪个情形」的入口。
 *
 * 依赖：js/store.js 的 Store.listLaws(keyword, lawName)（API 优先，断网回落本地聚合）
 */
(function () {
  "use strict";

  var input = document.getElementById("law-search");
  var area = document.getElementById("law-area");
  var chipBox = document.getElementById("law-chips");

  var activeLaw = "";        // 当前选中的法律名（空 = 全部）
  var lawNames = [];         // 全量法律名清单（meta.lawNames）
  var seq = 0;               // 防竞态：只认最后一次请求的结果
  var timer = null;          // 输入防抖

  /* ---------- 工具 ---------- */

  function readParam(name) {
    var m = location.search.match(new RegExp("[?&]" + name + "=([^&]*)"));
    return m ? decodeURIComponent(m[1].replace(/\+/g, " ")) : "";
  }

  /** 关键词高亮：先转义再切片替换，避免正则元字符把替换搞挂 */
  function highlight(text, kw) {
    var safe = UI.esc(text);
    if (!kw) return safe;
    var k = UI.esc(kw);
    if (!k) return safe;
    return safe.split(k).join('<mark class="law-hl">' + k + "</mark>");
  }

  function syncUrl(kw) {
    var qs = [];
    if (kw) qs.push("keyword=" + encodeURIComponent(kw));
    if (activeLaw) qs.push("law=" + encodeURIComponent(activeLaw));
    try {
      history.replaceState(null, "", location.pathname + (qs.length ? "?" + qs.join("&") : ""));
    } catch (e) { /* 某些环境下 replaceState 受限，忽略即可 */ }
  }

  /* ---------- 渲染 ---------- */

  function renderChips() {
    if (!chipBox) return;
    var total = lawNames.reduce(function (s, n) { return s + (n.count || 0); }, 0);
    var html = ['<button type="button" class="chip law-chip' + (activeLaw ? "" : " is-active") +
      '" data-law="" aria-pressed="' + (activeLaw ? "false" : "true") + '">全部<span class="law-chip-n">' +
      total + "</span></button>"];
    lawNames.forEach(function (n) {
      var on = activeLaw === n.name;
      html.push('<button type="button" class="chip law-chip' + (on ? " is-active" : "") +
        '" data-law="' + UI.esc(n.name) + '" aria-pressed="' + (on ? "true" : "false") + '">' +
        UI.esc(n.name) + '<span class="law-chip-n">' + n.count + "</span></button>");
    });
    chipBox.innerHTML = html.join("");
  }

  function renderList(laws, kw) {
    if (!laws.length) {
      area.innerHTML =
        '<div class="state-box state-empty" role="status">' +
          '<span class="badge">没有找到相关法条</span>' +
          '<p>换个关键词试试（比如「押金」「竞业限制」「三倍赔偿」），或点上面的法律名直接浏览全部条文。</p>' +
          (activeLaw
            ? '<p style="margin-top: var(--space-2); font-size: var(--font-size-sm);">当前正按「' + UI.esc(activeLaw) +
              '」筛选，点「全部」可取消该筛选。</p>'
            : "") +
        "</div>";
      return;
    }

    var rows = laws.map(function (l) {
      // 一条法条可能被多张卡引用（接口已聚合），分类与出处都可能有多个
      var cards = l.cards || [];
      var cats = [];
      cards.forEach(function (c) {
        if (c.category && cats.indexOf(c.category) === -1) cats.push(c.category);
      });
      var cat = cats.length
        ? '<span class="law-item-cat">' + cats.map(UI.esc).join(" · ") + "</span>"
        : "";
      var from = cards.length
        ? "出自情形 " + cards.map(function (c) {
            return '<a href="./card.html?slug=' + encodeURIComponent(c.slug) + '">' +
              UI.esc(c.title || c.slug) + "</a>";
          }).join("、")
        : "";
      var src = l.source_url
        ? '<a class="law-src" href="' + UI.esc(l.source_url) +
          '" target="_blank" rel="noopener noreferrer">官方原文 ↗</a>'
        : "";
      return (
        '<article class="law-item">' +
          '<div class="law-item-head">' +
            '<h2 class="law-item-name">' + highlight(l.name, kw) + "</h2>" +
            src +
          "</div>" +
          '<p class="law-item-text">' + highlight(l.text, kw) + "</p>" +
          '<p class="law-item-from">' + from + cat + "</p>" +
        "</article>"
      );
    }).join("");

    var cond = [];
    if (activeLaw) cond.push("法律「" + activeLaw + "」");
    if (kw) cond.push("关键词「" + kw + "」");
    var countLine = cond.length
      ? "已筛选 " + cond.join("、") + "：共 " + laws.length + " 条"
      : "共收录 " + laws.length + " 条法条原文";

    area.innerHTML =
      '<div class="state-success">' +
        '<p role="status" aria-live="polite" class="law-count">' + UI.esc(countLine) + "</p>" +
        '<div class="law-list">' + rows + "</div>" +
      "</div>";
  }

  /* ---------- 加载 ---------- */

  function load() {
    var mySeq = ++seq;
    var kw = input ? (input.value || "").trim() : "";
    UI.renderLoading(area);
    window.Store.listLaws(kw, activeLaw)
      .then(function (env) {
        if (mySeq !== seq) return;
        var laws = (env && env.data) || [];
        var meta = (env && env.meta) || {};
        lawNames = meta.lawNames || [];
        renderChips();
        renderList(laws, kw);
        syncUrl(kw);
      })
      .catch(function () {
        if (mySeq !== seq) return;
        UI.renderError(area, function () { load(); });
      });
  }

  /* ---------- 事件 ---------- */

  if (input) {
    input.addEventListener("input", function () {
      clearTimeout(timer);
      // 250ms 防抖（与首页搜索保持同一手感）
      timer = setTimeout(load, 250);
    });
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { clearTimeout(timer); load(); }
    });
  }

  if (chipBox) {
    chipBox.addEventListener("click", function (e) {
      var btn = e.target.closest ? e.target.closest(".law-chip") : null;
      if (!btn) return;
      activeLaw = btn.getAttribute("data-law") || "";
      load();
    });
  }

  // bfcache 返回（浏览器后退）时刷新，避免看到过期状态
  window.addEventListener("pageshow", function (e) {
    if (e.persisted) load();
  });

  /* ---------- 初始化（支持从链接带参数进来，如 laws.html?law=民法典）---------- */
  var initKw = readParam("keyword");
  activeLaw = readParam("law");
  if (input && initKw) input.value = initKw;
  load();
})();

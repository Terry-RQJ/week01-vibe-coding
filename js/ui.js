/* js/ui.js — 首页渲染器 + 四种页面状态（Day 8）
 *
 * 状态机：loading → success | empty | error
 * - loading：进页面先走（store 模拟 600ms 延迟）
 * - success：渲染 6 张 mock 卡
 * - empty：演示器切换可见（正式场景：某分类暂无内容）
 * - error：演示器切换可见（正式场景：网络失败）；重试按钮走真实加载路径
 */
(function () {
  "use strict";

  var area = document.getElementById("card-area");
  var demoSelect = document.getElementById("state-demo-select");

  /** HTML 转义（数据渲染的最低防线，TECH_DESIGN §9）*/
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  /* ---------- 四种状态的 DOM 片段 ---------- */

  function renderLoading() {
    area.innerHTML =
      '<div class="state-box state-loading" role="status" aria-live="polite">' +
        '<svg class="leaf-spinner" viewBox="0 0 44 44" aria-hidden="true">' +
          '<path d="M22 4 C 30 10 34 20 22 40 C 10 20 14 10 22 4 Z" fill="#7FA88B"/>' +
        '</svg>' +
        '<p>竹林里翻找中…</p>' +
      '</div>';
  }

  function renderEmpty() {
    area.innerHTML =
      '<div class="state-box state-empty" role="status">' +
        '<span class="badge">暂无内容</span>' +
        '<p>这个分类下的情形还在赶来的路上（竹笋破土需要时间）。</p>' +
        '<p style="margin-top: var(--space-2); font-size: var(--font-size-sm);">换一个分类看看，或明天再来。</p>' +
      '</div>';
  }

  function renderError() {
    area.innerHTML =
      '<div class="state-box state-error" role="alert">' +
        '<span class="badge">加载失败</span>' +
        '<p>数据没能从竹林里搬出来（网络开小差了）。</p>' +
        '<button type="button" id="retry-btn">再试一次</button>' +
      '</div>';
    document.getElementById("retry-btn").addEventListener("click", function () {
      loadCards("success");
    });
  }

  function renderSuccess(cards) {
    var html = cards.map(function (c) {
      var lawNames = (c.laws || []).map(function (l) { return esc(l.name); }).join("、");
      return (
        '<article class="card">' +
          '<h3>' + esc(c.title) + '</h3>' +
          '<p class="summary">' + esc(c.summary) + '</p>' +
          '<div class="card-meta">' +
            '<span class="card-tag">' + esc(c.category) + '</span>' +
            '<span>📄 ' + lawNames + '</span>' +
            '<span>· 核验 ' + esc(c.last_verified_at) + '</span>' +
          '</div>' +
        '</article>'
      );
    }).join("");
    area.innerHTML = '<div class="state-success">' +
      '<p style="font-size: var(--font-size-sm); color: var(--bamboo-dark); margin-bottom: var(--space-3);">' +
      '共 ' + cards.length + ' 个情形（示例数据 · Day 8–14 滚动补充到 12 个）</p>' +
      '<div class="card-grid" style="padding: 0;">' + html + '</div></div>';
  }

  /* ---------- 加载入口 ---------- */

  function loadCards(forceState) {
    if (forceState === "empty") { renderEmpty(); return; }
    if (forceState === "error") { renderError(); return; }
    renderLoading();
    window.Store.listCards()
      .then(function (cards) {
        if (!cards || cards.length === 0) { renderEmpty(); return; }
        renderSuccess(cards);
      })
      .catch(function () { renderError(); });
  }

  if (demoSelect) {
    demoSelect.addEventListener("change", function () {
      loadCards(demoSelect.value);
    });
  }

  /* 首次进入：走真实加载路径（loading → success）*/
  loadCards("success");
})();

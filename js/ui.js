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
            favBtnHtml(c.slug) +
          '</div>' +
        '</article>'
      );
    }).join("");
    area.innerHTML = '<div class="state-success">' +
      '<p style="font-size: var(--font-size-sm); color: var(--bamboo-dark); margin-bottom: var(--space-3);">' +
      '共 ' + cards.length + ' 个情形（示例数据 · Day 8–14 滚动补充到 12 个）</p>' +
      '<div class="card-grid" style="padding: 0;">' + html + '</div></div>';
  }

  /* ---------- Day 11：收藏交互（前端临时状态）---------- */

  /** 收藏按钮 HTML（已收藏时初始为金色已收藏态） */
  function favBtnHtml(slug) {
    var on = window.Store.isBookmarked(slug);
    return '<button type="button" class="fav-btn' + (on ? ' is-on' : '') + '"' +
      ' data-slug="' + esc(slug) + '" aria-pressed="' + on + '">' +
      '<span class="fav-star" aria-hidden="true">' + (on ? '★' : '☆') + '</span>' +
      (on ? '已收藏' : '收藏') +
      '</button>';
  }

  /** 全局 toast：成功/失败都给一句话反馈（aria-live 播报） */
  var toast = null;
  var toastTimer = null;
  function showToast(msg, isError) {
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "fav-toast";
      toast.setAttribute("role", "status");
      toast.setAttribute("aria-live", "polite");
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.toggle("is-error", !!isError);
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.classList.remove("show"); }, 2400);
  }

  /** 把按钮切到指定状态（文字 / 样式 / aria 同步变化） */
  function setFavState(btn, on) {
    btn.classList.toggle("is-on", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    btn.innerHTML = '<span class="fav-star" aria-hidden="true">' +
      (on ? '★' : '☆') + '</span>' + (on ? '已收藏' : '收藏');
  }

  /** 点击处理：idle → busy（禁用防连点）→ 成功换态 / 失败还原+提示 */
  function onFavClick(btn) {
    if (btn.disabled) return;                       // 处理期间不可重复点击
    var slug = btn.getAttribute("data-slug");
    var wasOn = btn.classList.contains("is-on");
    var prevHtml = btn.innerHTML;                   // 失败时还原
    btn.disabled = true;
    btn.setAttribute("aria-busy", "true");
    btn.textContent = wasOn ? '取消中…' : '收藏中…';
    window.Store.toggleBookmark(slug)
      .then(function (nowOn) {
        setFavState(btn, nowOn);
        showToast(nowOn ? '已收藏！可在右上「我的」查看' : '已取消收藏', false);
      })
      .catch(function () {
        btn.innerHTML = prevHtml;                   // 还原到点击前的样子
        showToast('收藏没保存成功（网络开小差了），请再试一次', true);
      })
      .then(function () {                           // finally（兼容写法）
        btn.disabled = false;
        btn.removeAttribute("aria-busy");
      });
  }

  /* 事件委托：卡片区域里点 .fav-btn 都走同一个处理 */
  area.addEventListener("click", function (e) {
    var btn = e.target && e.target.closest ? e.target.closest(".fav-btn") : null;
    if (btn) onFavClick(btn);
  });

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

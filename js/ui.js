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

  function renderEmpty(catName, keyword) {
    if (keyword) {
      /* Day 13：搜索无匹配 —— 明确告知 + 给出可操作的去路 */
      area.innerHTML =
        '<div class="state-box state-empty" role="status">' +
          '<span class="badge">没有找到相关内容</span>' +
          '<p>换个关键词试试（比如「押金」「劝退」），或直接搜法条（如「劳动合同法」）。</p>' +
          '<p style="margin-top: var(--space-2); font-size: var(--font-size-sm);">清空搜索框即可恢复完整列表。</p>' +
        '</div>';
      return;
    }
    area.innerHTML =
      '<div class="state-box state-empty" role="status">' +
        '<span class="badge">暂无内容</span>' +
        '<p>' + (catName
          ? '「' + esc(catName) + '」下的情形还在赶来的路上（竹笋破土需要时间）。'
          : '这个分类下的情形还在赶来的路上（竹笋破土需要时间）。') + '</p>' +
        '<p style="margin-top: var(--space-2); font-size: var(--font-size-sm);">点击上方其他分类，或再点一次当前分类恢复全部。</p>' +
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

  function renderSuccess(cards, catName, keyword) {
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
    /* Day 13：结果行同时说明「当前筛了什么 + 共几个 + 怎么撤销」 */
    var conditions = [];
    if (catName) conditions.push('已筛选「' + esc(catName) + '」');
    if (keyword) conditions.push('搜索「' + esc(keyword) + '」');
    var countLine;
    if (conditions.length > 0) {
      var undo = keyword ? '（清空搜索框恢复）' : '（再点一次该分类恢复全部）';
      countLine = conditions.join(' · ') + '：共 ' + cards.length + ' 个情形' + undo;
    } else {
      countLine = '共 ' + cards.length + ' 个情形（示例数据 · Day 8–14 滚动补充到 12 个）';
    }
    area.innerHTML = '<div class="state-success">' +
      '<p role="status" aria-live="polite" style="font-size: var(--font-size-sm); color: var(--bamboo-dark); margin-bottom: var(--space-3);">' +
      countLine + '</p>' +
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

  /* 过期响应防护（Day 13）：搜索是连续触发的（防抖后仍可能连续多次），
   * 每次加载拿一个序号，回来时序号不是最新的就丢弃——防止慢的旧响应
   * 覆盖新的筛选结果。 */
  var loadSeq = 0;

  function loadCards(forceState, categoryId, keyword) {
    var mySeq = ++loadSeq;
    keyword = (keyword || "").trim();
    if (forceState === "empty") { renderEmpty(categoryId ? CAT_NAMES[categoryId] : null, keyword); return; }
    if (forceState === "error") { renderError(); return; }
    renderLoading();
    window.Store.searchCards(keyword, categoryId)
      .then(function (cards) {
        if (mySeq !== loadSeq) return;               // 已被更新的请求取代，丢弃
        if (!cards || cards.length === 0) { renderEmpty(categoryId ? CAT_NAMES[categoryId] : null, keyword); return; }
        renderSuccess(cards, categoryId ? CAT_NAMES[categoryId] : null, keyword);
      })
      .catch(function () {
        if (mySeq !== loadSeq) return;
        renderError();
      });
  }

  /* ---------- Day 12：分类筛选（Skill: legal-site-interaction）----------
   * 点击 chip 筛选 → 再点同一个 chip 清空恢复；aria-pressed 同步；
   * 数据走 Store.listCardsByCategory（唯一数据访问层，Skill §一.1）
   */
  var catList = document.querySelector(".category-list");
  var activeCat = null;
  var activeKeyword = "";                            // Day 13：当前搜索关键词

  var CAT_NAMES = {
    labor: "劳动类", consume: "消费类", loan: "借贷类",
    marriage: "婚姻家庭类", traffic: "交通类", neighbor: "邻里 / 名誉类"
  };

  /** 统一入口：按「分类 + 关键词」当前状态重新加载列表（谁变了都走这里） */
  function applyFilters(forceState) {
    loadCards(forceState || "success", activeCat, activeKeyword);
  }

  /** 把所有 chip 的选中态样式/aria 同步到 activeCat */
  function syncChipStates() {
    var chips = catList.querySelectorAll(".chip");
    for (var i = 0; i < chips.length; i++) {
      var on = chips[i].getAttribute("data-cat") === activeCat;
      chips[i].classList.toggle("is-filtered", on);
      chips[i].setAttribute("aria-pressed", on ? "true" : "false");
    }
  }

  if (catList) {
    catList.addEventListener("click", function (e) {
      var chip = e.target && e.target.closest ? e.target.closest(".chip") : null;
      if (!chip || chip.disabled) return;
      var cat = chip.getAttribute("data-cat");
      activeCat = (activeCat === cat) ? null : cat;   // 再点一次 = 清空恢复
      syncChipStates();
      applyFilters();
    });
  }

  /* ---------- Day 13：关键词搜索 + 法条解析筛选（Skill: legal-site-interaction）----------
   * 输入即搜（250ms 防抖，避免每个字符都打一次 600ms 的 mock 请求）；
   * Enter 立即触发；清空（✕ / Esc / 删除）恢复完整列表；
   * 与分类 chip 可叠加（交集）；无匹配显示「没有找到相关内容」。
   * 数据走 Store.searchCards（唯一数据访问层，Skill §一.1）。
   */
  var searchInput = document.getElementById("card-search");
  var searchTimer = null;

  function flushSearch() {
    clearTimeout(searchTimer);
    searchTimer = null;
    activeKeyword = searchInput.value;
    applyFilters();
  }

  if (searchInput) {
    searchInput.addEventListener("input", function () {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(flushSearch, 250);
    });
    searchInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") flushSearch();          // 回车立即搜，不等防抖
    });
  }

  if (demoSelect) {
    demoSelect.addEventListener("change", function () {
      applyFilters(demoSelect.value);                // 演示器也尊重当前筛选状态
    });
  }

  /* 首次进入：走真实加载路径（loading → success）*/
  loadCards("success");
})();

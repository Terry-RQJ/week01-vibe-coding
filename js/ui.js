/* js/ui.js — 渲染层（Day 13 重构：抽出 window.UI 给多视图共用）
 *
 * 原来只有首页用；现在拆出可复用部分挂到 window.UI，
 * 详情/收藏/浏览记录页也调用同一套组件（避免四态文案走样）。
 * 首页专属的「分类筛选 + 搜索」逻辑留在文件末尾、用 `if (!catList && !searchInput) return` 守护。
 */
(function () {
  "use strict";

  /** ---------- 共用工具（window.UI 暴露给所有页面）---------- */

  /** HTML 转义（数据渲染的最低防线，TECH_DESIGN §9）*/
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  /* ---------- 四种状态的 DOM 片段 ---------- */

  function renderLoading(area) {
    area.innerHTML =
      '<div class="state-box state-loading" role="status" aria-live="polite">' +
        '<svg class="leaf-spinner" viewBox="0 0 44 44" aria-hidden="true">' +
          '<path d="M22 4 C 30 10 34 20 22 40 C 10 20 14 10 22 4 Z" fill="#7FA88B"/>' +
        '</svg>' +
        '<p>竹林里翻找中…</p>' +
      '</div>';
  }

  /** kind: 'empty'（无匹配关键词）/ 'empty-cat'（某分类暂无内容）/ 'empty-coll'（收藏为空）/ 'empty-hist'（历史为空）*/
  function renderEmpty(area, opts) {
    opts = opts || {};
    var kind = opts.kind || "empty";
    var catName = opts.catName;
    var keyword = opts.keyword;

    var badge = "暂无内容";
    var main = catName
      ? '「' + esc(catName) + '」下的情形还在赶来的路上（竹笋破土需要时间）。'
      : '这个分类下的情形还在赶来的路上（竹笋破土需要时间）。';
    var hint = "点击上方其他分类，或再点一次当前分类恢复全部。";
    var linkHtml = "";

    if (kind === "empty" && keyword) {
      badge = "没有找到相关内容";
      main = '换个关键词试试（比如「押金」「劝退」），或直接搜法条（如「劳动合同法」）。';
      hint = "清空搜索框即可恢复完整列表。";
    } else if (kind === "empty-card") {
      badge = "没找到这个情形";
      main = "可能链接已过期，或者页面没有传 slug。";
      hint = "去首页逛逛吧。";
      linkHtml = '<p style="margin-top: var(--space-3);"><a href="./index.html" class="state-link">← 返回首页</a></p>';
    } else if (kind === "empty-coll") {
      badge = "还没有收藏内容";
      main = "点首页卡片右下角的 ☆ 就能收藏你关心的情形。";
      hint = "";
      linkHtml = '<p style="margin-top: var(--space-3);"><a href="./index.html" class="state-link">去首页逛逛 →</a></p>';
    } else if (kind === "empty-hist") {
      badge = "还没有浏览记录";
      main = "去首页点开一张卡片，就开始学习了。";
      hint = "";
      linkHtml = '<p style="margin-top: var(--space-3);"><a href="./index.html" class="state-link">去首页逛逛 →</a></p>';
    }

    area.innerHTML =
      '<div class="state-box state-empty" role="status">' +
        '<span class="badge">' + esc(badge) + '</span>' +
        '<p>' + main + '</p>' +
        (hint ? '<p style="margin-top: var(--space-2); font-size: var(--font-size-sm);">' + esc(hint) + '</p>' : "") +
        linkHtml +
      '</div>';
  }

  function renderError(area, retryFn) {
    area.innerHTML =
      '<div class="state-box state-error" role="alert">' +
        '<span class="badge">加载失败</span>' +
        '<p>数据没能从竹林里搬出来（网络开小差了）。</p>' +
        '<button type="button" class="retry-btn">再试一次</button>' +
      '</div>';
    var btn = area.querySelector(".retry-btn");
    if (btn && typeof retryFn === "function") {
      btn.addEventListener("click", retryFn);
    }
  }

  /** 渲染卡片网格（首页列表 / 收藏列表 / 浏览列表 共用） */
  function renderCardList(area, opts) {
    var cards = opts.cards;
    var mode = opts.mode || "list";   // 'list' = 卡片网格 + 跳转链接 + 收藏按钮；'history' = 历史行（带时间胶囊）
    var showFav = opts.showFav !== false;
    var subtitle2 = opts.subtitle2;   // 例如「再点一次该分类恢复全部」

    if (mode === "history") {
      var rows = cards.map(function (entry) {
        var card = entry.card;
        if (!card) return "";   // slug 失效（卡被删了）就跳过
        return (
          '<li class="history-item">' +
            '<a class="history-link" href="./card.html?slug=' + esc(card.slug) + '">' +
              '<span class="history-time" aria-label="浏览于 ' + esc(entry.viewed_at) + '">' + esc(entry.viewed_at) + '</span>' +
              '<span class="history-title">' + esc(card.title) + '</span>' +
              '<span class="history-cat">' + esc(card.category) + '</span>' +
            '</a>' +
          '</li>'
        );
      }).join("");
      area.innerHTML =
        '<div class="state-success">' +
          '<p role="status" aria-live="polite" style="font-size: var(--font-size-sm); color: var(--bamboo-dark); margin-bottom: var(--space-3);">已浏览 ' + cards.length + ' 张卡片（最新在前）。</p>' +
          '<ul class="history-list">' + rows + '</ul>' +
        '</div>';
      return;
    }

    var html = cards.map(function (c) {
      var lawNames = (c.laws || []).map(function (l) { return esc(l.name); }).join("、");
      return (
        '<article class="card">' +
          '<h3><a class="card-title-link" href="./card.html?slug=' + esc(c.slug) + '">' + esc(c.title) + '</a></h3>' +
          '<p class="summary">' + esc(c.summary) + '</p>' +
          '<div class="card-meta">' +
            '<span class="card-tag">' + esc(c.category) + '</span>' +
            '<span>📄 ' + lawNames + '</span>' +
            '<span>· 核验 ' + esc(c.last_verified_at) + '</span>' +
            (showFav ? favBtnHtml(c.slug) : '') +
          '</div>' +
        '</article>'
      );
    }).join("");

    var conditions = [];
    if (opts.catName) conditions.push('已筛选「' + esc(opts.catName) + '」');
    if (opts.keyword) conditions.push('搜索「' + esc(opts.keyword) + '」');
    var countLine;
    if (conditions.length > 0) {
      var undo = opts.keyword ? '（清空搜索框恢复）' : '（再点一次该分类恢复全部）';
      countLine = conditions.join(' · ') + '：共 ' + cards.length + ' 个情形' + undo;
    } else if (subtitle2) {
      countLine = subtitle2;
    } else {
      countLine = '共 ' + cards.length + ' 个情形（示例数据 · Day 8–14 滚动补充到 12 个）';
    }
    area.innerHTML =
      '<div class="state-success">' +
        '<p role="status" aria-live="polite" style="font-size: var(--font-size-sm); color: var(--bamboo-dark); margin-bottom: var(--space-3);">' + countLine + '</p>' +
        '<div class="card-grid" style="padding: 0;">' + html + '</div>' +
      '</div>';
  }

  /** 渲染详情页（card.html） */
  function renderDetail(area, card) {
    var lawBlocks = (card.laws || []).map(function (l) {
      return (
        '<article class="law-card">' +
          '<h4>' + esc(l.name) + '</h4>' +
          '<p class="law-text">' + esc(l.text) + '</p>' +
          (l.source_url ? '<p class="law-source"><a href="' + esc(l.source_url) + '" target="_blank" rel="noopener noreferrer">原文出处 ↗</a></p>' : '') +
        '</article>'
      );
    }).join("");

    var stepList = (card.solution_steps || []).map(function (s, i) {
      return '<li class="step"><span class="step-num">' + (i + 1) + '</span><span class="step-text">' + esc(s) + '</span></li>';
    }).join("");

    area.innerHTML =
      '<article class="card-detail">' +
        '<h1>' + esc(card.title) + '</h1>' +
        '<p class="detail-summary">' + esc(card.summary) + '</p>' +
        '<div class="detail-meta">' +
          '<span class="card-tag">' + esc(card.category) + '</span>' +
          '<span>· 核验 ' + esc(card.last_verified_at) + '</span>' +
          favBtnHtml(card.slug) +
        '</div>' +
        '<section class="detail-section">' +
          '<h2>📌 发生了什么</h2>' +
          '<p>' + esc(card.scenario) + '</p>' +
        '</section>' +
        '<section class="detail-section">' +
          '<h2>🛠️ 第一步该做什么</h2>' +
          '<ol class="step-list">' + stepList + '</ol>' +
        '</section>' +
        '<section class="detail-section">' +
          '<h2>📖 相关法条（' + (card.laws || []).length + ' 条）</h2>' +
          lawBlocks +
        '</section>' +
        '<p class="detail-foot">' +
          '内容更新于 ' + esc(card.published_at) + ' · ' + esc(card.author_type) + ' · 复核：' + esc(card.reviewed_by) +
        '</p>' +
      '</article>';
  }

  /* ---------- Day 11：收藏交互 ---------- */

  /** 收藏按钮 HTML（已收藏时初始为金色已收藏态） */
  function favBtnHtml(slug) {
    var on = window.Store.isBookmarked(slug);
    return '<button type="button" class="fav-btn' + (on ? ' is-on' : '') + '"' +
      ' data-slug="' + esc(slug) + '" aria-pressed="' + (on ? 'true' : 'false') + '">' +
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

  function setFavState(btn, on) {
    btn.classList.toggle("is-on", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    btn.innerHTML = '<span class="fav-star" aria-hidden="true">' +
      (on ? '★' : '☆') + '</span>' + (on ? '已收藏' : '收藏');
  }

  function onFavClick(btn) {
    if (btn.disabled) return;
    var slug = btn.getAttribute("data-slug");
    var wasOn = btn.classList.contains("is-on");
    var prevHtml = btn.innerHTML;
    btn.disabled = true;
    btn.setAttribute("aria-busy", "true");
    btn.textContent = wasOn ? '取消中…' : '收藏中…';
    window.Store.toggleBookmark(slug)
      .then(function (nowOn) {
        setFavState(btn, nowOn);
        showToast(nowOn ? '已收藏！可在右上「我的收藏」查看' : '已取消收藏', false);
      })
      .catch(function () {
        btn.innerHTML = prevHtml;
        showToast('收藏没保存成功（网络开小差了），请再试一次', true);
      })
      .then(function () {
        btn.disabled = false;
        btn.removeAttribute("aria-busy");
      });
  }

  /** 把区域内的 .fav-btn 点击全部交给 onFavClick（事件委托，HTML 重渲染后自动重连）*/
  function attachFavHandler(area) {
    if (!area) return;
    area.addEventListener("click", function (e) {
      var btn = e.target && e.target.closest ? e.target.closest(".fav-btn") : null;
      if (btn && area.contains(btn)) onFavClick(btn);
    });
  }

  /** 暴露共用部分给所有页面 */
  window.UI = {
    esc: esc,
    renderLoading: renderLoading,
    renderEmpty: renderEmpty,
    renderError: renderError,
    renderCardList: renderCardList,
    renderDetail: renderDetail,
    showToast: showToast,
    favBtnHtml: favBtnHtml,
    setFavState: setFavState,
    onFavClick: onFavClick,
    attachFavHandler: attachFavHandler
  };

  /* ---------- 首页专属：分类筛选 + 搜索 ---------- */

  var area = document.getElementById("card-area");
  var demoSelect = document.getElementById("state-demo-select");
  var catList = document.querySelector(".category-list");
  var searchInput = document.getElementById("card-search");

  if (!area || (!catList && !searchInput)) return;   // 非首页，交给 page-*.js

  attachFavHandler(area);

  var activeCat = null;
  var activeKeyword = "";
  var loadSeq = 0;

  function loadCards(forceState, categoryId, keyword) {
    var mySeq = ++loadSeq;
    keyword = (keyword || "").trim();
    if (forceState === "empty") { UI.renderEmpty(area, { kind: keyword ? "empty" : "empty-cat", catName: categoryId ? Store.CATEGORY_NAME[categoryId] : null, keyword: keyword }); return; }
    if (forceState === "error") { UI.renderError(area, function () { loadCards("success", activeCat, activeKeyword); }); return; }
    UI.renderLoading(area);
    window.Store.searchCards(keyword, categoryId)
      .then(function (cards) {
        if (mySeq !== loadSeq) return;
        if (!cards || cards.length === 0) {
          UI.renderEmpty(area, { kind: keyword ? "empty" : "empty-cat", catName: categoryId ? Store.CATEGORY_NAME[categoryId] : null, keyword: keyword });
          return;
        }
        UI.renderCardList(area, {
          cards: cards, catName: categoryId ? Store.CATEGORY_NAME[categoryId] : null, keyword: keyword
        });
      })
      .catch(function () {
        if (mySeq !== loadSeq) return;
        UI.renderError(area, function () { loadCards("success", activeCat, activeKeyword); });
      });
  }

  function applyFilters(forceState) {
    loadCards(forceState || "success", activeCat, activeKeyword);
  }

  function syncChipStates() {
    if (!catList) return;
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
      activeCat = (activeCat === cat) ? null : cat;
      syncChipStates();
      applyFilters();
    });
  }

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
      if (e.key === "Enter") flushSearch();
    });
  }

  if (demoSelect) {
    demoSelect.addEventListener("change", function () {
      applyFilters(demoSelect.value);
    });
  }

  loadCards("success");
})();
/* js/page-bookmarks.js — 我的收藏
 *
 * 数据：Store.getCardsBySlugs(本地 slug 列表)
 * 4 态：加载 / 成功 / 空（还没收藏） / 错误
 * 测试钩子：?demoState=loading|error ; ?seed=1 预填演示数据（Store 顶部 seedForQA）
 */
(function () {
  "use strict";

  var area = document.getElementById("card-area");
  if (!area) return;

  var UI = window.UI;

  function getDemoState() {
    var m = location.search.match(/[?&]demoState=([^&]+)/);
    return m ? m[1] : "";
  }

  function readBookmarkSlugs() {
    try {
      var raw = JSON.parse(localStorage.getItem("LAW_BOOKMARKS") || "{}");
      if (!raw || typeof raw !== "object") return [];
      return Object.keys(raw).filter(function (k) { return raw[k]; });
    } catch (e) { return []; }
  }

  /** Day 27 修复（试用卡点 #1）：收藏页里取消收藏后，把这张卡片立即移出列表、
   *  计数同步减一；列表清空时切到「还没有收藏」空态。
   *  此前数据层已删但 UI 不动，用户要点一次刷新才见卡片消失。 */
  function onFavToggled(btn, nowOn) {
    if (nowOn) return;   // 收藏页列表里只处理「取消」
    var cardEl = btn.closest("article.card");
    if (cardEl && cardEl.parentNode) cardEl.parentNode.removeChild(cardEl);
    var left = area.querySelectorAll(".card-grid article.card").length;
    if (left === 0) { UI.renderEmpty(area, { kind: "empty-coll" }); return; }
    var line = area.querySelector(".state-success p[role='status']");
    if (line) line.textContent = "已收藏 " + left + " 个情形（点右下角 ☆ 取消收藏）";
  }

  function render() {
    var demo = getDemoState();
    if (demo === "loading") { UI.renderLoading(area); return; }
    if (demo === "error")   { UI.renderError(area, render); return; }

    UI.renderLoading(area);
    var slugs = readBookmarkSlugs();
    if (slugs.length === 0) {
      UI.renderEmpty(area, { kind: "empty-coll" });
      return;
    }
    window.Store.getCardsBySlugs(slugs)
      .then(function (cards) {
        if (cards.length === 0) {
          UI.renderEmpty(area, { kind: "empty-coll" });
          return;
        }
        UI.renderCardList(area, { cards: cards, subtitle2: "已收藏 " + cards.length + " 个情形（点右下角 ☆ 取消收藏）" });
        UI.attachFavHandler(area, { onToggle: onFavToggled });
      })
      .catch(function () {
        UI.renderError(area, render);
      });
  }

  render();

  /* Day 27 加练：从详情页「后退」回本页时，页面从 bfcache 原样恢复，
   * 期间在别处增删的收藏不会体现 —— 本页内容完全由 localStorage 派生，直接整页重渲染。 */
  window.addEventListener("pageshow", function (e) {
    if (e.persisted) render();
  });
})();
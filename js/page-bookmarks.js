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
        UI.attachFavHandler(area);
      })
      .catch(function () {
        UI.renderError(area, render);
      });
  }

  render();
})();
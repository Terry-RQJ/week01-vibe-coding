/* js/page-history.js — 浏览记录与偏好
 *
 * 数据：Store.getHistory()（按 viewed_at 倒序）+ Store.getCardsBySlugs(本地 join)
 * 4 态：加载 / 成功 / 空（还没浏览过） / 错误
 * 测试钩子：?demoState=loading|error ; ?seed=1 预填演示数据
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

  function render() {
    var demo = getDemoState();
    if (demo === "loading") { UI.renderLoading(area); return; }
    if (demo === "error")   { UI.renderError(area, render); return; }

    UI.renderLoading(area);
    window.Store.getHistory()
      .then(function (hist) {
        if (!Array.isArray(hist) || hist.length === 0) {
          UI.renderEmpty(area, { kind: "empty-hist" });
          return;
        }
        var slugs = hist.map(function (h) { return h.slug; });
        return window.Store.getCardsBySlugs(slugs).then(function (cards) {
          // join：保留 history 顺序，把卡对象附上
          var bySlug = Object.create(null);
          cards.forEach(function (c) { bySlug[c.slug] = c; });
          var entries = hist.map(function (h) {
            return { slug: h.slug, viewed_at: h.viewed_at, card: bySlug[h.slug] || null };
          });
          var valid = entries.filter(function (e) { return e.card; });
          if (valid.length === 0) {
            UI.renderEmpty(area, { kind: "empty-hist" });
            return;
          }
          UI.renderCardList(area, { cards: valid, mode: "history", showFav: false });
        });
      })
      .catch(function () {
        UI.renderError(area, render);
      });
  }

  render();

  /* Day 27 加练：从详情页「后退」回本页时，页面从 bfcache 原样恢复，
   * 期间新产生的浏览记录不会体现 —— 本页内容完全由 localStorage 派生，直接整页重渲染。 */
  window.addEventListener("pageshow", function (e) {
    if (e.persisted) render();
  })
})();
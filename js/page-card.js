/* js/page-card.js — 详情页（card.html?slug=xxx）
 *
 * 数据：Store.getCard(slug)（不存在 resolve(null)） + 进页自动记浏览历史
 * 4 态：加载 / 成功 / 空（无 slug 或卡被删） / 错误
 * 测试钩子：?demoState=loading|error
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
  function getSlug() {
    var m = location.search.match(/[?&]slug=([^&]+)/);
    return m ? decodeURIComponent(m[1]) : "";
  }

  function render() {
    var demo = getDemoState();
    if (demo === "loading") { UI.renderLoading(area); return; }
    if (demo === "error")   { UI.renderError(area, render); return; }

    var slug = getSlug();
    if (!slug) {
      UI.renderEmpty(area, { kind: "empty-card" });
      return;
    }

    UI.renderLoading(area);
    window.Store.getCard(slug)
      .then(function (card) {
        if (!card) {
          UI.renderEmpty(area, { kind: "empty-card" });
          return;
        }
        // 成功后：自动记录浏览历史 + 设置面包屑 slug（详情页导航不展示自身）
        window.Store.addHistory(slug).then(function () {
          UI.renderDetail(area, card);
          UI.attachFavHandler(area);
        });
      })
      .catch(function () {
        UI.renderError(area, render);
      });
  }

  render();
})();
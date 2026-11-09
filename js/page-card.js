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

    /* Day 44：返回箭头智能指向——
     * ① URL 带 from=news（热点页跳来的）→ 回热点页
     * ② 来源页本身就是热点页（直接输网址进来的极少）→ 回热点页
     * ③ 有浏览历史 → history.back()（回真正来时的页面，收藏页/搜索结果都能回）
     * ④ 兜底 → 首页 */
    (function () {
      var back = document.getElementById("card-back");
      if (!back) return;
      var m = location.search.match(/[?&]from=([^&]*)/);
      var from = m ? decodeURIComponent(m[1]) : "";
      if (!from && document.referrer && /news\.html/.test(document.referrer)) from = "news";
      if (from === "news") {
        back.href = "./news.html";
        back.textContent = "← 返回热点";
      } else if (history.length > 1) {
        back.href = "javascript:void(0)";
        back.addEventListener("click", function (e) { e.preventDefault(); history.back(); });
      }
    })();
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
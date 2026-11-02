/* js/page-news.js — 「法律热点」页（Day 37）
 *
 * 数据：Store.getNews(limit)——GET /api/news 优先（只含已人工确认上线的条目），
 * 断网/接口挂掉回落 data/news.js。候选条目永远到不了这个页面。
 *
 * 每条新闻：日期徽标 + 标题（有原文链接则可点）+ 摘要 + 来源 + 站内关联卡入口。
 * 关联卡的标题不单独发请求——点「去看站内解读」直接跳 card.html?slug=xxx，
 * 详情页自己会处理加载，避免列表页为 N 张卡打 N 个接口。
 */
(function () {
  "use strict";

  var area = document.getElementById("news-area");

  /** YYYY-MM-DD → 「11 月 2 日」 */
  function fmtDate(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
    if (!m) return UI.esc(iso || "");
    return Number(m[2]) + " 月 " + Number(m[3]) + " 日";
  }

  function render(items) {
    if (!items || !items.length) {
      area.innerHTML =
        '<div class="state-box state-empty" role="status">' +
          '<span class="badge">还没有上线的热点</span>' +
          '<p>热点由官方渠道精选、人工确认后发布，请稍后再来看看。</p>' +
        "</div>";
      return;
    }

    var rows = items.map(function (n) {
      var title = UI.esc(n.title);
      if (n.sourceUrl) {
        title = '<a href="' + UI.esc(n.sourceUrl) + '" target="_blank" rel="noopener noreferrer" ' +
                'style="color: inherit; text-decoration: none;">' + title + " ↗</a>";
      }
      var related = "";
      if (n.relatedCardSlug) {
        related =
          '<a class="chip" href="./card.html?slug=' + encodeURIComponent(n.relatedCardSlug) + '" ' +
          'style="align-self: flex-start; text-decoration: none;">去看站内解读 →</a>';
      }
      var source = n.sourceUrl
        ? '<a href="' + UI.esc(n.sourceUrl) + '" target="_blank" rel="noopener noreferrer">来源：' +
          UI.esc(n.sourceName) + " ↗</a>"
        : "来源：" + UI.esc(n.sourceName);
      return (
        '<article class="card" style="display: flex; flex-direction: column; gap: var(--space-2); padding: var(--space-4);">' +
          '<div style="display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap;">' +
            '<span class="badge">' + fmtDate(n.newsDate) + "</span>" +
            '<h2 style="font-size: var(--font-size-lg); margin: 0;">' + title + "</h2>" +
          "</div>" +
          '<p style="margin: 0; color: var(--bamboo-dark);">' + UI.esc(n.summary) + "</p>" +
          '<div style="display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); flex-wrap: wrap; font-size: var(--font-size-sm);">' +
            '<span style="color: var(--bamboo-dark);">' + source + "</span>" + related +
          "</div>" +
        "</article>"
      );
    });

    area.innerHTML = rows.join("");
  }

  function renderError() {
    area.innerHTML =
      '<div class="state-box state-error" role="alert">' +
        '<span class="badge">热点暂时刷不出来</span>' +
        '<p>网络不太顺，请稍后再试一次。</p>' +
      "</div>";
  }

  renderLoading(area);
  Store.getNews(30).then(render, renderError);

  /** 复用 ui.js 的加载态骨架（若可用），否则简单占位 */
  function renderLoading(box) {
    if (window.UI && UI.renderLoading) { UI.renderLoading(box); return; }
    box.innerHTML = '<div class="state-box" role="status"><span class="badge">加载中…</span></div>';
  }
})();

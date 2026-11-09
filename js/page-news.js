/* js/page-news.js — 「法律热点」页（Day 37 建立，Day 44 自动化增强）
 *
 * 数据：Store.getNews(limit) —— GET /api/news 优先（只含已上线条目），断网回落 data/news.js。
 *
 * Day 44 增强：
 *   ① 按日期分组（今天 / 昨天 / 更早），一天几条聚在一起，比平铺更像「日报」
 *   ② 每条都有「这跟你有啥关系」解读块（takeaway）——这是用户要的核心：
 *      光知道「国家出了个新规」没用，得说清对普通人意味着什么
 *   ③ 顶部显示「今日已更新 / 上次更新于 X」——数据诚实，抓挂了一眼能看出来
 *   ④ 关联卡入口：有 relatedCardSlug 才显示，避免点了跳空
 */
(function () {
  "use strict";

  var area = document.getElementById("news-area");
  var statusBar = document.getElementById("news-status");

  /** YYYY-MM-DD → 「11 月 2 日」 */
  function fmtDate(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
    if (!m) return UI.esc(iso || "");
    return Number(m[2]) + " 月 " + Number(m[3]) + " 日";
  }

  /** 今天 / 昨天 / 具体日期 */
  function groupLabel(iso) {
    var d = String(iso || "").slice(0, 10);
    if (!d) return "近期";
    var now = new Date(Date.now() + 8 * 3600 * 1000);
    var t = now.toISOString().slice(0, 10);
    var y = new Date(now.getTime() - 86400000).toISOString().slice(0, 10);
    if (d === t) return "今天 · " + fmtDate(d);
    if (d === y) return "昨天 · " + fmtDate(d);
    return fmtDate(d);
  }

  /** 相对时间：「3 分钟前」「2 小时前」 */
  function relTime(runDate) {
    var d = String(runDate || "").slice(0, 10);
    var t = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
    if (d === t) return "今天已更新";
    if (!d) return "";
    return "上次更新于 " + fmtDate(d);
  }

  function renderStatus(meta) {
    if (!statusBar) return;
    var run = (meta && meta.lastRun) || null;
    if (!run) { statusBar.innerHTML = ""; return; }
    var fresh = relTime(run.runDate);
    var isToday = fresh === "今天已更新";
    var dot = isToday ? "#2E7D52" : "#B5533C";
    statusBar.innerHTML =
      '<span style="display: inline-flex; align-items: center; gap: 6px; font-size: var(--font-size-sm); color: var(--bamboo-dark);">' +
        '<span style="width: 7px; height: 7px; border-radius: 50%; background: ' + dot + '; display: inline-block;"></span>' +
        UI.esc(fresh) +
        (run.added ? " · 新增 " + run.added + " 条" : "") +
        (run.status === "ok" ? "" : " · 本次抓取未完全成功") +
      "</span>";
  }

  function newsHtml(n) {
    var title = UI.esc(n.title);
    if (n.sourceUrl) {
      title = '<a href="' + UI.esc(n.sourceUrl) + '" target="_blank" rel="noopener noreferrer" ' +
              'style="color: inherit; text-decoration: none;">' + title + " ↗</a>";
    }
    var takeaway = n.takeaway
      ? '<div style="margin-top: var(--space-2); padding: var(--space-3); border-left: 3px solid var(--bamboo-mid, #4A8A5C); ' +
        'background: rgba(74,138,92,0.07); border-radius: 0 8px 8px 0;">' +
          '<div style="font-size: var(--font-size-xs, 12px); font-weight: bold; color: #1F4A3A; letter-spacing: 1px; margin-bottom: 4px;">这跟你有什么关系</div>' +
          '<p style="margin: 0; font-size: var(--font-size-sm); line-height: 1.75; color: var(--bamboo-dark);">' +
            UI.esc(n.takeaway) + "</p>" +
        "</div>"
      : "";
    var related = n.relatedCardSlug
      ? '<a class="chip" href="./card.html?slug=' + encodeURIComponent(n.relatedCardSlug) + '&from=news" ' +
        'style="align-self: flex-start; text-decoration: none;">看站内解读 →</a>'
      : "";
    var source = n.sourceUrl
      ? '<a href="' + UI.esc(n.sourceUrl) + '" target="_blank" rel="noopener noreferrer">' + UI.esc(n.sourceName) + " ↗</a>"
      : UI.esc(n.sourceName);

    return (
      '<article style="display: flex; flex-direction: column; gap: var(--space-2); padding: var(--space-4); background: #fff; border: 1px solid rgba(31,74,58,0.12); border-radius: 14px;">' +
        '<h2 style="font-size: var(--font-size-lg); margin: 0; line-height: 1.45;">' + title + "</h2>" +
        '<p style="margin: 0; color: var(--bamboo-dark); line-height: 1.7;">' + UI.esc(n.summary) + "</p>" +
        takeaway +
        '<div style="display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); flex-wrap: wrap; font-size: var(--font-size-sm);">' +
          '<span style="color: #7A8A7E;">' + source + "</span>" + related +
        "</div>" +
      "</article>"
    );
  }

  function render(items, meta) {
    renderStatus(meta);
    if (!items || !items.length) {
      area.innerHTML =
        '<div class="state-box state-empty" role="status">' +
          '<span class="badge">还没有上线的热点</span>' +
          '<p>热点每天自动更新。如果这里一直是空的，说明最近几次抓取都没通过校验，可以稍后再来看看。</p>' +
        "</div>";
      return;
    }

    // 按日期分组（接口已按日期倒序，这里只做相邻归并，不额外排序）
    var groups = [];
    items.forEach(function (n) {
      var label = groupLabel(n.newsDate);
      var g = groups[groups.length - 1];
      if (!g || g.label !== label) { g = { label: label, items: [] }; groups.push(g); }
      g.items.push(n);
    });

    area.innerHTML = groups.map(function (g) {
      return '<section style="display: grid; gap: var(--space-3);">' +
        '<h2 style="font-size: var(--font-size-sm); margin: 0; letter-spacing: 2px; color: #1F4A3A; ' +
        'display: flex; align-items: center; gap: var(--space-2);">' +
          '<span style="flex: 1; height: 1px; background: rgba(31,74,58,0.18);"></span>' +
          '<span>' + UI.esc(g.label) + "</span>" +
          '<span style="flex: 1; height: 1px; background: rgba(31,74,58,0.18);"></span>' +
        "</h2>" +
        g.items.map(newsHtml).join("") +
      "</section>";
    }).join("");
  }

  function renderError() {
    if (statusBar) statusBar.innerHTML = "";
    area.innerHTML =
      '<div class="state-box state-error" role="alert">' +
        '<span class="badge">热点暂时刷不出来</span>' +
        '<p>网络不太顺，请稍后再试一次。</p>' +
      "</div>";
  }

  if (window.UI && UI.renderLoading) UI.renderLoading(area);
  else area.innerHTML = '<div class="state-box" role="status"><span class="badge">加载中…</span></div>';

  // 首页只要最近一周，热点页给全量（取 30 条，约一个月）
  // 注意 getNewsFull 返回整个信封 { ok, data, meta }，必须拆开再给 render
  // （Day 44 初版漏了这一步，render 收到信封当条目列表 → 永远显示「还没有上线的热点」）
  var loader = Store.getNewsFull ? Store.getNewsFull(30) : Store.getNews(30);
  loader.then(function (j) {
    if (j && j.data) render(j.data, j.meta);
    else render(j, null);              // 回落路径直接给数组
  }, renderError);

  /* 手动刷新按钮：带时间戳强制绕过 CDN/浏览器缓存重拉，并重渲染。
   * 它刷新的是「显示」，不是内容生产——新内容由每天 09:30 的定时任务产出。 */
  var refreshBtn = document.getElementById("news-refresh");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", function () {
      var btn = refreshBtn;
      btn.disabled = true;
      btn.textContent = "刷新中…";
      fetch(API_BASE_CACHEBUST(), { cache: "no-store" })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          btn.disabled = false;
          btn.textContent = "🔄 立即更新热点";
          if (j && j.ok) {
            render(j.data, j.meta);
            btn.textContent = "已更新 · 共 " + (j.data || []).length + " 条";
            setTimeout(function () { btn.textContent = "🔄 立即更新热点"; }, 2500);
          }
        })
        .catch(function () {
          btn.disabled = false;
          btn.textContent = "刷新失败，再点一次";
        });
    });
  }
  function API_BASE_CACHEBUST() {
    return "https://rqj-2006-d0gl1ael531a243a1-1497985433.ap-shanghai.app.tcloudbase.com/api/news?limit=30&t=" + Date.now();
  }
})();

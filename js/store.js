/* js/store.js — 唯一数据访问层（TECH_DESIGN v3.0 §7 契约的 Day 13 实现）
 *
 * Day 8 用 setTimeout 模拟网络延迟（600ms）——「加载中 / 错误」
 * 状态是真实经过的路径，不是摆拍。第 3 周接真实 API 时，只改这个
 * 文件的内部实现，页面代码零改动（这是纯静态路线保留的升级缝隙）。
 *
 * Day 11：收藏从纯内存升级为 localStorage（PRD §8.3）
 * Day 13：浏览记录（localStorage，按 viewed_at 倒序，上限 50 条）
 *         + getCardsBySlugs（收藏/历史页的子集取卡）
 *         + seedForQA（?seed=1 给空状态预填演示数据，便于截图）
 */
(function () {
  "use strict";

  var MOCK_DELAY = 600;
  var HISTORY_KEY = "LAW_HISTORY";
  var BOOKMARKS_KEY = "LAW_BOOKMARKS";
  var HISTORY_MAX = 50;

  /* QA 钩子：seed=1 时给空 localStorage 预填演示数据，便于「成功」态截图
   * 注意：必须在模块顶部、读 localStorage 之前调用（否则 Store 副本感知不到） */
  function seedForQA() {
    try {
      var s = location.search;
      if (!/[?&]seed=1(?=&|$)/.test(s)) return;

      var bm = JSON.parse(localStorage.getItem(BOOKMARKS_KEY) || "{}");
      var bmEmpty = !bm || typeof bm !== "object" || Object.keys(bm).length === 0;
      if (bmEmpty) {
        localStorage.setItem(BOOKMARKS_KEY, JSON.stringify({
          "gongsi-quantui": true,
          "guoqi-shipin": true
        }));
      }
      var hist = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
      if (!Array.isArray(hist) || hist.length === 0) {
        localStorage.setItem(HISTORY_KEY, JSON.stringify([
          { slug: "guoqi-shipin", viewed_at: today() },
          { slug: "dianche-pengzhuang", viewed_at: yesterday() }
        ]));
      }
    } catch (e) { /* localStorage 不可用就跳过 */ }
  }

  function today() {
    var d = new Date();
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }
  function yesterday() {
    var d = new Date(); d.setDate(d.getDate() - 1);
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }
  function pad(n) { return n < 10 ? "0" + n : "" + n; }

  /* 必须在所有 localStorage 读取之前执行！ */
  seedForQA();

  /* 分类 id → 名称（首页筛选/搜索共用一份映射，避免两处各写一份走偏） */
  var CATEGORY_NAME = {
    labor: "劳动类", consume: "消费类", loan: "借贷类",
    marriage: "婚姻家庭类", traffic: "交通类", neighbor: "邻里 / 名誉类"
  };

  /* ---------- 收藏（localStorage 持久化，Day 11→13 升级）----------
   * 内存 cache 与 localStorage 双向同步；页面加载时从 localStorage 读一次。
   * 后续接真实 API 时只改 toggleBookmark 的内部实现。 */
  var bookmarks = loadBookmarks();

  function loadBookmarks() {
    try {
      var raw = JSON.parse(localStorage.getItem(BOOKMARKS_KEY) || "{}");
      return (raw && typeof raw === "object") ? raw : {};
    } catch (e) { return {}; }
  }
  function saveBookmarks() {
    try { localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(bookmarks)); }
    catch (e) { /* 容量满或禁用就跳过 —— UI 仍按本次成功展示，下一次刷新才丢 */ }
  }

  /* ---------- 浏览记录（Day 13 新增）---------- */
  function loadHistory() {
    try {
      var raw = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
      return Array.isArray(raw) ? raw : [];
    } catch (e) { return []; }
  }
  function saveHistory(list) {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(list)); }
    catch (e) { /* 同上 */ }
  }

  /** 失败路径测试钩子：URL 加 ?bookmarkFail=1 可稳定复现「出错」 */
  function bookmarkShouldFail() {
    return /[?&]bookmarkFail=1(?=&|$)/.test(window.location.search);
  }

  /** 模拟一个可能失败的网络请求 */
  function fakeFetch(data) {
    return new Promise(function (resolve, reject) {
      setTimeout(function () {
        resolve(JSON.parse(JSON.stringify(data)));
      }, MOCK_DELAY);
    });
  }

  /** 把一张卡拼成可搜索的文本（小写；标题/摘要/情景/标签/步骤/法条解析全参与） */
  function cardHaystack(c) {
    var parts = [
      c.title, c.summary, c.scenario, c.category,
      (c.tags || []).join(" "),
      (c.solution_steps || []).join(" "),
      (c.laws || []).map(function (l) { return (l.name || "") + " " + (l.text || ""); }).join(" ")
    ];
    return parts.join(" ").toLowerCase();
  }

  /** ---------- 公开 API ---------- */

  window.Store = {
    CATEGORY_NAME: CATEGORY_NAME,

    /** 切换收藏：resolve(true)=已收藏，resolve(false)=已取消；失败 reject */
    toggleBookmark: function (slug) {
      return new Promise(function (resolve, reject) {
        setTimeout(function () {
          if (bookmarkShouldFail()) { reject(new Error("mock network error")); return; }
          if (bookmarks[slug]) { delete bookmarks[slug]; saveBookmarks(); resolve(false); }
          else { bookmarks[slug] = true; saveBookmarks(); resolve(true); }
        }, MOCK_DELAY);
      });
    },

    /** 当前是否已收藏（同步；渲染卡片初始状态用） */
    isBookmarked: function (slug) {
      return !!bookmarks[slug];
    },

    /** 全部已发布卡片，按发布时间倒序 */
    listCards: function () {
      var cards = (window.LAW_CARDS || []).filter(function (c) {
        return c.status === "published";
      });
      cards.sort(function (a, b) {
        return b.published_at.localeCompare(a.published_at);
      });
      return fakeFetch(cards);
    },

    /** 按分类取卡片 */
    listCardsByCategory: function (categoryId) {
      var name = CATEGORY_NAME[categoryId];
      var cards = (window.LAW_CARDS || []).filter(function (c) {
        return c.category === name && c.status === "published";
      });
      return fakeFetch(cards);
    },

    /** Day 13：关键词搜索（可叠加分类筛选）
     * 匹配范围：标题 / 摘要 / 情景 / 标签 / 应对步骤 / 法条解析（法条名称 + 原文）。
     * keyword 为空且无分类时 = 全量列表，等价于 listCards()。
     */
    searchCards: function (keyword, categoryId) {
      var kw = (keyword || "").trim().toLowerCase();
      var catName = categoryId ? CATEGORY_NAME[categoryId] : null;
      var cards = (window.LAW_CARDS || []).filter(function (c) {
        if (c.status !== "published") return false;
        if (catName && c.category !== catName) return false;
        if (!kw) return true;
        return cardHaystack(c).indexOf(kw) !== -1;
      });
      cards.sort(function (a, b) {
        return b.published_at.localeCompare(a.published_at);
      });
      return fakeFetch(cards);
    },

    /** 分类目录 */
    listCategories: function () {
      return fakeFetch(window.LAW_CATEGORIES || []);
    },

    /** 按 slug 取单张卡（详情页用） */
    getCard: function (slug) {
      var found = (window.LAW_CARDS || []).find(function (c) { return c.slug === slug; });
      return fakeFetch(found || null);
    },

    /** Day 13：按 slug 列表取卡（收藏页 / 历史页用，按传入顺序保留） */
    getCardsBySlugs: function (slugs) {
      var map = Object.create(null);
      (slugs || []).forEach(function (s) { if (s) map[s] = true; });
      var list = (window.LAW_CARDS || []).filter(function (c) {
        return map[c.slug] && c.status === "published";
      });
      return fakeFetch(list);
    },

    /** Day 13：浏览记录（按 viewed_at 倒序） */
    getHistory: function () {
      var list = loadHistory();
      list.sort(function (a, b) { return b.viewed_at.localeCompare(a.viewed_at); });
      return fakeFetch(list);
    },

    /** Day 13：追加一条浏览（同一 slug 移到最前，最多 50 条）
     *  Day 14：viewed_at 改成完整 ISO（带时分秒），让浏览记录能显示「刚刚 / X 分钟前」
     *  旧值（只有日期）仍能被 formatRelativeTime 解析为「昨天 / X 天前」 */
    addHistory: function (slug) {
      var list = loadHistory().filter(function (h) { return h.slug !== slug; });
      list.unshift({ slug: slug, viewed_at: new Date().toISOString() });
      if (list.length > HISTORY_MAX) list = list.slice(0, HISTORY_MAX);
      saveHistory(list);
      return fakeFetch(true);
    }
  };
})();
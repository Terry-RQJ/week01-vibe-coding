/* js/store.js — 唯一数据访问层（TECH_DESIGN v3.0 §7 契约的 Day 8 最小实现）
 *
 * Day 8 用 setTimeout 模拟网络延迟（600ms）——这样「加载中 / 错误」
 * 状态是真实经过的路径，不是摆拍。第 3 周接真实 API 时，只改这个
 * 文件的内部实现，页面代码零改动（这是纯静态路线保留的升级缝隙）。
 */
(function () {
  "use strict";

  var MOCK_DELAY = 600;

  /* 分类 id → 名称（首页筛选/搜索共用一份映射，避免两处各写一份走偏） */
  var CATEGORY_NAME = {
    labor: "劳动类", consume: "消费类", loan: "借贷类",
    marriage: "婚姻家庭类", traffic: "交通类", neighbor: "邻里 / 名誉类"
  };

  /* ---------- Day 11：收藏（前端临时状态，不落盘）----------
   * 状态只放内存：刷新页面即重置。后续接 localStorage / 真实 API 时，
   * 只改下面两个函数的内部实现，页面代码零改动（同 listCards 的升级缝隙）。
   */
  var bookmarks = Object.create(null);   // slug -> true

  /** 失败路径测试钩子：URL 加 ?bookmarkFail=1 可稳定复现「出错」 */
  function bookmarkShouldFail() {
    return /[?&]bookmarkFail=1(?=&|$)/.test(window.location.search);
  }

  /** 模拟一个可能失败的网络请求 */
  function fakeFetch(data) {
    return new Promise(function (resolve, reject) {
      setTimeout(function () {
        // Day 8：正常路径永远成功；错误态由 ui.js 的演示器直接注入。
        // 第 3 周换成真 fetch 后，reject 分支走真实网络错误。
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

  window.Store = {
    /** 切换收藏：resolve(true)=已收藏，resolve(false)=已取消；失败 reject */
    toggleBookmark: function (slug) {
      return new Promise(function (resolve, reject) {
        setTimeout(function () {
          if (bookmarkShouldFail()) { reject(new Error("mock network error")); return; }
          if (bookmarks[slug]) { delete bookmarks[slug]; resolve(false); }
          else { bookmarks[slug] = true; resolve(true); }
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

    /** 按 slug 取单张卡 */
    getCard: function (slug) {
      var found = (window.LAW_CARDS || []).find(function (c) { return c.slug === slug; });
      return fakeFetch(found || null);
    }
  };
})();

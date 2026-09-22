/* js/store.js — 唯一数据访问层（TECH_DESIGN v3.0 §7 契约的 Day 8 最小实现）
 *
 * Day 8 用 setTimeout 模拟网络延迟（600ms）——这样「加载中 / 错误」
 * 状态是真实经过的路径，不是摆拍。第 3 周接真实 API 时，只改这个
 * 文件的内部实现，页面代码零改动（这是纯静态路线保留的升级缝隙）。
 */
(function () {
  "use strict";

  var MOCK_DELAY = 600;

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

  window.Store = {
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
      var map = {
        labor: "劳动类", consume: "消费类", loan: "借贷类",
        marriage: "婚姻家庭类", traffic: "交通类", neighbor: "邻里 / 名誉类"
      };
      var name = map[categoryId];
      var cards = (window.LAW_CARDS || []).filter(function (c) {
        return c.category === name && c.status === "published";
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

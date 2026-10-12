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
    if (left === 0) { setExportVisible(false); UI.renderEmpty(area, { kind: "empty-coll" }); return; }
    var line = area.querySelector(".state-success p[role='status']");
    if (line) line.textContent = "已收藏 " + left + " 个情形（点右下角 ☆ 取消收藏）";
  }

  /* ---------- Day 28 加练：导出收藏（JSON）----------
   * 兑现 TECH_DESIGN 里「跨设备搬收藏用导出/导入 JSON（不上云）」的设计意图。
   * 纯浏览器本地生成文件：读 localStorage 的 slug 列表 → 取卡片信息 → Blob 下载。
   * 不发任何请求，不经过服务器（PRD §8.3 的隐私口径不变）。 */
  function buildExportPayload(cards) {
    return {
      format: "law-mini-site/bookmarks@1",
      site: "法律小科普轻站",
      exported_at: new Date().toISOString(),
      count: cards.length,
      note: "这是浏览器本地收藏的备份文件。收藏本身不上传服务器，此文件也只保存在你自己的设备上。",
      bookmarks: cards.map(function (c) {
        return { slug: c.slug, title: c.title, category: c.category, last_verified_at: c.last_verified_at };
      })
    };
  }

  function downloadJson(filename, text) {
    var blob = new Blob([text], { type: "application/json;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
  }

  function onExportClick() {
    var slugs = readBookmarkSlugs();
    if (slugs.length === 0) {
      UI.showToast("还没有收藏可以导出", true);
      return;
    }
    window.Store.getCardsBySlugs(slugs)
      .then(function (cards) {
        if (!cards.length) {
          UI.showToast("没有可导出的收藏（卡片可能已下线）", true);
          return;
        }
        var payload = buildExportPayload(cards);
        downloadJson("法条收藏-" + new Date().toISOString().slice(0, 10) + ".json", JSON.stringify(payload, null, 2));
        UI.showToast("已导出 " + cards.length + " 条收藏（文件已下载到本机）", false);
      })
      .catch(function () {
        UI.showToast("导出失败，请稍后再试一次", true);
      });
  }

  /** 有收藏时才显示导出入口 */
  function setExportVisible(on) {
    if (!exportRow) return;
    exportRow.style.display = on ? "flex" : "none";
  }

  var exportRow = document.getElementById("export-row");
  var exportBtn = document.getElementById("export-fav");
  if (exportBtn) exportBtn.addEventListener("click", onExportClick);
  // 测试钩子：headless 下无法真的收文件，用它直接取导出内容做校验
  window.__day28_exportPayload = buildExportPayload;

  function render() {
    var demo = getDemoState();
    if (demo === "loading") { UI.renderLoading(area); setExportVisible(false); return; }
    if (demo === "error")   { UI.renderError(area, render); setExportVisible(false); return; }

    UI.renderLoading(area);
    var slugs = readBookmarkSlugs();
    if (slugs.length === 0) {
      setExportVisible(false);
      UI.renderEmpty(area, { kind: "empty-coll" });
      return;
    }
    window.Store.getCardsBySlugs(slugs)
      .then(function (cards) {
        if (cards.length === 0) {
          setExportVisible(false);
          UI.renderEmpty(area, { kind: "empty-coll" });
          return;
        }
        setExportVisible(true);
        UI.renderCardList(area, { cards: cards, subtitle2: "已收藏 " + cards.length + " 个情形（点右下角 ☆ 取消收藏）" });
        UI.attachFavHandler(area, { onToggle: onFavToggled });
      })
      .catch(function () {
        setExportVisible(false);
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
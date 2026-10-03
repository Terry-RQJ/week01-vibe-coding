/* js/page-check.js — 检查台（Day 20）
 *
 * 三个检查项全部直连公网 API（不走 Store 的 mock 回落——检查台要看的就是真 API 行为）：
 *   ① GET /api/health          健康状态
 *   ② GET /api/cards|categories 核心表真实数据（CloudBase PostgreSQL）
 *   ③ POST /api/favorites      写入测试（200 收藏 / 409 重复 / 取消幂等）+ 读回
 * 加练：每次数据刷新更新「最后更新时间」。
 * 交互遵循 legal-site-interaction Skill：原生 button、三态（禁用+aria-busy）、esc() 转义。
 */
(function () {
  "use strict";

  var API_BASE = "https://rqj-2006-d0gl1ael531a243a1-1497985433.ap-shanghai.app.tcloudbase.com/api";
  var API_TIMEOUT = 8000;

  /* ---------- 小工具 ---------- */

  function esc(s) { return window.UI ? window.UI.esc(s) : String(s == null ? "" : s); }

  function nowStr() {
    var d = new Date(), p = function (n) { return n < 10 ? "0" + n : "" + n; };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
  }

  /** 加练：每次刷新数据，同步「最后更新时间」 */
  function touchUpdated() {
    var el = document.getElementById("check-updated");
    if (el) el.textContent = "最后更新：" + nowStr();
  }

  /** fetch 封装：超时 + 返回 { status, ok, body }（body 已 JSON.parse，失败给原文） */
  function request(path, options) {
    var ctrl = (typeof AbortController !== "undefined") ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, API_TIMEOUT);
    return fetch(API_BASE + path, Object.assign({ signal: ctrl ? ctrl.signal : undefined }, options || {}))
      .then(function (res) {
        clearTimeout(timer);
        return res.text().then(function (t) {
          var body;
          try { body = JSON.parse(t); } catch (e) { body = t.slice(0, 300); }
          return { status: res.status, ok: res.ok, body: body };
        });
      })
      .catch(function (err) {
        clearTimeout(timer);
        return { status: 0, ok: false, body: { error: { message: "请求失败：" + err.message } } };
      });
  }

  function setStatus(id, ok, text) {
    var el = document.getElementById(id);
    if (!el) return;
    el.textContent = text;
    el.className = "check-status " + (ok === null ? "" : ok ? "is-ok" : "is-bad");
  }

  /* ---------- ① 健康状态 ---------- */

  function checkHealth() {
    return request("/health").then(function (r) {
      var b = r.body || {};
      if (r.ok && b.ok) {
        setStatus("health-status", true,
          "正常 · service=" + b.service + " · version=" + b.version + " · 服务器时间 " + b.time);
      } else {
        setStatus("health-status", false, "异常 · HTTP " + r.status + " · " + JSON.stringify(b).slice(0, 200));
      }
      touchUpdated();
    });
  }

  /* ---------- ② 核心表真实数据 ---------- */

  function checkData() {
    var catReq = request("/categories");
    var cardReq = request("/cards?limit=50");

    return catReq.then(function (cats) {
      var catList = document.getElementById("cat-list");
      if (catList) catList.innerHTML = "";
      if (cats.ok && cats.body.ok) {
        (cats.body.data || []).forEach(function (c) {
          var li = document.createElement("li");
          li.innerHTML = esc(c.name) + '：<b>' + esc(String(c.count)) + "</b> 张";
          if (catList) catList.appendChild(li);
        });
      } else {
        setStatus("data-status", false, "分类加载失败 · HTTP " + cats.status);
      }

      return cardReq.then(function (cards) {
        var tbody = document.getElementById("card-rows");
        if (tbody) tbody.innerHTML = "";
        var select = document.getElementById("write-slug");
        if (select) select.innerHTML = "";

        if (cards.ok && cards.body.ok) {
          var rows = cards.body.data || [];
          rows.forEach(function (c) {
            var tr = document.createElement("tr");
            tr.innerHTML = "<td><code>" + esc(c.slug) + "</code></td><td>" + esc(c.title) +
              "</td><td>" + esc(c.category) + "</td><td>" + esc(c.published_at) + "</td>";
            if (tbody) tbody.appendChild(tr);
            if (select) {
              var opt = document.createElement("option");
              opt.value = c.slug;
              opt.textContent = c.title + "（" + c.slug + "）";
              select.appendChild(opt);
            }
          });
          var total = cards.body.meta ? cards.body.meta.total : rows.length;
          setStatus("data-status", true,
            "cards 表 " + total + " 张已发布卡片（上表）· categories 聚合见上 · 均来自 PostgreSQL 真实数据");
        } else {
          setStatus("data-status", false, "卡片加载失败 · HTTP " + cards.status);
        }
        touchUpdated();
      });
    });
  }

  /* ---------- ③ 写入测试 ---------- */

  function setBusy(btn, busy, busyText) {
    if (!btn) return;
    btn.disabled = busy;
    btn.setAttribute("aria-busy", busy ? "true" : "false");
    if (busy) { btn.dataset.label = btn.textContent; btn.textContent = busyText || "请求中…"; }
    else if (btn.dataset.label) { btn.textContent = btn.dataset.label; }
  }

  function showWriteResult(title, r) {
    var el = document.getElementById("write-result");
    if (!el) return;
    el.textContent = title + " → HTTP " + r.status + "\n" + JSON.stringify(r.body, null, 2);
    el.className = "check-result " + (r.ok ? "is-ok" : "is-bad");
    touchUpdated();
  }

  function writeTest(on) {
    var select = document.getElementById("write-slug");
    var clientInput = document.getElementById("write-client");
    var btn = document.getElementById(on ? "btn-fav" : "btn-unfav");
    if (!select || !select.value) return;
    var clientId = (clientInput && clientInput.value.trim()) || "day20-check";

    setBusy(btn, true);
    request("/favorites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: select.value, on: on, client_id: clientId })
    }).then(function (r) {
      setBusy(btn, false);
      showWriteResult((on ? "收藏" : "取消") + " " + select.value, r);
      // 写完顺带读回列表（GET），证明写入可见
      return request("/favorites?client_id=" + encodeURIComponent(clientId)).then(function (r2) {
        var el = document.getElementById("write-result");
        if (el && r2.ok) {
          var slugs = (r2.body.data || []).map(function (f) { return f.slug; }).join(", ") || "（空）";
          el.textContent += "\n\nGET 读回收藏列表 → HTTP " + r2.status + "，当前收藏：" + slugs;
        }
      });
    }).catch(function () { setBusy(btn, false); });
  }

  /* ---------- 启动 ---------- */

  document.addEventListener("DOMContentLoaded", function () {
    checkHealth();
    checkData();

    var btnFav = document.getElementById("btn-fav");
    var btnUnfav = document.getElementById("btn-unfav");
    if (btnFav) btnFav.addEventListener("click", function () { writeTest(true); });
    if (btnUnfav) btnUnfav.addEventListener("click", function () { writeTest(false); });
  });
})();

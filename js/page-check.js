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
      // 写完顺带读回列表（GET），证明写入可见；④ 的列表也同步刷新
      return request("/favorites?client_id=" + encodeURIComponent(clientId)).then(function (r2) {
        var el = document.getElementById("write-result");
        if (el && r2.ok) {
          var slugs = (r2.body.data || []).map(function (f) { return f.slug; }).join(", ") || "（空）";
          el.textContent += "\n\nGET 读回收藏列表 → HTTP " + r2.status + "，当前收藏：" + slugs;
        }
        return loadFavList();
      });
    }).catch(function () { setBusy(btn, false); });
  }

  /* ---------- ④ 修改与删除（Day 22）----------
   * PATCH /api/favorites?id=N   改备注（唯一可改字段）
   * DELETE /api/favorites?id=N  软删除 —— 前端必须先过二次确认对话框
   * 为什么要二次确认：删除比新增更容易出事——新增错了顶多多一条，删错了数据就没了。
   * 确认放在「发出删除请求之前」这一层，是前端能加的第一道闸。
   */

  var pendingDeleteId = null;   // 待确认删除的记录 id
  var lastFocused = null;       // 打开对话框前的焦点，关闭后还回去（无障碍）

  function currentClient() {
    var el = document.getElementById("write-client");
    return (el && el.value.trim()) || "day22-check";
  }

  function showModifyResult(title, r) {
    var el = document.getElementById("modify-result");
    if (!el) return;
    el.textContent = title + " → HTTP " + r.status + "\n" + JSON.stringify(r.body, null, 2);
    el.className = "check-result " + (r.ok ? "is-ok" : "is-bad");
    touchUpdated();
  }

  /** 拉收藏列表并渲染（每条带 改备注 / 删除 两个按钮） */
  function loadFavList() {
    var ul = document.getElementById("fav-list");
    var clientId = currentClient();
    return request("/favorites?client_id=" + encodeURIComponent(clientId)).then(function (r) {
      if (!ul) return r;
      ul.innerHTML = "";
      if (!r.ok || !r.body || !r.body.ok) {
        var li = document.createElement("li");
        li.className = "fav-empty";
        li.textContent = "列表加载失败 · HTTP " + r.status;
        ul.appendChild(li);
        return r;
      }
      var rows = r.body.data || [];
      if (!rows.length) {
        var empty = document.createElement("li");
        empty.className = "fav-empty";
        empty.textContent = "（还没有收藏，先用上面 ③ 收一条）";
        ul.appendChild(empty);
        return r;
      }
      rows.forEach(function (f) {
        var li = document.createElement("li");
        li.className = "fav-item";
        li.dataset.id = String(f.id);

        var info = document.createElement("span");
        info.className = "fav-info";
        info.innerHTML = '<b>#' + esc(String(f.id)) + "</b> <code>" + esc(f.slug) + "</code>" +
          ' <span class="fav-note">' + (f.note ? esc(f.note) : "（无备注）") + "</span>";

        var patchBtn = document.createElement("button");
        patchBtn.type = "button";
        patchBtn.className = "check-btn check-btn-sm";
        patchBtn.textContent = "改备注";
        patchBtn.addEventListener("click", function () { patchNote(f.id); });

        var delBtn = document.createElement("button");
        delBtn.type = "button";
        delBtn.className = "check-btn check-btn-sm check-btn-danger";
        delBtn.textContent = "删除";
        delBtn.setAttribute("aria-label", "删除收藏 #" + f.id + "（会弹出二次确认）");
        delBtn.addEventListener("click", function () { askDelete(f.id, f.slug); });

        li.appendChild(info);
        li.appendChild(patchBtn);
        li.appendChild(delBtn);
        ul.appendChild(li);
      });
      return r;
    });
  }

  /** PATCH：改这条记录的备注 */
  function patchNote(id) {
    var noteEl = document.getElementById("edit-note");
    var note = noteEl ? noteEl.value : "";
    if (!note.trim()) {
      showModifyResult("改备注（缺内容）", {
        status: 0, ok: false,
        body: { ok: false, error: { code: "EMPTY_NOTE", message: "请先在「新备注」输入框里填内容，再点这条记录的「改备注」" } }
      });
      if (noteEl) noteEl.focus();
      return;
    }
    request("/favorites?id=" + encodeURIComponent(String(id)), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: note, client_id: currentClient() })
    }).then(function (r) {
      showModifyResult("改备注 #" + id + ' → "' + note + '"', r);
      return loadFavList();
    });
  }

  /** 打开二次确认（不直接删） */
  function askDelete(id, slug) {
    var dlg = document.getElementById("confirm-dialog");
    var desc = document.getElementById("confirm-desc");
    if (!dlg) { doDelete(id, slug); return; }   // 极端降级：没有 dialog 元素就直接删
    pendingDeleteId = { id: id, slug: slug };
    if (desc) desc.textContent = "即将删除：#" + id + " " + slug + "。此操作不可撤销（可从数据库找回）。";
    lastFocused = document.activeElement;
    if (typeof dlg.showModal === "function") dlg.showModal();
    else dlg.setAttribute("open", "");
    var ok = document.getElementById("confirm-ok");
    if (ok) ok.focus();
  }

  function closeDialog() {
    var dlg = document.getElementById("confirm-dialog");
    if (!dlg) return;
    if (typeof dlg.close === "function") dlg.close();
    else dlg.removeAttribute("open");
    if (lastFocused && lastFocused.focus) lastFocused.focus();
  }

  /** 真正发 DELETE */
  function doDelete(id, slug) {
    request("/favorites?id=" + encodeURIComponent(String(id)) + "&client_id=" + encodeURIComponent(currentClient()), {
      method: "DELETE"
    }).then(function (r) {
      showModifyResult("删除 #" + id + " " + slug, r);
      return loadFavList();
    });
  }

  /* ---------- 启动 ---------- */

  document.addEventListener("DOMContentLoaded", function () {
    checkHealth();
    checkData().then(loadFavList);

    var btnFav = document.getElementById("btn-fav");
    var btnUnfav = document.getElementById("btn-unfav");
    if (btnFav) btnFav.addEventListener("click", function () { writeTest(true); });
    if (btnUnfav) btnUnfav.addEventListener("click", function () { writeTest(false); });

    var btnRefresh = document.getElementById("btn-refresh-fav");
    if (btnRefresh) btnRefresh.addEventListener("click", function () { loadFavList(); });

    // 确认对话框：两个按钮 + Esc（原生 dialog 自带 Esc，这里只处理点击）
    var okBtn = document.getElementById("confirm-ok");
    var cancelBtn = document.getElementById("confirm-cancel");
    if (okBtn) okBtn.addEventListener("click", function () {
      var t = pendingDeleteId;
      pendingDeleteId = null;
      closeDialog();
      if (t) doDelete(t.id, t.slug);
    });
    if (cancelBtn) cancelBtn.addEventListener("click", function () {
      pendingDeleteId = null;
      closeDialog();
    });
    var dlg = document.getElementById("confirm-dialog");
    if (dlg) dlg.addEventListener("close", function () { pendingDeleteId = null; });
  });
})();

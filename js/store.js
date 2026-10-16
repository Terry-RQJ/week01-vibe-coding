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
 * Day 17：内容读（卡片/分类/详情）切换到真 API（CloudBase PG 经云函数），
 *         失败自动回落 data/cards.js 静态数据；页面代码零改动（升级缝隙兑现）
 */
(function () {
  "use strict";

  var MOCK_DELAY = 600;
  var HISTORY_KEY = "LAW_HISTORY";
  var BOOKMARKS_KEY = "LAW_BOOKMARKS";
  var HISTORY_MAX = 50;

  /* ---------- Day 17：内容读走真 API（CloudBase PostgreSQL）----------
   * 兑现 v3.0 预留的升级缝隙：只改本文件内部实现，页面代码零改动。
   * 策略：内容（卡片/分类）优先 GET 云函数接口；接口不可用（断网/函数冷启动失败）
   * 自动回落到 data/cards.js 静态数据 —— 站点永不会因 API 挂掉而空白。
   * 用户数据（收藏/浏览记录）仍走 localStorage（PRD §8.3，Day 18 再议）。 */
  var API_BASE = "https://rqj-2006-d0gl1ael531a243a1-1497985433.ap-shanghai.app.tcloudbase.com/api";
  var API_TIMEOUT = 5000;

  /* Day 29：「相关法条」区最多展示几条（与云函数 MATCHED_LAWS_LIMIT 保持一致） */
  var MATCHED_LAWS_LIMIT = 12;

  /* ---------- Day 23：三类错误统一中文文案 ----------
   * ① 输入错（4xx）——服务端校验没过，用后端返回的中文文案
   * ② 网络错（超时/断网/连不上）——提示重试
   * ③ 服务端错（5xx）——不暴露内部细节，统一「开小差」 */
  var ERR_TEXT = {
    network: "网络不太顺，请稍后再试一次",
    server: "服务器开小差了，稍后再试",
    unknown: "请求没能完成，请稍后再试"
  };

  /** 造一个带 kind 的中文错误（前端侧，与云函数 common/errors.js 的 kind 对齐） */
  function makeUiErr(kind, message, status) {
    var e = new Error(message || ERR_TEXT[kind] || ERR_TEXT.unknown);
    e.kind = kind;
    if (status) e.status = status;
    return e;
  }

  /** 按 HTTP 状态归类前端错误 */
  function kindByStatus(status) {
    if (status >= 400 && status < 500 && status !== 408) return "input";
    if (status === 408 || status === 502 || status === 503 || status === 504) return "network";
    return "server";
  }

  /** fetch 带 4xx/5xx/超时统一 reject（错误的 message 一律中文）；resolve **整个响应信封** { ok, data, meta }
   *  Day 29：从 apiGet 里拆出来。搜索要读 meta.matchMode / meta.matchedLaws，
   *  而原来的 apiGet 只返回 j.data，把 meta 丢了。拆开后 apiGet 仍是「只要 data」的老语义，
   *  老调用点零改动。 */
  function apiGetFull(path) {
    if (!window.fetch) return Promise.reject(makeUiErr("network", "当前浏览器不支持网络请求"));
    var ctrl = (typeof AbortController !== "undefined") ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, API_TIMEOUT);
    return fetch(API_BASE + path, { method: "GET", signal: ctrl ? ctrl.signal : undefined })
      .then(function (res) {
        clearTimeout(timer);
        if (!res.ok) {
          // Day 23：不再抛 "HTTP 500" 这种裸格式——先读后端的中文 error.message，读不到再按类别兜底
          return res.text().then(function (t) {
            var msg = "";
            try { msg = (JSON.parse(t).error || {}).message || ""; } catch (e2) { /* 非 JSON 就当没有 */ }
            var kind = kindByStatus(res.status);
            if (!msg) msg = (kind === "input") ? "请求参数有问题，请检查后重试" : ERR_TEXT[kind];
            throw makeUiErr(kind, msg, res.status);
          });
        }
        return res.json();
      })
      .then(function (j) {
        if (!j || j.ok !== true) {
          var em = (j && j.error && j.error.message) || "数据没能正常返回";
          var ek = (j && j.error && j.error.kind) || "server";
          throw makeUiErr(ek, em);
        }
        return j; // 连 meta 一起交出去
      })
      .catch(function (err) {
        clearTimeout(timer);
        // AbortController 触发的中断 = 超时，归为网络错
        if (err && (err.name === "AbortError" || err.message === "The user aborted a request.")) {
          throw makeUiErr("network", "请求超时了，请检查网络后重试");
        }
        // TypeError: Failed to fetch = 断网 / 域名解析失败，也是网络错
        if (err && err.name === "TypeError") {
          throw makeUiErr("network", ERR_TEXT.network);
        }
        throw err;
      });
  }

  /** 只要 data 的老语义（页面内容不改行为） */
  function apiGet(path) {
    return apiGetFull(path).then(function (j) { return j.data; });
  }

  /** API 优先 + 静态回落的通用包装。localFn 必须返回 Promise */
  function apiOrLocal(path, localFn, trust404) {
    return apiGet(path).catch(function (err) {
      // 404 = API 正常工作、确实没有这张卡 → 不回落（以云端为准），直接透传语义
      if (trust404 && err && err.status === 404) return null;
      // 其他失败（断网/超时/5xx）→ 回落静态 mock，保站点可用
      return localFn();
    });
  }

  /** 同 apiOrLocal，但保留信封：localFn 需 resolve { data, meta }（Day 29） */
  function apiOrLocalFull(path, localFn) {
    return apiGetFull(path).catch(function () { return localFn(); });
  }

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

  /* ---------- Day 29：搜索三段式（本地版，与云函数 cardsRepository 同规则）----------
   * 云函数接口不可用时走这里，行为必须和后端一致，否则「断网」会变成另一个产品。
   * 规则同步点：① 精确子串 ② 2 字片段近似 + 标题命中优先 ③ 无结果
   *            matchedLaws 取数 = 法条自身命中 ∪ 命中卡片关联的法条，上限 12 */

  /** 关键词切成「整串 + 所有相邻 2 字片段」，去重（与后端 keywordFragments 一致） */
  function keywordFragments(kw) {
    var t = (kw || "").trim();
    if (!t) return [];
    var out = [t];
    var chars = t.replace(/\s+/g, "").split("");
    for (var i = 0; i + 1 < chars.length; i++) {
      var f = chars[i] + chars[i + 1];
      if (out.indexOf(f) === -1) out.push(f);
    }
    return out;
  }

  /** 同一部法条可能被多张卡引用 → 展示前按「条名 + 原文」去重，保留第一条 */
  function dedupLaws(list) {
    var seen = {};
    return (list || []).filter(function (l) {
      var k = (l.name || "") + "|" + (l.text || "");
      if (seen[k]) return false;
      seen[k] = true;
      return true;
    });
  }

  function byDateDesc(a, b) { return (b.published_at || "").localeCompare(a.published_at || ""); }

  /** 本地三段式检索，返回 { cards, matchMode, matchedLaws } */
  function localSearch(keyword, categoryId) {
    var kw = (keyword || "").trim();
    var catName = categoryId ? CATEGORY_NAME[categoryId] : null;
    var pool = (window.LAW_CARDS || []).filter(function (c) {
      return c.status === "published" && (!catName || c.category === catName);
    });

    if (!kw) return { cards: pool.slice().sort(byDateDesc), matchMode: "", matchedLaws: [] };

    var low = kw.toLowerCase();
    var mode = "exact";
    var cards = pool.filter(function (c) { return cardHaystack(c).indexOf(low) !== -1; });

    if (!cards.length) {
      var frags = keywordFragments(kw);
      var scored = [];
      if (frags.length > 1) {
        pool.forEach(function (c) {
          var hay = cardHaystack(c);
          var title = (c.title || "").toLowerCase();
          var hits = 0, weight = 0, titleHits = 0;
          frags.forEach(function (f) {
            var lf = f.toLowerCase();
            if (hay.indexOf(lf) === -1) return;
            hits++;
            weight += f.length;
            if (title.indexOf(lf) !== -1) titleHits++;
          });
          if (hits > 0) scored.push({ c: c, hits: hits, weight: weight, titleHits: titleHits });
        });
      }
      // 排序与后端 ORDER BY 对齐：标题命中数 > 命中片段总字数 > 命中片段数 > 发布时间
      scored.sort(function (a, b) {
        return (b.titleHits - a.titleHits) || (b.weight - a.weight) || (b.hits - a.hits) ||
          (b.c.published_at || "").localeCompare(a.c.published_at || "") ||
          (a.c.slug < b.c.slug ? -1 : 1);
      });
      cards = scored.map(function (x) { return x.c; });
      mode = cards.length ? "fuzzy" : "none";
    }

    // matchedLaws：① 法条名称/原文直接命中 ② 命中卡片所关联的法条（保证「有卡就有法条可看」）
    var hitSlugs = {};
    var order = {};
    cards.forEach(function (c, i) { hitSlugs[c.slug] = true; order[c.slug] = i; });
    var own = [], fromCard = [];
    pool.forEach(function (c) {
      (c.laws || []).forEach(function (l) {
        var rec = {
          name: l.name, text: l.text, source_url: l.source_url,
          cardSlug: c.slug, cardTitle: c.title
        };
        var selfHit = (l.name || "").toLowerCase().indexOf(low) !== -1 ||
          (l.text || "").toLowerCase().indexOf(low) !== -1;
        if (selfHit) own.push(rec);
        else if (hitSlugs[c.slug]) fromCard.push(rec);
      });
    });
    // 与后端 ORDER BY 对齐：卡片带出来的法条按「命中卡片的相关度顺序」排，
    // 让最相关那张卡的法条紧跟其后（否则搜「房东不退押金」会先看到别的卡的劳动合同法）
    function rankOf(slug) { var i = order[slug]; return i === undefined ? 9999 : i; }
    fromCard.sort(function (a, b) { return rankOf(a.cardSlug) - rankOf(b.cardSlug); });

    return {
      cards: cards,
      matchMode: mode,
      matchedLaws: dedupLaws(own.concat(fromCard)).slice(0, MATCHED_LAWS_LIMIT)
    };
  }

  /** Day 30：法条速查页的本地回落——把静态数据里的法条汇总成池子再检索。
   * 规则与 /api/laws 对齐：
   * ① 按**法条名聚合**（同一条法条被多张卡引用时只出现一次，引用它的卡收进 cards 数组），
   *    否则断网时会出现同一个条文块重复多遍；
   * ② lawName 精确筛法律名；
   * ③ keyword 的检索范围**含关联卡片的标题/摘要/情境/标签**——口语词（押金、退钱、扰民）
   *    通常只写在卡里，法条原文用的是法言法语，只搜原文会 0 结果；
   * ④ lawNames 始终返回**全量**清单（不受当前筛选影响，否则筛选后筛选器自己会缩水），
   *    count 是去重后的法条数。
   */
  function localLaws(keyword, lawName) {
    var kw = (keyword || "").trim().toLowerCase();
    var byName = {};
    var pool = [];
    (window.LAW_CARDS || []).forEach(function (c) {
      if (c.status !== "published") return;
      (c.laws || []).forEach(function (l) {
        var row = byName[l.name];
        if (!row) {
          var m = /^《([^》]+)》/.exec(l.name || "");
          row = byName[l.name] = {
            name: l.name, text: l.text, source_url: l.source_url,
            lawName: m ? m[1] : "", cards: [], _seen: {}, _hay: ""
          };
          pool.push(row);
        }
        if (!row._seen[c.slug]) {
          row._seen[c.slug] = true;
          row.cards.push({
            slug: c.slug, title: c.title,
            category: c.category, categoryId: c.category_id
          });
          row._hay += " " + [c.title, c.summary, c.scenario,
            (c.tags || []).join(" ")].join(" ");
        }
      });
    });

    var cnt = {};
    pool.forEach(function (r) { cnt[r.lawName] = (cnt[r.lawName] || 0) + 1; });
    var names = Object.keys(cnt).map(function (k) { return { name: k, count: cnt[k] }; });
    names.sort(function (a, b) { return b.count - a.count || (a.name < b.name ? -1 : 1); });

    var out = pool.filter(function (r) {
      if (lawName && r.lawName !== lawName) return false;
      if (kw) {
        var hay = ((r.name || "") + " " + (r.text || "") + r._hay).toLowerCase();
        if (hay.indexOf(kw) === -1) return false;
      }
      return true;
    });
    // 排序与接口一致：法律名 → 条号数字升序 → 名称兜底
    function lawNo(s) {
      var m = /[0-9]+/.exec(s || "");
      return m ? parseInt(m[0], 10) : Number.MAX_SAFE_INTEGER;
    }
    out.sort(function (a, b) {
      if (a.lawName !== b.lawName) return a.lawName < b.lawName ? -1 : 1;
      var na = lawNo(a.name), nb = lawNo(b.name);
      if (na !== nb) return na - nb;
      return a.name < b.name ? -1 : 1;
    });
    out = out.map(function (r) { delete r._seen; delete r._hay; return r; });
    return { data: out, meta: { total: out.length, limit: 500, lawNames: names } };
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

    /** 全部已发布卡片，按发布时间倒序（Day 17：真 API，回落静态） */
    listCards: function () {
      return apiOrLocal("/cards?limit=50", function () {
        var cards = (window.LAW_CARDS || []).filter(function (c) {
          return c.status === "published";
        });
        cards.sort(function (a, b) {
          return b.published_at.localeCompare(a.published_at);
        });
        return fakeFetch(cards);
      });
    },

    /** 按分类取卡片（Day 17：真 API） */
    listCardsByCategory: function (categoryId) {
      return apiOrLocal("/cards?category=" + encodeURIComponent(categoryId || "") + "&limit=50", function () {
        var name = CATEGORY_NAME[categoryId];
        var cards = (window.LAW_CARDS || []).filter(function (c) {
          return c.category === name && c.status === "published";
        });
        return fakeFetch(cards);
      });
    },

    /** Day 13：关键词搜索（可叠加分类筛选）
     * Day 17：走 /api/cards?keyword=&category=（服务端 SQL 参数化，含法条全文检索）
     * Day 29：**返回值从「卡片数组」改为 { cards, matchMode, matchedLaws }**
     *         ① matchMode 标注 exact / fuzzy / none，前端据此换文案与截断
     *         ② matchedLaws 是命中的法条原文，支撑「直接查到法条」
     *         ③ 失败回落本地三段式搜索（规则与后端对齐，见 localSearch）
     * 无关键词时 matchMode 为空串、matchedLaws 为空数组，行为等同普通列表。
     */
    searchCards: function (keyword, categoryId) {
      var kw = (keyword || "").trim();
      var qs = [];
      if (kw) qs.push("keyword=" + encodeURIComponent(kw));
      if (categoryId) qs.push("category=" + encodeURIComponent(categoryId));
      qs.push("limit=50");

      return apiOrLocalFull("/cards?" + qs.join("&"), function () {
        var r = localSearch(kw, categoryId);
        return fakeFetch({
          data: r.cards,
          meta: { total: r.cards.length, matchMode: r.matchMode, matchedLaws: r.matchedLaws }
        });
      }).then(function (env) {
        var meta = (env && env.meta) || {};
        return {
          cards: (env && env.data) || [],
          matchMode: meta.matchMode || "",
          matchedLaws: dedupLaws(meta.matchedLaws || [])
        };
      });
    },

    /** Day 30：法条速查页的数据源（GET /api/laws）
     * 返回完整信封 { ok, data:[法条], meta:{ total, limit, lawNames:[{name,count}] } }。
     * 失败时回落到本地聚合（从 window.LAW_CARDS 抽全部法条），断网也能查。
     */
    listLaws: function (keyword, lawName) {
      var kw = (keyword || "").trim();
      var qs = [];
      if (kw) qs.push("keyword=" + encodeURIComponent(kw));
      if (lawName) qs.push("law=" + encodeURIComponent(lawName));
      qs.push("limit=500");
      return apiOrLocalFull("/laws?" + qs.join("&"), function () {
        return fakeFetch(localLaws(kw, lawName));
      });
    },

    /** 分类目录（Day 17：真 API 聚合 count，desc 仍是静态文案） */
    listCategories: function () {
      return apiOrLocal("/categories", function () {
        return fakeFetch(window.LAW_CATEGORIES || []);
      }).then(function (cats) {
        if (!cats || !cats.length || !cats[0].id) return cats; // 回落结果直接过
        var byId = {};
        (window.LAW_CATEGORIES || []).forEach(function (c) { byId[c.id] = c.desc; });
        return cats.map(function (c) { c.desc = byId[c.id] || ""; return c; });
      });
    },

    /** 按 slug 取单张卡（详情页用；Day 17：真 API 含 laws，404 透传，断网回落静态） */
    getCard: function (slug) {
      return apiOrLocal("/cards?slug=" + encodeURIComponent(slug || ""), function () {
        var found = (window.LAW_CARDS || []).find(function (c) { return c.slug === slug; });
        return fakeFetch(found || null);
      }, true);
    },

    /** Day 13：按 slug 列表取卡（收藏页 / 历史页用，按传入顺序保留）
     *  Day 17：真 API 全量取回后本地过滤（接口暂无 batch 端点，卡片 ≤12 张无压力） */
    getCardsBySlugs: function (slugs) {
      var want = {};
      (slugs || []).forEach(function (s) { if (s) want[s] = true; });
      var localFn = function () {
        var list = (window.LAW_CARDS || []).filter(function (c) {
          return want[c.slug] && c.status === "published";
        });
        return fakeFetch(list);
      };
      return apiGet("/cards?limit=50")
        .then(function (cards) {
          return (cards || []).filter(function (c) { return want[c.slug]; });
        })
        .catch(localFn);
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
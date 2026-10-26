# Day 32 · 补齐「关于页」与全站表述对齐

> 起点：Day 31 收尾（搜索假命中 15/15 → 0/15，内容 121 → 122 张）。
> 本日两件事：**#121 补 `about.html`（PRD §8.3 合规项 U-04 / F7，最高优先级）** + **#122 README 与页脚日期对齐现状**。

---

## 1. 为什么要做这件事

PRD §8.3 把「关于页 / 免责声明」列为上线前的**硬合规项**（U-04、F7）。Day 31 之前，本站的免责声明只是各页页脚里的一行小字：

> 本站内容由 AI 起草 + 律师人工复核，仅供学习参考…

问题有三层：

1. **没有独立入口**——用户想弄清「这站到底靠不靠谱」时，无处可去，只能靠自己猜。
2. **表述不实**——「律师人工复核」是个**过强的主张**。实际流程是 AI 起草 + 人工逐条比对官方来源核对法条原文，没有一个执业律师团队在逐张卡审核。写过头比写得少更危险：用户会因为这句话降低警惕。
3. **紧急场景没兜底**——万一有人正在被家暴、被骗、被拖欠工资，打开本站却只看到「不构成法律咨询」，却不知道**该打哪个电话**。

所以这不是「加一个页面」，是**补齐一个法律科普站必须承担的告知义务**。

---

## 2. `about.html` 长什么样

七个板块，全部 `aria-labelledby` 有对应（可访问性）：

| # | 板块 | 为什么要有 |
|---|------|-----------|
| 1 | 这是一个什么样的站 | 一句话说清「给谁用、不是干什么的」 |
| 2 | ⚠️ 免责声明（请务必读完） | 合规 U-04 核心。黄色警示卡，不能藏在正文里 |
| 3 | 🆘 紧急情况，请先找这些地方 | 6 条热线表：110 / 12348 / 法律援助中心 / 12315 / 12333 / 12338 |
| 4 | 内容是怎么做出来的 | 四步流程：选题 → AI 起草 → 人工核对法条 → 标注核验日期 |
| 5 | 法条出处：你可以自己核验 | 给出官方源链接，让用户能自己查，而不是「信我」 |
| 6 | 发现错误？请告诉我们 | 反馈渠道 |
| 7 | 一点技术说明 | 数据怎么存、收藏是否上云（明确「只在你自己浏览器里」） |

### 2.1 统计数字不写死

「122 张卡、261 条法条」这类数字**最容易过期**，而且过期比没有更糟（用户看到 122 而站里只有 100 张，会觉得整页都在瞎写）。所以数字从真实数据填：

```html
<p>站内现有 <strong id="stat-cards">120+</strong> 张情境卡片、<strong id="stat-laws">260+</strong> 条法条引用…</p>
<script src="./data/cards.js"></script>
<script>
  (function () {
    try {
      var cards = (window.LAW_CARDS || []);
      if (!cards.length) return;
      var laws = 0;
      cards.forEach(function (c) { laws += (c.laws || []).length; });
      var elCards = document.getElementById('stat-cards');
      var elLaws = document.getElementById('stat-laws');
      if (elCards) elCards.textContent = cards.length;
      if (elLaws) elLaws.textContent = laws;
    } catch (e) { /* 数据加载失败时保留占位文案，不影响本页可读性 */ }
  })();
</script>
```

**降级设计**：`data/cards.js` 加载失败时保留 `120+` / `260+` 占位文案，页面照样可读——合规页不能因为一个 JS 挂了就变空白（e2e 第 8 组专门验这个）。

---

## 3. 全站对齐（改了 5 个页面）

### 3.1 导航加第 5 项

`index / card / bookmarks / history / laws` 五个页面的 `.nav` 里统一追加：

```html
<a href="./about.html" class="nav-link" aria-label="关于本站">关于</a>
```

### 3.2 页脚统一

原来三个不同日期，统一为：

```html
<div class="meta">本站为个人学习项目 · <a href="./about.html">关于本站</a> · 内容最后核验 2026-10-21</div>
```

| 页面 | 改前 |
|------|------|
| index | Day 13 多视图 · 2026-09-28 |
| card / bookmarks / history | Day 13 多视图 · 2026-09-28 |
| laws | Day 30 法条速查 · 2026-10-16 |

### 3.3 免责声明表述统一

**经用户确认**（AskUserQuestion）：「律师人工复核」→ **「人工核对法条」**。

改前：`本站内容由 AI 起草 + 律师人工复核…`
改后：`本站内容由 AI 起草 + 人工核对法条，法条原文逐条比对官方来源，仅供学习参考，不构成具体法律咨询。您的具体问题请咨询执业律师，或拨打免费法律服务热线 12348。`

这个改动**降低了承诺强度**，但让页面说的和做的对得上——这是合规的正确方向。

---

## 4. 移动端：第 5 个导航项撑破 375px

这是本次唯一一个「加一个链接」引发的真问题。

`375px` 视口下：品牌区约 150px + 5 项 × 56px + 4 × 8px gap ≈ **462px**，溢出近 90px。

修法（`css/global.css`）：

```css
@media (max-width: 640px) {
  .site-header .container { flex-wrap: wrap; gap: 4px; }
  .brand { font-size: var(--font-size-base); margin-right: var(--space-2); }
  .nav-link { padding: 6px 6px; font-size: 12.5px; }
  .search-box { order: 5; flex-basis: 100%; max-width: none; }
}
```

同时把搜索框挤到第二行独占（`order: 5` + `flex-basis: 100%`），否则它会和导航抢宽度。

**没有**选择「让品牌独占一行」——那会白白浪费一行高度，得不偿失。

---

## 5. e2e 回归资产：`docs/day32-about-e2e.js`

复用 `docs/day30-laws-e2e.js` 的 CDP 脚手架（Edge `--headless=new` + WebSocket），支持 `--local` 打本地 8765。八个测试组、55 项：

| 组 | 验什么 |
|----|--------|
| 1 | 5 个页面都有「关于」入口（导航 1 + 页脚 ≥1），且全站不再出现「律师人工复核」 |
| 2 | 从首页点「关于」真的跳转成功 |
| 3 | 板块数 = 7，关键板块名齐全 |
| 4 | 免责声明五要素（不构成法律咨询 / 不构成个案意见 / 不提供个案咨询 / 不是执业律师 / 以官方为准） |
| 5 | 紧急联系方式（12348 / 110 / 法律援助 / 12315 / 12333） |
| 6 | 统计数字来自真实数据（等于 `window.LAW_CARDS` 实际长度，不是写死） |
| 7 | **375px 导航不横向溢出**（`scrollWidth - clientWidth <= 1`、导航 5 项、最后一项不出视口） |
| 8 | `Emulation.setScriptExecutionDisabled` 后正文仍可读（1960 字 / 7 板块） |

结果：**本地 55/55，线上 55/55。**

### 5.1 ⚠️ 踩到的坑：中间页判定把短页面永远卡住

线上首跑挂在「中间页一直过不去」。原逻辑：

```javascript
var hasApp = document.body && document.body.innerText.length > 400;
```

问题：`card.html`（246 字）、`history.html`（295 字）、`bookmarks.html`（342 字）的**静态骨架正文**都不到 400 字——它们靠 JS 渲染后才够长。于是这三页永远被判成「还在中间页」，45 轮空转后抛错，而页面**其实早就进站了**。

诊断证据（加日志后第 0 轮输出）：

```
… index.html 第 0 轮：正文 234 字 / 导航 false / 按钮「确定访问 (3s)」
✅ index.html 已过中间页（正文 415 字）
✅ laws.html 已过中间页（正文 265 字）    ← 旧逻辑在这就卡死了
✅ card.html 已过中间页（正文 242 字）    ← 同上
```

修法：中间页的真实特征是「几乎没有正文 + 一个倒计时按钮」，改用**双条件**：

```javascript
var txt = document.body ? (document.body.innerText || '') : '';
var hasNav = !!document.querySelector('.site-header, nav .nav-link, a[href="./about.html"]');
var hasApp = txt.length > 400 || (hasNav && txt.length > 150);
```

`hasNav` 与正文长度无关，对短页面同样可靠。

**教训**：凡是用「正文长度」当就绪信号，先量一遍**最短的那个页面**。本站最短是 246 字，阈值却定在 400，这个 bug 从 Day 30 就潜伏着，只是 Day 30 的 e2e 恰好没测这几页。

### 5.2 ⚠️ 踩到的坑：`curl` 连续打同一站点会返回 000

第一轮逐页探测时，`bookmarks / history / about` 连返回 `HTTP=000`，看起来像部署失败。实际上是**短时请求过密被限流**。加 `sleep 2` + `?t=$(date +%s)` 穿透缓存后全部 `HTTP=200`。

**判定口径**：`000` = 连接层问题（限流 / TLS / 代理），**不等于**「文件不存在」。文件不存在是 `404`。

---

## 6. README 对齐现状（#122）

README 里有 6 处内容已经落后于项目实际状态，逐条修：

| 位置 | 过时内容 | 改成 |
|------|---------|------|
| 风险声明 | 内容由「AI 起草 + **律师人工复核**」 | 「AI 起草 + **人工核对法条**」 |
| 风险声明 | 「本站 **9 个**法条出处全部逐条实测核验」 | 「**261 条**法条引用逐条比对官方全文，去重 **158 条**」，补 CICC 源与《治安管理处罚法》2025 修订版条号重排提示 |
| 运行方法 B | 「本站目前没有用 `fetch()`，**也可以直接双击** `index.html`」 | 明确写「**❌ 已不可用**」+ 解释原因（Day 8 起用 fetch，`file://` 必被 CORS 拦），并附本机代理会把 localhost 拦成 502 的处理办法 |
| 当前状态 | 「Day 7」 | 「Day 32」+ 里程碑速览表（Day 7 → Day 32 共 10 行） |
| 文件结构 | 「截至 Day 7」 | 「要点」，反映真实目录（about.html / check.html / db / functions / docs） |
| 与 AI 协作者约定 | 「8 条规则」但只列了 5 条 | 完整列出 8 条 + 2 条协作约定 |
| 发布前检查 | 「**20 项**检查」 | 「离线 **21** 项 + 公网 **7** 项，共 **28** 项」，并列出 4 个按需跑的重型回归资产 |

### 6.1 preflight 实测项数

```
$ python .workbuddy/skills/verify-project/scripts/preflight.py
汇总: 21 / 21 通过

$ python .workbuddy/skills/verify-project/scripts/preflight.py --online
汇总: 26 / 28 通过
```

`--online` 前两项 FAIL 是 C16 / C17（dist 未同步），同步后即 28/28。

---

## 7. 部署与验证

```bash
# 1) 同步 dist（about.html 是新增的，必须显式拷）
cp about.html dist/about.html
for f in index.html card.html bookmarks.html history.html laws.html check.html; do cp "$f" "dist/$f"; done
cp css/global.css dist/css/global.css && cp README.md dist/README.md

# 2) 离线自检
python .workbuddy/skills/verify-project/scripts/preflight.py     # 21/21 PASS

# 3) 部署
node ".../node_modules/@cloudbase/cli/bin/tcb" hosting deploy ./dist -e rqj-2006-d0gl1ael531a243a1 --yes

# 4) 线上 e2e
node docs/day32-about-e2e.js                                      # 55/55 PASS
```

线上地址：https://rqj-2006-d0gl1ael531a243a1-1497985433.tcloudbaseapp.com/about.html

---

## 8. 待办（供后续排期）

1. 补「装修合同」「身份证被冒用」两张卡，消除 Day 31 的 2 条已知残留
2. 补 24 个内容空白场景词（刷单、杀猪盘、校园欺凌、医美、人脸识别、打赏、快递丢失、隔断房、涨租、旅游团、酒店、见义勇为、溺水、盗号、洗钱、外包、户口本、点餐、团购、寄丢…）
3. 每卡加「时限 · 投诉渠道 · 证据清单」三件套（**按批来，别一次铺 122 张**）
4. 404 兜底缺页、F3 决策树
5. 约 100 个历史截图 png 的处置（未追踪、几十 MB，建议进 `.gitignore`）——**待用户拍板**

# 法律小科普轻站

> 让一个普通人 3 分钟读懂一个生活里的法律常识。

---

## 关于这个项目

- **作者**：Terry（GitHub: [Terry-RQJ](https://github.com/Terry-RQJ)）
- **性质**：Vibe Coding 学习课程（Day 1 ~ Day 28）的作品
- **形态**：纯静态站点 —— 原生 HTML/CSS/JS 多页面，**无后端、无数据库、无构建**
- **托管**：GitHub Pages（main 分支根目录直发）
- **受众**：中国大陆普通大众
- **基调**：生动有趣 + 情境式（每张卡片都用「假设你是张三…」式代入）

完整需求见 [`PRD.md`](./PRD.md)；技术方案见 [`TECH_DESIGN.md`](./TECH_DESIGN.md)；AI 协作规则见 [`AGENTS.md`](./AGENTS.md)。

---

## ⚠️ 风险声明（必读）

本站为**个人学习项目**，所有内容由 **AI 起草 + 律师人工复核**后发布，但仍请注意：

- **本页内容不构成法律咨询**——你的具体问题请咨询执业律师，或拨打免费法律服务热线 **12348**
- 紧急人身安全事件请立即拨打 **110**
- 任何「建议你这样做」的结论**不构成对个案的法律意见**
- 法条内容以**官方源**为准：[国家法律法规数据库](https://flk.npc.gov.cn/)

---

## 运行方法

本项目是纯静态站，**无需 Node.js / npm / 任何依赖**。两种本地预览方式：

### 方式 A · 用 Python 起本地服务（推荐）

Python 自带 `http.server`，无需安装任何东西。在**仓库根目录**（即 `AGENTS.md` 所在的目录）跑：

```bash
cd "C:/Users/Administrator/Desktop/Vibe Coding"
python -m http.server 8000
```

然后浏览器打开：**`http://localhost:8000/`**

停止服务：在跑命令的终端按 `Ctrl + C`。

### 方式 B · 直接双击 `index.html`

因为本站目前没有用 `fetch()` 或外部数据，**也可以直接双击** `index.html` 用浏览器打开。

但一旦 Day 8 起加载卡片数据，浏览器会因为 CORS 安全策略拦截本地资源，**届时必须用方式 A**。

### 部署到公网（Day 12–14 候选）

`git push` 到 `main` → 仓库 **Settings → Pages → Source: main, / (root)** → 等待 1–2 分钟 → 访问 `https://terry-rqj.github.io/week01-vibe-coding/`。详见 `TECH_DESIGN.md §11`。

---

## 当前状态（Day 7）

- ✅ 仓库根目录 = 网站根目录（没有 `dist/`）
- ✅ `.nojekyll` 已建立（Pages 直发，不需要 Jekyll 处理）
- ✅ `.gitignore` 已包含敏感文件规则（`.env` / `*.key` 等永远不传）
- ✅ 首页骨架可本地打开（`http://localhost:8000/`）
- ✅ 主色 #1E40AF / 辅色 #EA580C / 背景 #F9FAFB 按 PRD §5.2 实施
- ✅ 响应式断点 375 / 768 / 1024 三档可用
- ✅ 页脚含 12348 / 110 紧急联系方式
- ❌ **还没有内容卡片**（Day 8 起滚动上线）
- ❌ 还没有详情页 / 收藏 / 搜索 / 法条聚合 / 关于页

---

## 后续计划（Day 8–14）

| Day | 任务 | 涉及文件 |
|-----|------|---------|
| **8**  | F1 最小闭环：1 张「公司劝退」示范卡写进 `data/cards.js` | `data/cards.js` |
| **9**  | P2 详情页骨架：5 模块顺序固定（情形 / 法条 / 怎么解决 / 看情况选我做 / 相关拓展） | `article.html` |
| **10–11** | P4 收藏 + P6 搜索 + 唯一数据访问层 | `js/store.js`、`js/storage.js`、`js/errors.js`、`js/ui.js`、`js/pages/*.js`、`bookmarks.html`、`js/search.js` |
| **12–14** | P3 法条聚合 + P5 关于页（含完整免责声明）+ 404 兜底 + GitHub Pages 部署 | `laws.html`、`about.html`、`404.html` |

> **为什么 Day 7 任务清单只到「首页骨架」？**
> PRD §8.1 要求 F1–F7 全部 7 个功能 + 12 张卡片同时落地，但这与 Day 7 任务清单「一次不写大量代码」冲突。
> 走 Day 7 任务清单的「卡住降级」路径：**今天先出能跑的骨架 + 1 张示范卡；F1 最小闭环在 Day 8 完成，F2–F7 在 Day 9–14 滚动上线**。
> PRD.md §10 的时间表文字没改写——这是文档间不同步，记为已知项。

---

## 文件结构（截至 Day 7）

```
Vibe Coding/                          ← 项目根 = 网站根（GitHub Pages 直接发布这里）
├── index.html                        ← ★ 首页骨架（Day 7 新）
├── css/
│   ├── tokens.css                    ← ★ 颜色/字号/间距变量（Day 7 新）
│   └── global.css                    ← ★ 全局样式 + 响应式（Day 7 新）
├── .nojekyll                         ← ★ Pages 直发开关（Day 7 新）
├── .gitignore                        ← 已含 .env / .DS_Store 等规则
├── README.md                         ← ★ 你正在看的文件（Day 7 新）
│
├── AGENTS.md                         ← AI 协作规则（Day 1 + Day 6 补充）
├── AGENTS-旧版-Day1备份.md           ← Day 1 旧版备份（不进仓库）
├── research.md                       ← Day 3 需求研究
├── PRD.md                            ← Day 4 产品需求
├── TECH_DESIGN.md                    ← Day 5 技术方案（v3.0 纯静态路线）
└── .env                              ← 本地占位（永远不进仓库）
```

★ = Day 7 新增 / 修改

---

## 与 AI 协作者的约定

本站所有 AI 协作规则见 [`AGENTS.md`](./AGENTS.md)。

当前文件里有 8 条强制规则（含 Day 6 补充的 4 条），主要包括：

1. 「先读再动」—— 每次新会话开头必读 `AGENTS.md`
2. 「任务日边界」—— 不在一个回合内擅自推进板块
3. 「法条带核验日期」—— 任何法条内容必须带 `last_verified_at` 字段
4. 「站内链接相对路径」—— 绝对不要写 `/css/...`
5. 「写给读者要打比方」—— 超过 5 行没有生活例子的段落必须重写

完整列表与理由读 `AGENTS.md`。

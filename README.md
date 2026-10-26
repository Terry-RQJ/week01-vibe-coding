# 法律小科普轻站

> 让一个普通人 3 分钟读懂一个生活里的法律常识。

---

## 关于这个项目

- **作者**：Terry（GitHub: [Terry-RQJ](https://github.com/Terry-RQJ)）
- **性质**：Vibe Coding 学习课程（Day 1 ~ Day 34）的作品
- **形态**：原生 HTML/CSS/JS 多页面；内容数据走 CloudBase 云函数 + PostgreSQL（不可用时自动回落到本地静态数据），收藏等用户数据仍存浏览器本地
- **托管**：腾讯云 CloudBase 静态托管（Day 15 起；早期 GitHub Pages 方案已废弃）
- **内容规模**：六大类共 **136 张情境卡片、296 条法条引用**（Day 30 扩容、Day 33 补漏、Day 34 补生活高频空白场景；法条逐条核对官方来源，每条标注核验日期）
- **受众**：中国大陆普通大众
- **基调**：生动有趣 + 情境式；搜索按「人怎么说话」设计——搜大白话就能命中，不必先懂法言法语

完整需求见 [`PRD.md`](./PRD.md)；技术方案见 [`TECH_DESIGN.md`](./TECH_DESIGN.md)；AI 协作规则见 [`AGENTS.md`](./AGENTS.md)。

---

## ⚠️ 风险声明（必读）

本站为**个人学习项目**，所有内容由 **AI 起草 + 人工核对法条**后发布，但仍请注意：

- **本页内容不构成法律咨询**——你的具体问题请咨询执业律师，或拨打免费法律服务热线 **12348**
- 紧急人身安全事件请立即拨打 **110**
- 任何「建议你这样做」的结论**不构成对个案的法律意见**
- 法条内容以**官方源**为准。站内 296 条法条引用**逐条比对官方全文**，每条带 `last_verified_at` 核验日期；累计核验的去重法条 158 条（清单见 `docs/day29-content-and-search.md`、`docs/day30-content-expansion.md`、`docs/day34-content-expansion.md`）：
  [国家法律法规数据库](https://flk.npc.gov.cn/) · [中国人大网](http://www.npc.gov.cn/) · [中国政府网](https://www.gov.cn/) · [最高人民法院公报](http://gongbao.court.gov.cn/) · [最高法官网](https://www.court.gov.cn/) · [中国国际商事法庭 CICC](https://cicc.court.gov.cn/)
  （注：flk 的条文详情页 `detail2.html` 会 302 跳回首页，因此本站法条出处优先用人大网 / 政府网 / 最高法 / CICC 的全文页；个别官方页有自环 302，需带 cookie 访问。**另：《治安管理处罚法》2025 修订版已于 2026-01-01 施行、条号整体重排，旧条号一律作废**）

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

### 方式 B · 直接双击 `index.html`（❌ 已不可用）

**不要这么做。** 本项目自 Day 8 起改为用 `fetch()` 调云函数取数据，浏览器对 `file://` 协议下的 `fetch` 一律按 CORS 拦截，双击打开只会看到一片空白或「加载失败」。

当年这条「方式 B」确实能用（Day 1~7 时数据全写死在 `data/cards.js` 里，靠 `<script>` 标签加载，不受 CORS 限制），现在是历史遗留说明了。**只能走方式 A。**

> 顺带一提：如果你是在**本机开了代理**的环境里跑方式 A，`http://localhost:8000/` 有可能被代理拦成 502（报 `upstream connect failed`）。这时给 curl 加 `--noproxy '*'`，或在代理软件里把 localhost 加进直连白名单即可。

### 部署到公网（现役：腾讯云 CloudBase 静态托管，Day 15 起）

线上地址（Day 27 核验有效）：

https://rqj-2006-d0gl1ael531a243a1-1497985433.tcloudbaseapp.com/

部署、发布与回滚流程见 `DEPLOY.md`、`docs/release-checklist-v1.0.md`、`docs/rollback-playbook.md`。（早期的 GitHub Pages 方案已废弃——`https://terry-rqj.github.io/week01-vibe-coding/` 已 404，勿再使用。）

---

## 当前状态（Day 34）

- ✅ 六大功能全部上线：情形清单 / 详情页 / 收藏备注 / 法条速查 / 搜索 / 关于页
- ✅ 内容 136 张卡 / 296 条法条，由 `db/seed-content.py` 唯一生成（改内容改脚本，不手改数据文件）
- ✅ 搜索三段式（精确 / 近似 / 空态推荐）+ 命中法条直达；142 个真实搜索词覆盖率 100%
- ✅ 搜索相关度：假命中 0/6、必须召回 0 漏、前后端 34 词结果零差异（已登记 1 条已知残留，见 `docs/day34-content-expansion.md`）
- ✅ 关于页（`about.html`）含完整免责声明、紧急联系方式与内容生产流程（合规 F7 / U-04）
- ✅ 发布前检查 Skill：21 项离线 + 7 项公网检查全 PASS 方可推送（见文末）
- ✅ 全站页脚统一：免责声明「AI 起草 + 人工核对法条」+「关于本站」入口 + 核验日期

### 里程碑速览

| Day | 里程碑 |
|-----|--------|
| 7 | 首页骨架（V1 MVP） |
| 15 | CloudBase 静态托管上线，废弃 GitHub Pages |
| 17–18 | 读接口 + 收藏写接口接入真库（PostgreSQL） |
| 22 | 收藏备注增删改查闭环 |
| 23 | 安全审计：错误提示统一、密钥防线加固 |
| 28 | 28 天结营 v1.0.0 正式发布 |
| 29 | 内容 6→24 张，搜索三段式 + 法条直达 |
| 30 | 内容 24→121 张，新增「法条速查」页 |
| 31 | 搜索质量修复：假命中 15/15→0/15，内容 121→122 张 |
| 32 | 补齐关于页（合规 F7），全站页脚/导航统一，README 对齐现状 |
| 33 | 补「装修合同」「身份证被冒用」两张卡，已知残留白名单清零，内容 122→124 张 |
| 34 | 补 12 张生活高频空白场景（快递 / 医美 / 校园欺凌 / 刷单 / 杀猪盘 / 团购 / 盗号 / 劳务派遣 / 群租 / 涨租 / 旅游强制购物 / 见义勇为），内容 124→136 张 |

---

## 文件结构（要点）

```
Vibe Coding/                          ← 项目根
├── index.html                        ← ★ 首页（情形清单 + 搜索）
├── card.html                         ← 卡片详情页（?slug=…）
├── laws.html                         ← 法条速查页（Day 30）
├── about.html                        ← ★ 关于页（Day 32，合规 F7）
├── bookmarks.html / history.html     ← 收藏 / 浏览记录
├── check.html                        ← 收藏数据检查台（开发用）
├── css/tokens.css · global.css       ← 设计变量 + 全局样式
├── js/                               ← store.js（唯一数据访问层）+ 各页面脚本
├── data/cards.js                     ← 静态回落数据（由 db/seed-content.py 生成，勿手改）
├── db/                               ← schema.sql / seed.sql / seed-content.py（内容唯一源）
├── functions/                        ← CloudBase 云函数（cards / laws / favorites / categories / health）
├── docs/                             ← 每日复盘、验证脚本、回归探针
├── PRD.md · TECH_DESIGN.md · AGENTS.md · api-contract.md
└── DEPLOY.md                         ← 部署 / 发布 / 回滚流程
```

---

## 与 AI 协作者的约定

本站所有 AI 协作规则见 [`AGENTS.md`](./AGENTS.md)。

当前文件里有 8 条强制规则，主要包括：

1. 「先读再动」—— 每次新会话开头必读 `AGENTS.md`
2. 「今日不做」—— 只做当天任务
3. 「降级优先」—— 卡住先跳过、记成待办，不硬刚
4. 「保护隐私」—— 不外传账号密码 token，不把敏感信息推到公开仓库
5. 「能跑就别装新的」—— 用现有工具能完成的事，不引入新依赖
6. 「每一步留痕」—— 关键操作写进日志
7. 「当天只做当天任务」—— 学员没说「进入下一板块」就不越界
8. 「法条带核验日期」—— 任何法条内容必须带 `last_verified_at`（`YYYY-MM-DD`）

另有两条写进「协作约定」表格：

- 「站内链接相对路径」—— 绝对不要写 `/css/...`
- 「写给读者要打比方」—— 超过 5 行没有生活例子的段落必须重写

完整列表与理由读 `AGENTS.md`。

---

## 发布前检查（Day 25 新增，Day 32 更新项数）

每次部署云函数/静态托管之后、`git push` 之前，跑一遍项目自带的检查 Skill：

```bash
# 离线检查（约 2 秒，不需要网络与密钥）
python .workbuddy/skills/verify-project/scripts/preflight.py

# 追加公网检查（health / 读接口 / CORS 白名单 / Day 24 三 Bug 线上回归 / 报错中文兜底）
python .workbuddy/skills/verify-project/scripts/preflight.py --online
```

- **离线 21 项 + 公网 7 项，共 28 项**（Day 32 现状）。全部来自本项目真实踩过的坑（密钥防线、裸报错泄露、Day 24 三个输入校验 Bug、绝对路径、dist 漏同步、CORS 双值、云函数响应逐分片解码……），每项写明「怎么算通过」，输出逐项 PASS/FAIL + 证据，退出码 0/1 可接脚本。
- 另有更重的回归资产（按需跑，不在 preflight 里）：`docs/day29-verify-online.py`（37 项线上验收）、`docs/day30-coverage-probe.py`（142 个真实搜索词覆盖率，结尾必须出现「无结果 0」）、`docs/day31-search-relevance-probe.py`（假命中 / 漏召回）、`docs/day32-about-e2e.js`（关于页 55 项 e2e）。
- 检查项出处与「明确不检查的事」见 `.workbuddy/skills/verify-project/references/pitfalls.md`；用法详见 `.workbuddy/skills/verify-project/SKILL.md`。
- 全部 PASS 后再提交推送；发现 FAIL 先看证据行，对照 pitfalls.md 里的历史坑修复。

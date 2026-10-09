# 安全自查清单 · 「法律小科普轻站」（Day 23）

> 今天的口号：**不允许只说「已修复」——每一项都写「怎么算通过」，且全部可复现。**
> 审计范围：硬编码密钥 / 裸报错 / 非法输入 / .gitignore 完整性 / Git 历史泄露。
> 审计方法：先全量扫描列清单，再逐条修复，最后逐条验证。复现命令全部在本仓库根目录可跑。

---

## 一、审计发现（改前的问题清单）

### A. 密钥类（红线）

| # | 位置 | 问题 | 严重度 |
|---|---|---|---|
| A1 | `functions/api/*/db.js` | API Key 走 `process.env.CB_API_KEY`（正确），但 `DB_NOT_CONFIGURED` 报错文案直接暴露环境变量名 | 中（信息泄露） |
| A2 | `.gitignore` | 覆盖了 `.env` / `*.key` / `*.pem`，但 `.env.production` 等变体只挡了 `.env.*.local`，且没有 `credentials.json`、`serviceAccountKey.json` | 中 |
| A3 | 仓库 | 没有 `.env.example`，新人容易把真实值直接写进 `.env` 又不小心强加入库 | 低（流程风险） |
| A4 | Git 历史 | `git log -S eyJ` 命中 Day 20/21 两个提交 | 需甄别（见二） |

### B. 裸报错类（今天的主菜）

| # | 位置 | 改前（裸报错原文） | 用户看到的效果 |
|---|---|---|---|
| B1 | `functions/api/cards/index.js` catch | `message: e.message \|\| '服务内部错误'` | 数据库英文原文直出，如 `relation "cards" does not exist` |
| B2 | `functions/api/categories/index.js` catch | 同上 | 同上 |
| B3 | `functions/api/*/db.js`（3 份） | `reject(makeErr(500, code, parsed.message))` | 网关英文报错（含 SQL 片段）一路穿透到用户 |
| B4 | `functions/api/*/db.js`（3 份） | `req.on('error', e => reject(..., e.message))` | `connect ECONNREFUSED 10.x.x.x:443` 连 IP 都带出去 |
| B5 | `functions/api/health/index.js` | 405 响应缺 `ok:false` 字段，且无 try/catch（异常裸崩给网关） | 形状不一致；崩了是网关默认英文页 |
| B6 | `js/store.js` apiGet | `new Error("HTTP " + res.status)` / `"API error"` / `"no fetch"` | 前端拿到英文技术串，无 kind 分类 |
| B7 | `js/page-check.js` request catch | `"请求失败：" + err.message` | 英文网络栈信息拼在中文后面，半中半英 |
| B8 | `js/page-check.js` checkHealth | `JSON.stringify(b).slice(0, 200)` 直出 | 响应体原文（可能含内部细节）直接印在页面上 |

---

## 二、Git 历史排查结论（红线项）

排查命令与结果：

| 命令 | 结果 | 结论 |
|---|---|---|
| `git log --all -S "eyJ" --oneline` | 命中 `b83dbf9`、`3976a5e` | **逐条人工核对**：两处都是验收文档里写的「检查命令本身」——`git grep eyJ` 这几个字（`DEPLOY.md:291`、`docs/week3-acceptance.md:45,82`），不是密钥 |
| 逐提交全量扫描 `git rev-list --all` × `git grep -lE "eyJ[A-Za-z0-9_-]{20,}\|sk-...\|ghp_..."` | **0 命中**（43 个提交全部扫过） | 历史从未提交过任何真实密钥 |
| `git log --all --diff-filter=A --name-only` 查文件名 | 无 `.env` / `*.key` / `*.pem` / `secret` / `credential` | 密钥文件从未入库 |
| `cloudbaserc.json` 全历史 envVariables | 每个版本都是 `{}` | 部署时注入后立即还原的纪律从 Day 15 保持至今 |

**结论：没有真实密钥进过 Git 历史 → 无需作废/轮换密钥，无需改写历史。**
（若哪天发现真实密钥已提交：正确顺序是 ① 控制台作废旧 Key → ② 生成新 Key → ③ 只更新云函数环境变量 → ④ 最后才清理代码/历史，顺序不能反。）

---

## 三、修复内容（改前 → 改后对照）

### 核心：新增统一错误模块 `functions/api/common/errors.js`

- 三类错误分类：`input`（用户传错，400/404）/ `network`（超时断网，502/503/504）/ `server`（我们内部问题，500）
- 错误响应统一形状：`{ ok:false, error:{ code, kind, message } }`——`kind` 是今天新增的类别字段
- **铁律：`message` 对外只回中文人话；数据库英文原文只进 `detail` 字段 → 只写日志，永不进响应体**
- 部署说明：CloudBase 按函数目录独立打包，母版在 `common/`，四个函数目录内各有一份同步副本（与 `db.js` 的既有副本约定一致）

### 改前改后对照（举最有感的三个）

| 场景 | 改前用户看到 | 改后用户看到 |
|---|---|---|
| 数据库表挂了（cards 详情） | `{"error":{"message":"relation \"cards\" does not exist"}}` | `{"error":{"code":"DB_ERROR","kind":"server","message":"服务器开小差了，稍后再试"}}` |
| 函数连不上数据库 | `{"error":{"message":"connect ECONNREFUSED 10.0.0.1:443"}}`（带内网 IP） | `{"error":{"code":"DB_REQUEST_FAILED","kind":"network","message":"网络不太顺，请稍后再试一次"}}` |
| 前端请求超时（检查台） | `请求失败：The user aborted a request.` | `请求超时了，请检查网络后重试`（`kind=network`） |

逐文件修复：

| 文件 | 修复 |
|---|---|
| `functions/api/*/index.js`（4 份） | catch 全部接 `toErrorResponse()`；输入错回中文校验文案，网络/服务端错回类别兜底；内部细节只进 console 日志 |
| `functions/api/*/db.js`（3 份） | `parsed.message` / `e.message` 全部降级进 `detail`；`DB_NOT_CONFIGURED` 对外文案改为「服务器开小差了」（不再暴露 CB_API_KEY 变量名） |
| `functions/api/health/index.js` | 补 `ok:false` + `kind`；加 try/catch（不再裸崩） |
| `js/store.js` | `apiGet` 重写：`HTTP 500` → 按 kind 分类中文文案；AbortError=超时、TypeError=断网单独归类；4xx 优先读后端中文 message |
| `js/page-check.js` | ⑤ 板块「错误提示演示」（三个按钮实测三类）；`请求失败：` 和 `JSON.stringify(b)` 两处裸报错改为人话 |
| `check.html` | ⑤ 板块标记 + 说明 + 结果区 |
| `.gitignore` | 补 `.env.*`（通配全部变体）+ `!.env.example` 例外 + `credentials.json` / `serviceAccountKey.json` / `*.p12` |
| `.env.example`（新增） | 占位符模板，真实值只进 `.env`（已忽略）和云函数环境变量 |

---

## 四、自查清单（每项含「怎么算通过」）

> 复现环境：仓库根目录 `C:\Users\Administrator\Desktop\Vibe Coding`。全部命令今天已实际跑过，结果见括号。

### 1. 密钥不硬编码

- **怎么算通过**：5 组特征词搜索全部 0 命中——
  `git grep -nIE "eyJ[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9]{20,}|AKID[A-Za-z0-9]{10,}"` → 空；
  `git grep -nIE "ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}"` → 空；
  `git grep -nIE "(password|secret|api_key|apikey|token)\s*[:=]\s*['\"][^'\"]{8,}['\"]"` → 空；
  `git ls-files | grep -iE "\.(key|pem|p12|pfx)$"` → 空；
  `git ls-files | grep -iE "^\.env$|credentials|serviceAccount"` → 空
  （✅ 今天全部通过，截图 `day23-shot-secrets.png`）
- **证据文件**：搜索逻辑已留档为生成脚本（渲染报告页的逻辑即上列命令），报告页内容为真实命令输出

### 2. .env 不在仓库且被忽略

- **怎么算通过**：`git ls-files .env` 无输出（✅）；`git check-ignore -v .env` 输出 `.gitignore:3:.env  .env`（✅ 被第 3 行规则忽略）；`git check-ignore -v .env.example` 输出 `!.env.example`（✅ 被例外规则放行，能入库供人参考）；`git status` 里只见 `?? .env.example`、不见 `.env`（✅）

### 3. Git 历史无密钥泄露

- **怎么算通过**：`git rev-list --all | ForEach { git grep -lE "eyJ[A-Za-z0-9_-]{20,}|sk-..." $_ }` 全部提交无输出（✅ 43 提交全扫，0 命中）；`git log --all -S "eyJ" --oneline` 的命中逐条人工核对均为文档中的检查命令字样（✅ 见第二节）；`cloudbaserc.json` 历史版本 envVariables 全 `{}`（✅）
- **若日后发现真泄露**：按第二节末尾顺序处置（作废→换新→更新环境变量→再清历史），不只在代码里删

### 4. 三类错误统一中文提示

- **怎么算通过**：
  - ① 输入错：`curl "…/api/cards?category=hack"` 返回 400 + `kind=input` + 中文 message；`…/cards?slug=不存在` 返回 404「找不到这个情形」；PATCH 缺 id 400「缺少必填参数 id…」（✅ 线上 8 个用例全过）
  - ② 网络错：本地 `node .tmp-smoke23.js` 构造 `DB_TIMEOUT`/`DB_REQUEST_FAILED` → 504/500 + `kind=network`「网络不太顺，请稍后再试一次」；前端 1ms 超时实测「请求超时了，请检查网络后重试」（✅）
  - ③ 服务端错：构造 `duplicate key value violates unique constraint` 英文原文 → 对外只见「服务器开小差了，稍后再试」，原文不出现（✅ 冒烟第 14 项）
  - **英文泄露正则校验**：对每个 message 跑 `/(relation|constraint|duplicate key|syntax error|ECONNREFUSED|does not exist)/i` 必须 0 命中（✅ 冒烟脚本内置此检查）
- **证据**：冒烟脚本 `docs/day23-smoke.js`（`node docs/day23-smoke.js` 可复跑，14 项中 12 过、2 项 FAIL 为本地无 Key 的正确兜底）+ 线上脚本 `docs/day23-verify-online.py` 12/12（截图 `day23-shot-errors.png`）

### 5. 无裸报错残留

- **怎么算通过**：`grep -rn "e.message ||" functions/api/*/index.js` → 无「message: e.message 直出」；`grep -n "请求失败：" js/page-check.js` → 空；`grep -n "HTTP \" + res.status" js/store.js` → 空（✅ 三条今天均已复查为空）；响应体里不再出现 `JSON.stringify(b)` 直出（✅）

### 6. 密钥注入即还原纪律

- **怎么算通过**：部署脚本自带 `trap restore EXIT` 兜底；部署后 `git diff cloudbaserc.json` 为空 + Python 逐函数校验 envVariables 全空（✅ 今天部署后实测两查全过）；`git grep "eyJ" -- . ':!*.md'` 0 命中（✅）

### 7. 请求日志（加练）

- **怎么算通过**：4 个函数入口各有一行 JSON 日志（时间/函数名/方法/路径）；云函数日志页可按 `fn` / `action` 过滤（✅ cards/categories/health 今天补齐，favorites Day 18 已有）

---

## 五、遗留与说明（如实记录）

1. **真实 500 无法线上演示**：故意打挂线上环境来截图是本末倒置，⑤ 板块的服务端错用「与 `toErrorResponse` 输出形状完全一致的等价构造」演示，并注明是模拟；真实的英文原文兜底在冒烟脚本里已验证（第 14 项）。
2. **errors.js 是四份副本**：由 CloudBase 按函数目录独立打包所致（与 db.js 既有约定一致）；母版文件头写了同步命令，改母版后必须复制到四目录。
3. **`git grep` 只搜已跟踪文件**：未跟踪文件（如 `.env` 本体、临时脚本）不在其范围——所以第 1 项用 `git ls-files`（跟踪清单）+ 特征词双管齐下，临时密钥文件 `.tmp-key.txt` 已被 `.git/info/exclude` 排除且不入库。
4. **第 22 天降级未做的 DELETE 回补**：Day 22 已完成 DELETE（软删除），无需回补。

---

*Day 23 · 2026-10-09 · 审计 → 修复 → 验证 三步全部留痕*

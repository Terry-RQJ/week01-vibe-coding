# 本项目真实踩坑记录（检查项的出处）

> 本文件是 `verify-project` Skill 的**唯一事实来源**。每一条检查项都必须能在这里找到对应出处。
> 凡是本文件里没有的「通用最佳实践」，一律不得写进检查项——那是模板，不是这个项目踩过的坑。

---

## P1 · 密钥与环境变量（Day 23 安全审计）

| 坑 | 症状 | 处置 | 检查项 |
|---|---|---|---|
| `.env` 可能被误提交 | PRD §8.5 硬验收要求 `/contents/.env` 返回 404 | `.gitignore` 加固 | C1 |
| 没挡 `.env.production` 等变体、没挡 `credentials.json`/`serviceAccountKey.json` | 防线只挡了 `.env` 本体 | `.env.*` 通配 + `!.env.example` + credentials 类文件 | C2、C3 |
| 无 `.env.example` 模板 | 协作者不知道怎么配 | 新增占位符模板并入库 | C3 |
| 源码可能藏硬编码密钥 | 无日常检查手段 | 全历史扫描一次（43 提交 0 命中） | C4 |
| 部署时临时注入 `cloudbaserc.json`，忘还原则密钥入库 | 密钥进仓库 | `trap restore EXIT` 兜底 + 部署后 `git diff` 验证 | C5 |
| `.tmp-*` 临时脚本可能被误提交 | 临时文件进仓库 | 用完即删 | C6 |

**出处**：`docs/security-checklist.md §一/§三/§五`；`DEPLOY.md §17`；`.gitignore:1-8`

---

## P2 · 裸报错泄露（Day 23 安全审计）

| 坑 | 症状 | 处置 | 检查项 |
|---|---|---|---|
| 数据库英文原文直出 | `relation "cards" does not exist`、`connect ECONNREFUSED 10.x.x.x`（连内网 IP 都带出去） | 新增 `errors.js`：message 对外只回中文，英文原文只进 `detail`→日志 | C7 |
| `DB_NOT_CONFIGURED` 暴露环境变量名 | 告诉别人变量叫 `CB_API_KEY` | 对外改「服务器开小差了，稍后再试」 | C7 |
| health 405 缺 `ok:false` 且无 try/catch | 异常裸崩给网关 | 补齐 | C9 |
| 前端裸报错 | 直出 `"HTTP 500"`、`The user aborted a request.`、`JSON.stringify(b)` | `store.js apiGet` 重写 + `page-check.js` 改人话 | C8 |
| 跨目录 `require('../common/errors')` 部署失败 | CloudBase 按函数 dir 独立打包 | 母版 + 四副本（人工同步） | C9、C10 |

**出处**：`DEPLOY.md §17`；`docs/security-checklist.md §一/§二/§五-2`

---

## P3 · 输入校验（Day 24 修复的三个 Bug）

| 坑 | 症状 | 根因 | 检查项 |
|---|---|---|---|
| `parseBody` 只挡非法 JSON | `PATCH -d 'null'` → **HTTP 500**，日志 `Cannot convert undefined or null to object` at `handlePush (index.js:153:37)` | `JSON.parse('null')` 成功，`Object.keys(null)` 抛 TypeError，被 catch 兜成 500 | C11 |
| `parseId` 用 `Number()` 过于宽容 | `?id=1e2`/`+1`/`0x10`/`1.5` 被静默接受去查库 | `Number()` 语义宽容 | C12 |
| note 长度按 UTF-16 码元计 | 101 个 emoji（`String.length`=202）被误拒，但 PG `VARCHAR(200)` 按码点装得下 | JS `String.length` 与 PG 计数口径不一致 | C13 |

**出处**：`docs/day24-bugfix-log.md`；`DEPLOY.md §18`；`api-contract.md §2B.2/§2B.3`

---

## P4 · 前端静态与部署（Day 7 / Day 17 / Day 20）

| 坑 | 症状 | 处置 | 检查项 |
|---|---|---|---|
| 内部链接写绝对路径 | GitHub Pages 子路径下 `/css/global.css` → 404、样式全丢 | 全站一律相对路径（TECH_DESIGN §11.3 红线） | C14 |
| 缺 `.nojekyll` | 被 Jekyll 处理，`_` 开头文件被忽略 | 建空文件并入库 | C15 |
| `dist/` 靠手工同步 | 新文件只进根目录没进 dist → 部署后 404/白屏（Day 20 就多拷了一次） | 靠人肉 diff，无自动校验 | C16、C17 |
| 云函数自设 CORS 头 | 网关拼成 `origin,*` 双值 → 浏览器 `Failed to fetch` | 云函数一律不设 CORS 头 | C18 |
| `Nodejs20.19` 有服务端 bug | 部署报 `mjs: command not found` | 统一 `Nodejs16.13` | C19 |
| SQL 拼接 | 注入风险 | 全参数化 `$1/$2` 占位 | C20 |

**出处**：`TECH_DESIGN.md §11.3 坑 1/坑 2`；`DEPLOY.md §6 坑 3`、`§12 坑 1/坑 3`、`§15`、`§14 坑 2`

---

## P5 · 公网运行时（Day 15/17/20/24）

| 坑 | 症状 | 处置 | 检查项 |
|---|---|---|---|
| health 挂掉 | 前端无法判断后端是否可用 | 每次发布后实测 | C21 |
| 读接口挂掉 | 页面空白 | 实测 | C22 |
| CORS 白名单失效 | 陌生域名能拿到数据 | 实测「陌生域名零 CORS 头」 | C23 |
| CORS 变双值 | 自己域名也 `Failed to fetch` | 实测「白名单域名精确回显单值」 | C24 |
| Day 24 三个 Bug 回归 | 线上仍是旧代码 | 实测 400 而非 500 | C25、C26 |
| 英文泄露 | 用户看到 `relation ... does not exist` | 实测响应 message | C27 |

**出处**：`DEPLOY.md §12/§15/§18`；`api-contract.md §4`

### Day 25 实跑新发现的坑（本 Skill 自己踩出来的）

| 坑 | 症状 | 处置 |
|---|---|---|
| **Python urllib 测不出 CORS** | urllib 无论直连/走代理/换 UA，网关一律不回 `access-control-allow-origin`；curl 同样请求正常回显。疑似网关按客户端 TLS 指纹区别对待非浏览器客户端 | C23/C24 必须走 `curl_cors()`（与 Day 20 实测方法一致），禁止用 urllib 测 CORS |
| **URL 里裸写 `+` 的语义** | `?id=+1` 经网关 query 解码变成 `" 1"`，`parseId` 的 `trim()`（Day 24 有意设计）让它变成合法 `1` → 404 查无记录；字面 `+1` 编码为 `%2B1` 才会 400 | C26 把 `+1` 的预期定为 404（URL 语义，非漏洞），字面写法用 `%2B1` 测且预期 400 |
| **白名单成员认错** | Day 20 实测的放行名单 = 同环境静态托管域名（`*.tcloudbaseapp.com`）+ `localhost:8000`；GitHub Pages 域名（`terry-rqj.github.io`）**从来不在名单里**（那是 Day 15 之前的旧路线） | C24 的白名单 Origin 用「从 API 基址推导的同环境静态托管域名」，不猜 |

---

## 明确「不检查」的项（避免做通用模板）

以下是本项目的**接受现状**或**未发生**的事，故意不做检查项：

- **CloudBase 测试域名中间页**：免费版固定行为，已接受（TECH_DESIGN §3.4），检查也无解。
- **网关 `content-disposition: attachment`**：网关行为，不影响 fetch，已接受。
- **`js/store.js` API 基址硬编码**：Day 21 记为遗留待评估，**尚未改**，现在检查会一直 FAIL → 不列为检查项，列入「已知遗留」。
- **`cards`/`categories` 的 parseBody**：Day 24 记录里提过「同款隐患」，但**实测这两个函数是纯 GET、源码里根本没有 `parseBody`**（`grep -rn "parseBody" functions/` 只命中 favorites）。→ 这是一条**误报**，不列为检查项，改为在 `--online` 之外用「同款隐患观察」备注说明。

# CloudBase 开通与部署步骤（Day 15）

> 项目：法律小科普轻站（law-mini-site）。本仓库已准备好 `/api/health` 云函数源码 + 前端 `dist/` 打包。
> 全程预计 15 分钟。

---

## 1. 注册腾讯云 + 实名（5–8 分钟）

1. 打开 https://cloud.tencent.com/register
2. 用手机号/微信/邮箱注册账号（账号之间不互通，确定一个就一直用）
3. 登录后右上角顶顶头像 → **账号中心 → 实名认证**
4. 选**个人认证**（大陆居民身份证，5 分钟内完成；选企业认证要营业执照 1–3 天）
5. **免费额度**：个人认证后 CloudBase 有 1 个月**免费试用**（基础版环境，到期可续；超量才计费）

---

## 2. 开通 CloudBase（2 分钟）

1. 打开 https://console.cloud.tencent.com/tcb
2. 首次进入会引导：**同意服务协议** → **角色授权**（点同意即可，这是给服务开权限，不是付费）
3. 进入后找**免费入口**（可能叫「免费试用」「免费体验版」「0 元体验」）
   - 课程**附录 M** 里如果有**兑换码**，就是在这一步填
   - ⚠️ 如果只有「购买套餐」「选择规格并下单」而没有免费选项 → **停下来问我**，别自己付款

> 备选入口 https://tcb.cloud.tencent.com/ 是 CloudBase 的「平台版」新控制台，走的是**购买套餐**模式（要付费）。建议先用上面那个经典入口找免费体验版。

---

## 3. 创建环境（2 分钟）

1. 左侧进入**选择环境**页 → 点**新建环境**
2. 填写：
   - 环境名：`law-mini-site`
     - 命名规则：只允许**小写字母、数字、连字符**；**字母开头、字母数字结尾**；不能有连续的 `--`
     - 环境名只是给人看的标签，跟内部 ID 不是一回事
   - 地域：**上海**（国内访问最快，默认值通常就是它）
   - 若问到数据库类型：选**文档数据库（NoSQL）**——本阶段用不到，选了不影响
3. 点确定 → 等待 **1–3 分钟**，直到环境状态显示**「正常」**
4. 回到环境列表 → 点**环境 ID 右侧的复制图标** → 得到形如 `prod-1a2b3c4d` 的字符串
5. **把环境 ID 复制给我**——后续部署命令要用（注意：是 `prod-` 开头的 ID，**不是**环境名 `law-mini-site`）

---

## 4. 安装 CloudBase CLI（在你电脑上，5 分钟）

打开 PowerShell：

```powershell
npm install -g @cloudbase/cli
```

> 如果没装 Node.js，先去 https://nodejs.org 下载 LTS 版本（已装可跳过）

装完验证：

```powershell
tcb --version
```

---

## 5. 登录 CLI（1 分钟）

```powershell
tcb login
```

会弹出浏览器扫码页 → 用**刚才注册的腾讯云账号**对应的微信/邮箱扫码授权。成功后 PowerShell 显示已登录。

---

## 6. 部署 `/api/health` 云函数（2 分钟）

本项目用 `cloudbaserc.json` 声明式配置（**推荐**，一条命令把函数 + HTTP 路由 + 匿名访问一次配齐）：

```powershell
cd "C:\Users\Administrator\Desktop\Vibe Coding"
tcb fn deploy apiHealth --force --yes
```

`cloudbaserc.json` 里的关键配置（都已写好）：
- `type: "HTTP"`：HTTP 函数（要走公网 URL 必须是这种类型，普通 Event 函数没有公网地址）
- `public: true`：免鉴权（浏览器直接可访问）
- `gatewayPath: "/api/health"`：自动创建 HTTP 网关路由

> ⚠️ **坑 1**：HTTP 函数必须有 `scf_bootstrap` 启动脚本，且它要起一个**监听 9000 端口的 HTTP 服务器**。本项目用 `bootstrap.js`（Node http server）+ `scf_bootstrap`（`exec node bootstrap.js`）实现，已配好。
>
> ⚠️ **坑 2**：普通 Event 函数不能通过 `tcb routes add` 直接挂公网路由——**默认域名是系统内部域名，禁止手动加路由**。必须走 `cloudbaserc.json` 的 `gatewayPath` 让 CLI 自动配。
>
> ⚠️ **坑 3**：`--runtime Nodejs20.19` 在 2026-09 部署时会报 `mjs: command not found`（服务端 bug），用 `Nodejs16.13` 稳定。

---

## 7. 验证 HTTP 函数（30 秒）

部署成功后等 **15 秒**（网关路由生效有延迟），浏览器打开：

```
https://<EnvId>-<序列号>.ap-shanghai.app.tcloudbase.com/api/health
```

（完整 URL 在部署输出或控制台「HTTP 访问服务 → 路由列表」能看到）

应看到 JSON：

```json
{"ok":true,"service":"law-mini-site","version":"v1","time":"2026-09-29T..."}
```

如果返回 `INVALID_PATH` / 404 → 等 30 秒再试（路由传播）；`upstream 443` → 函数容器没起来，检查 `scf_bootstrap`。

---

## 8. 上传前端到静态托管（2 分钟）

```powershell
cd "C:\Users\Administrator\Desktop\Vibe Coding"
tcb hosting deploy ./dist -e <你的EnvId> --yes
```

完成后输出会有默认域名（形如 `https://<EnvId>-<序列号>.tcloudbaseapp.com/`）。

> ⚠️ **已知行为**：免费体验版环境的默认域名首次访问会弹一个「页面访问提示」中间页（说「仅供开发测试」），点**确定访问**就能进真实首页。这是 CloudBase 免费环境的统一行为，Day 5 你拒绝的就是这个——但课程要求走 CloudBase，只能接受；将来要正式上线可换自定义域名（要备案）。

---

## 9. 截图（三张）

按任务要求截：

1. **云函数公网地址的返回**：浏览器打开 `/api/health` 的 URL，地址栏 + 返回 JSON 同框
2. **前端公网页面**：浏览器打开静态托管默认域名首页，地址栏 + 首页同框
3. **控制台环境信息**：CloudBase 控制台 → 环境概览，要能看到环境 ID、剩余额度、到期日期

---

## 10. Day 15 实测结果（2026-09-29）

| 项 | 值 |
|---|---|
| 环境 ID | `rqj-2006-d0gl1ael531a243a1` |
| 套餐 | 体验版（兑换码 rqj-2006-d0gl1ael531a243a1 兑换） |
| 地域 | 上海 |
| 到期 | 2027-03-30 |
| 云函数 | `apiHealth`（HTTP 类型，Nodejs16.13） |
| 公网 API | https://rqj-2006-d0gl1ael531a243a1-1497985433.ap-shanghai.app.tcloudbase.com/api/health |
| 前端公网 | https://rqj-2006-d0gl1ael531a243a1-1497985433.tcloudbaseapp.com/ |
| 截图 | `day15-api-health.png`、`day15-frontend.png`（PNG 按仓库惯例不入库） |

---

## 11. Day 16 建库实测（2026-09-28 动手 / 10-02 截图收尾）

**环境意外惊喜**：建环境时选了 PostgreSQL 模式（不是文档型数据库），
`tcb db execute --sql` 直跑真 SQL，不用再设计 nosql 映射。

| 项 | 值 |
|---|---|
| 库 | PostgreSQL 17（CloudBase 托管） |
| 表 | `cards`（主键 slug，6 行）+ `laws`（主键 id 自增，11 行，外键 card_slug → cards.slug ON DELETE CASCADE） |
| 脚本 | `db/schema.sql`（可重复执行）、`db/seed.sql`（TRUNCATE+INSERT 幂等，连跑 2 遍 id 从 1 重排） |
| 验证 | `python db/exec.py verify`：每表 ≥5 行、JOIN、外键级联拦截、CHECK status 拦截、分类聚合 = 6 类各 1 张，ALL PASS |
| 截图 | `day16-cards-console.png`（6 行）、`day16-laws-console.png`（11 行），控制台 SQL 编辑器页面（PNG 不入库） |

### 踩坑记录（Day 16 新增）

1. **Windows 下 Python 经 tcb.cmd shim 传 SQL 被换行符截断**：多行 SQL 只传进第一行
   （首行若是 `--` 注释则等于空操作，还返回成功，纯属假成功）。根因是 .cmd shim 走
   `cmd /c`，换行符即命令终止符。**修法**：发送前压平——去掉注释行、`" ".join(splitlines())`
   合并成一行（见 `db/exec.py` 的 `tcb_sql()`）。bash 直接跑不经 cmd 所以没事，只有
   Python subprocess 才踩。多语句同理：必须 `;` 拆开逐条下发，整段 blob 会假成功。
2. **控制台「数据编辑器」页面一直转圈显示 0 条**（连元数据「无主键」都加载不出），
   点表名也不触发请求；但 CLI `SELECT count(*)` 数据完好。**绕法**：改用控制台
   「SQL 编辑器」页执行 `SELECT` 截图，效果等同且更像真操作。数据本身没问题。
3. `laws` 实际列名与最初设计不同（`name`/`text`/`source_url`，非 title/quote/article），
   以 `db/schema.sql` 为准；写 SELECT 前先查 `information_schema.columns`。
---

## 12. Day 17 GET 读接口上线（2026-10-02）

| 项 | 值 |
|---|---|
| 新云函数 | `apiCards`（/api/cards，列表+详情+搜索）· `apiCategories`（/api/categories，聚合） |
| 数据通道 | 云函数 → `POST https://{envId}.api.tcloudbasegateway.com/v1/rdb/exec-pgsql`（参数化 SQL `$1/$2/$3`，默认只读角色） |
| 凭证 | 控制台「环境管理 → API Key 配置」创建服务端 API Key（JWT，service_role，永不过期），存函数环境变量 `CB_API_KEY`；**部署时临时注入 cloudbaserc.json、部署完立即还原**，仓库里永远只有空 `envVariables: {}` |
| 授权 | `GRANT SELECT ON cards, laws TO cloudbase_read_only_user_postgres_ebc42q2s`（角色名随环境实例名变，已追加进 db/schema.sql） |
| 公网地址 | `https://rqj-2006-d0gl1ael531a243a1-1497985433.ap-shanghai.app.tcloudbase.com/api/cards`（+ `?slug=` `?category=` `?keyword=` `?limit=`；`/api/categories`） |
| 前端接入 | `js/store.js` 内容读切到真 API（fetch 5s 超时），失败回落 data/cards.js 静态数据；页面代码零改动（v3.0 升级缝隙兑现） |
| 截图 | `day17-api-cards.png`（API 返回 JSON）、`day17-frontend.png`（首页显示真库数据） |

### 踩坑记录（Day 17 新增）

1. **函数自设 `Access-Control-Allow-Origin: *` 会被网关拼成 `origin,*` 双值** —— CORS 规范要求
   单值，浏览器直接 `Failed to fetch`。结论：**云函数不要设 CORS 头**，网关按 Origin 自动回正确的单值。
2. **网关固定回 `content-disposition: attachment`**，函数回 `inline` 也覆盖不掉；实测 Edge 顶层导航
   仍直接显示 JSON 文本（每个测试域名首次访问有「页面访问提示」中间页，点确定后记住）。
3. **网关不支持子路径路由**：`gatewayPath: /api/cards` 时请求 `/api/cards/xxx` 的 path 被归一，
   详情接口改用 `?slug=` 查询参数（契约 §1.2 已同步改形态）。
4. `exec-pgsql` 默认角色是只读用户，但**该角色默认没有任何表权限**（42501），要手动 GRANT SELECT；
   角色名带实例后缀，先查 `pg_roles`。
5. 本地直调云函数代码冒烟（Node 直跑 index.js + 真 API Key）能在部署前抓住 90% 的问题，
   Day 17 的 9 个用例全靠这个提前跑通。

---

## 13. Day 18 POST 写接口上线（2026-10-03）

| 项 | 值 |
|---|---|
| 新云函数 | `apiFavorites`（/api/favorites：GET 列表 + POST 收藏/取消） |
| 新表 | `favorites`：`id` / `client_id` / `card_slug`(FK→cards, CASCADE) / `created_at`，**`UNIQUE(client_id, card_slug)` 防重复**（已进 db/schema.sql） |
| 写权限 | exec-pgsql 传 `role: "cloudbase_postgres"`（只读角色无 INSERT/DELETE）；GET 走默认只读角色 |
| 校验 | 全中文：缺 slug/on → 400 `MISSING_FIELD`；格式错 → 400 `INVALID_PARAM`；slug 不存在 → 404；重复收藏 → 409 `ALREADY_FAVORITED`（捕获 23505） |
| 加练 | 服务端 JSON 日志：每请求一行 `{t, fn, action, ...}`，云函数日志页可过滤 |
| 截图 | `day18-post-success.png`（POST 返回 `{ok:true,...}`）、`day18-db-row.png`（控制台 SELECT favorites 两行） |

### 踩坑记录（Day 18 新增）

1. **exec-pgsql 成功响应是顶层数组**（`[{...}]`），不是 `{data:{Rows}}`——Day 17 的 cards 函数解析对了，
   新函数想当然套 `tcb db execute --json` 的形状（`data.Rows`）直接 500。**以实际 curl 为准，别猜。**
2. **云函数运行时 Nodejs16.13 没有全局 fetch**——本地 Node 22 直调冒烟用 fetch 能过，部署后必挂；
   必须用 `https.request`（Day 17 cards 函数同款）。本地冒烟要用 `node --version` 对齐运行时心智。
3. **Edge 最小化时窗口矩形是 (-16000,-16000)**，按面积过滤会把它漏掉；截图脚本要先 `IsIconic` →
   `ShowWindow(SW_RESTORE)` → 重查 `GetWindowRect`（还原后坐标会变）。
4. profile 重启后首次进控制台会先跳登录页——**别急着喊用户扫码**，等 10–20s 常会自动跳回（登录态其实在）。

---

## 14. Day 19 后端分层重构（2026-10-03）

### 拆了什么：三个云函数统一拆成「db.js + *Repository.js + 薄入口 index.js」

| 层 | 文件 | 职责 | 不许出现 |
|---|---|---|---|
| 连接层 | `db.js`（cards/categories/favorites 各一份） | exec-pgsql 网关调用、超时、错误包装；favorites 版支持 `role` 写提权 | 业务 SQL |
| 数据访问层 | `cardsRepository.js` / `lawsRepository.js` / `favoritesRepository.js` | 该表**全部** SQL（全参数化），返回行数组/布尔/计数 | HTTP 处理、中文报错文案 |
| 入口层 | `index.js`（瘦身后约 60–160 行） | 接请求 → 参数校验（中文 400/404/409）→ 调 repository → 拼响应 | 任何 SQL 字符串 |

- 每函数目录一份 db.js/repository 是 **CloudBase 按函数目录独立打包**导致的（跨目录 require 上不了线），不是设计冗余。
- 404/409 这类「人话报错」留入口层：它们是请求层职责；repository 只报数据层事实（如 23505）。
- 分层示意图：`assets/day19-layers.svg`（余力加练）。

### 回归验证（重构前后各 21 项，响应体逐字节对比）

- 覆盖：health / cards 列表 4 变体 / cards 详情 / categories / favorites 完整序列（重置→收藏→重复 409→缺字段 400×3→不存在 404→列表→取消 removed=1→重复取消 removed=0→空列表）。
- 方法：`.tmp-regress.sh before|after` 两轮 + Node 脚本 diff（仅归一化 `time`/`created_at`/`favorited_at` 动态时间戳）→ **完全一致**。
- 另跑本地直调冒烟 21 用例（真 API Key + mock event）再部署，线上回归零意外。

### 踩坑记录（Day 19 新增）

1. **CloudBase 测试域名中间页会吃掉 API 截图**——浏览器首次访问每个路径都有「页面访问提示」，要先 CDP 点「确定访问」再截（点过一次按域记住，换路径还会再弹）。
2. `cloudbaserc.json` 被 Node `JSON.stringify` 重写后只是换行符变了也会整文件 M——**先 `git diff` 确认无实质差异再 checkout 还原**，别把密钥注入轮次的格式化噪声提交进仓库。
3. 回归对比必须归一化动态字段：/health 的 `time`、favorites 的 `created_at`/`favorited_at`，否则永远 DIFF。

---

## 15. Day 20 前端真数据公网化 + 检查台（2026-10-03）

### CORS 实测结论（今天最重要的一条）

用 curl 带不同 Origin 打公网 API，实测 CloudBase HTTP 网关是**内置白名单**机制：

| 请求 Origin | 网关响应 |
|---|---|
| `https://…-1497985433.tcloudbaseapp.com`（同环境静态托管） | ✅ `access-control-allow-origin: <精确回显该域名>` + allow-credentials |
| `http://localhost:8000` / `http://127.0.0.1:8000`（本地开发） | ✅ 同上（网关对 localhost 网段放行，方便本地调试） |
| `https://evil.example.com`（陌生域名） | ❌ **一个 CORS 头都不回**（浏览器直接拦截） |

- **全链路没有 `*`**：函数不设 CORS 头（Day 17 教训，设了会被拼成 `origin,*` 双值）+ 网关白名单自动回单值。§4 的「只允许自己域名、禁 *」要求实测已满足，无需任何代码改动。
- POST 预检（OPTIONS + Access-Control-Request-Method）同样只对自己域名 + localhost 放行。
- 「跨域怎么认出问题在哪」的方法论：先 `curl -D - -H "Origin: …"` 看响应头里有没有 `access-control-allow-origin`——有但值不对 = 配置错；完全没有 = 白名单拦截；`origin,*` 双值 = 函数和网关各设了一次。

### 检查台（新增 check.html，公网可访问）

- `https://…tcloudbaseapp.com/check.html`：①健康状态 ②核心表真实数据（cards 6 行表格 + categories 聚合）③写入测试（收藏 200 → 重复 409 → 取消 removed:1，每步自动 GET 读回）④「最后更新时间」随每次数据刷新更新（加练）。
- 检查台直连公网 API（不走 Store 的 mock 回落），F12 Network 可见请求全是 `…app.tcloudbase.com/api` 公网地址。

### 逐项验证清单（全部实测通过）

| # | 检查项 | 结果 |
|---|---|---|
| 1 | 4 个云函数公网可用（health/cards/categories/favorites） | ✅（Day 19 回归脚本同款 21 项） |
| 2 | CORS 白名单：自己域名放行 / 陌生域拦截 / 无 `*` | ✅（上表实测） |
| 3 | 本地接线：localhost:8000 页面内 fetch 公网 API 成功读到数据 | ✅（`corsOk:true`，6 类计数） |
| 4 | 公网首页展示数据库真实数据（6 张卡） | ✅ |
| 5 | 控制台改数据刷新跟着变：UPDATE gongsi-quantui 标题加【Day20 验证】→ 公网首页刷新出现 → 还原 | ✅ |
| 6 | F12 请求地址是公网地址（performance resource 记录） | ✅ |
| 7 | 检查台三板块 + 写入测试 + 最后更新时间 | ✅ |
| 8 | 移动端 375px 无横向溢出（检查台） | ✅ scrollWidth=375 |
| 9 | 密钥无硬编码：`.env` 不入库、`cloudbaserc.json` envVariables 空、`git grep eyJ` 零命中 | ✅ |

### 把链接发给同伴的验证说明

1. 发这个链接：`https://rqj-2006-d0gl1ael531a243a1-1497985433.tcloudbaseapp.com/`
2. 对方首次打开会先看到腾讯云「页面访问提示」（测试域名统一行为）→ 等按钮倒计时结束点「确定访问」（有时有两层，再点一次）
3. 请对方看：首页 6 张「最新情形」卡片能正常显示 → 点任意卡片能进详情 → 搜索「押金」有结果
4. 检查台 `…/check.html`：三个板块都应有绿色/正常状态；点「测试收藏」返回 200，再点一次变 409
5. 若对方打开白屏：多半停在中间页没点「确定访问」，或网络拦截了 `*.tcloudbase.com`，换个网络再试

### 最可能的卡点与处理（提前列）

| 卡点 | 症状 | 处理 |
|---|---|---|
| CORS | F12 Console 报 `Failed to fetch`，Network 里请求红色 | 确认函数没自设 CORS 头（设了会双值）；确认访问域名是静态托管域名（陌生域名被白名单拦是预期行为） |
| 环境变量 | 接口 500 `DB_NOT_CONFIGURED` | `CB_API_KEY` 只存在函数环境变量里，部署时经 cloudbaserc.json 注入后**立即还原**；别把 Key 写进任何入库文件 |
| 构建报错 | 部署后页面 404 / 白屏 | dist 是手工同步的静态拷贝：新文件必须同时进根目录和 dist/（今天 check.html 就多拷了一次到 dist 根，已清理）；CDN 缓存约几分钟，可 `curl -H "Cache-Control: no-cache"` 验证 |
| 测试域名中间页 | 打开是「页面访问提示」 | 等倒计时 → 「确定访问」（可能两层）；点过一次按浏览器记忆 |

---

## 16. Day 22 PATCH + DELETE：改/删闭环 + 软删除 + 二次确认（2026-10-07）

### 这天动了什么（四层各一处）

| 层 | 改动 | 要点 |
|---|---|---|
| 数据库 | `favorites` 补 `note`（≤200，默认空）与 `is_deleted`（默认 false）两列；唯一约束 `UNIQUE(client_id, card_slug)` 升级为**部分唯一索引** `uq_favorites_active ... WHERE is_deleted = false`（迁移在 `db/schema.sql` 末尾「Day 22 追加」段，云端已执行） | 不改部分索引的话：软删后再收藏会撞 23505 被报成「已收藏」——软删除必须配部分唯一索引，这是今天最重要的一个坑 |
| 云函数 | `apiFavorites` 从两方法扩到四方法：GET / POST / **PATCH（只许改 note）** / **DELETE（软删除）** | 写操作显式提权 `cloudbase_postgres`（只读角色写不了）；id 走 `?id=` 查询参数（网关子路径会归一化，Day 17 教训） |
| 前端 | `check.html` 新增 ④ 修改与删除板块；删除走**原生 `<dialog>` 二次确认**（确认动作在发请求之前，自带焦点陷阱 + Esc 关闭） | 已同步 dist 并重新 `tcb hosting deploy`，公网检查台与本页一致 |
| 文档 | `api-contract.md` §2B.3/§2B.4 标「已实现 Day 22」；§3 占位清单同步 | GET / POST 响应补 `id`（/ `note`），供按 id 操作 |

### 验证清单（全部实测通过）

| # | 检查项 | 结果 |
|---|---|---|
| 1 | 本地直调冒烟 13 项（mock event，部署前跑） | ✅ 抓出并修掉「校验顺序」bug（见下卡点） |
| 2 | 线上四类闭环：POST 拿 id → SELECT（note=""）→ PATCH 200 → SELECT（note=新值）→ DELETE 200 → GET 不再返回 → SELECT（is_deleted=true，行还在可找回） | ✅（`docs/day22-prod-verify.txt` 全记录） |
| 3 | 错误分支：PATCH/DELETE 不存在的 id → 404 `FAVORITE_NOT_FOUND`（中文带 id）；PATCH 传 `card_slug` → 400 白名单报错；缺 id / id 非正整数 → 400 | ✅ |
| 4 | 二次确认自动化（CDP 6 步）：点「删除」→ 对话框弹出 → **点「取消」→ 列表条数不变（拦截证明）** → 再点删除 → 确认 → DELETE 200 → 列表刷新为空 | ✅ |
| 5 | 软删后再收藏：`POST on:true` 返回 200 新 id（部分唯一索引生效） | ✅ |
| 6 | 交付截图两张：`day22-shot-patch.png`（改前「无备注」/ 改后 HTTP 200 + 新值对比）、`day22-shot-delete.png`（二次确认框 → DELETE 200 soft:true → 重新 GET 该条消失） | ✅ |
| 7 | 密钥安全：部署注入 `CB_API_KEY` → `git checkout -- cloudbaserc.json` 立即还原 → 四个函数 envVariables 全空 | ✅ |

### 交付物（本日新增文件）

- `functions/api/favorites/index.js` / `favoritesRepository.js`（四方法 + 软删除）
- `db/schema.sql` 末尾 Day 22 追加段（note / is_deleted / 部分唯一索引）
- `check.html` ④ 板块 + 确认对话框；`js/page-check.js` ④ 逻辑；`css/global.css` 配套样式（均同步 dist）
- `day22-shot-patch.png` / `day22-shot-delete.png`
- `api-contract.md` / 本文档更新

### 卡点与处理

| 卡点 | 症状 | 处理 |
|---|---|---|
| PATCH 校验顺序 | 传 `{card_slug:'hack'}`（没传 note）时报「缺少必填字段 note」，提示误导 | **先查未知字段白名单，再查 note 必填**；修后报「本接口只能改 note，不支持改：card_slug」 |
| tcb CLI 丢失 | 环境重置后 `tcb` 命令没了，`db/exec.py` FileNotFoundError | 重装 `@cloudbase/cli`；给 `db/exec.py` 加自动探测（`TCB_CLI` 环境变量 → PATH → 常见安装路径 glob），一劳永逸 |
| 唯一约束 × 软删除 | 软删后再收藏 23505「已收藏」 | 唯一约束改部分唯一索引 `WHERE is_deleted = false`（迁移含 `DROP CONSTRAINT` + `CREATE UNIQUE INDEX`） |

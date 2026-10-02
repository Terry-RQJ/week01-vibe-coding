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
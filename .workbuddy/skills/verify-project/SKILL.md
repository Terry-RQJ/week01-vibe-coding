---
name: verify-project
description: 法律小科普轻站的发布前检查。在部署后、推送前，或改动公网前端（index/card/bookmarks/history/check.html、js/、css/）、云函数（functions/api/**）、数据库脚本（db/）之后使用，用于验证密钥没泄漏、错误提示没泄露英文原文、Day 24 三个输入校验 Bug 没回归、静态资源没写绝对路径、dist 同步没漏拷、公网接口与 CORS 白名单正常。每个检查项均来自本项目真实踩过的坑，写明「怎么算通过」与证据。
agent_created: true
---

# verify-project：发布前检查

## 用途

在**部署之后、`git push` 之前**跑一遍，确认这次改动没有把项目历史上踩过的坑重新踩一遍。检查项全部来自本项目真实事故（出处见 `references/pitfalls.md`），不是通用模板。

## 何时使用

- 部署云函数或静态托管之后
- 改了 `functions/api/**`（云函数）、`js/**`、`*.html`、`db/**`、`cloudbaserc.json`、`.gitignore` 之后
- 推送前作为最后一道闸
- 用户说「发布前检查」「上线前跑一遍」「verify-project」

## 怎么跑

离线检查（不需要网络、不需要密钥，约 2 秒）：

```bash
python .workbuddy/skills/verify-project/scripts/preflight.py
```

追加公网检查（需要能访问线上环境）：

```bash
python .workbuddy/skills/verify-project/scripts/preflight.py --online
# 基址默认从 js/store.js 里读；也可显式指定：
python .workbuddy/skills/verify-project/scripts/preflight.py --online --base https://xxx.ap-shanghai.app.tcloudbase.com
```

**退出码**：`0` = 全部 PASS；`1` = 有 FAIL（可直接在 CI/脚本里用）。

输出形态：逐项 `[PASS]` / `[FAIL]` + 编号 + 实际命令输出作为证据，末尾给汇总与未通过项清单。

## 检查项与通过标准

**每一项都必须能明确判定 PASS/FAIL，禁止「看起来正常」这类表述。**

### 一、密钥与敏感信息（C1–C6）

| 编号 | 检查 | 怎么算通过 |
|---|---|---|
| C1 | `.env` 未被 git 跟踪 | `git ls-files .env` **无输出** |
| C2 | 无密钥类文件被跟踪 | `git ls-files` 匹配 `*.key/*.pem/*.p12/credentials/serviceAccount` **为空** |
| C3 | 忽略规则双向正确 | `git check-ignore -v .env` **命中 `.gitignore`**；且 `git ls-files .env.example` **有输出**（模板已入库） |
| C4 | 代码无硬编码密钥 | `git grep` 搜 `eyJ20+/sk-20+/AKID/ghp_`，**代码文件 0 命中**（`.md` 文档里的「检查命令字样」不算） |
| C5 | 部署后密钥已还原 | `cloudbaserc.json` 四函数 `envVariables` **全部为空对象** |
| C6 | 无临时文件入库 | `git ls-files` 里 **无 `.tmp-*`** |

### 二、错误提示与异常兜底（C7–C13）

| 编号 | 检查 | 怎么算通过 |
|---|---|---|
| C7 | 后端无裸报错 | 四函数目录内 **搜不到** `message: e.message` / `message: parsed.message` / `message: err.message` |
| C8 | 前端无裸报错 | `js/store.js`、`js/page-check.js` 里 **搜不到** `HTTP " + res.status` / `请求失败：` |
| C9 | 四函数接入统一映射 | 每个函数 `index.js` 含 `toErrorResponse`，且同目录有 `errors.js` 副本 |
| C10 | 母版与四副本一致 | `common/errors.js` 与四目录副本**逐字节相同** |
| C11 | body 非对象防线在 | `favorites/index.js` 含 `typeof parsed` **且**含 `Array.isArray(parsed)` |
| C12 | id 白名单正则在 | `favorites/index.js` 含 `/^[1-9][0-9]{0,15}$/` |
| C13 | note 按码点计 | `favorites/index.js` 含 `Array.from` |

### 三、前端与部署静态一致性（C14–C20）

| 编号 | 检查 | 怎么算通过 |
|---|---|---|
| C14 | 全站相对路径 | 五个页面 + `dist/*.html` 里**搜不到** `href="/` 或 `src="/` |
| C15 | `.nojekyll` 就位 | 文件**存在** 且 `git ls-files .nojekyll` **有输出** |
| C16 | 根目录与 dist 页面一致 | 逐文件比对，**内容完全相同**（无 drift） |
| C17 | 根目录与 dist 的 js/css 一致 | `js/store.js`、`js/page-check.js`、`js/ui.js`、`css/global.css` **逐字节相同** |
| C18 | 云函数不设 CORS 头 | `grep -rn "Access-Control-Allow-Origin" functions/` **0 命中** |
| C19 | 运行时是 Nodejs16.13 | `cloudbaserc.json` 每个函数 runtime **含 `16.13`** |
| C20 | SQL 全参数化 | `*Repository.js` 的 SQL 语句里**无 `${}` 插值**（应为 `$1/$2` 占位） |

### 四、公网运行时（C21–C27，需 `--online`）

| 编号 | 检查 | 怎么算通过 |
|---|---|---|
| C21 | health 可用 | `GET /api/health` → **HTTP 200** 且响应含 `"ok":true` |
| C22 | 读接口可用 | `GET /api/cards?limit=1` → **HTTP 200** 且含 `"ok":true` |
| C23 | 白名单严格 | `curl` 带 `Origin: https://evil.example.com` → 响应**没有任何** `access-control-allow-origin` 头 |
| C24 | 白名单放行且单值 | `curl` 带**同环境静态托管域名** Origin（`*.tcloudbaseapp.com`，DEPLOY.md §15）→ 回显值**恰好等于该 Origin** 且**不含逗号** |
| C25 | Day 24 Bug 1 未回归 | `PATCH /api/favorites?id=1` + body `null` → **HTTP 400**（绝不能 500） |
| C26 | Day 24 Bug 2 未回归 | `?id=1e2` / `0x10` / `1.5` / `-1` / `0` / `01` / `%2B1` → **全部 400**；裸写 `+1` 是 URL 空格语义（解码成 `" 1"`，trim 后合法）→ **404** |
| C27 | 无英文泄露 | 三个接口的 `error.message` 里**搜不到** `relation/constraint/duplicate key/syntax error/ECONNREFUSED/does not exist` |

## 发现 FAIL 怎么办

1. **先看证据行**——脚本会把实际命令输出打出来，不要凭猜。
2. **对照 `references/pitfalls.md` 找该编号对应的历史坑与修复方式**，多数是「改一处忘同步」（如 C10 母版改了忘拷副本、C16/C17 dist 忘同步）。
3. 修完后**重跑同一命令**确认转 PASS，把前后两次输出都留档（任务要求「同一清单重跑，前后各留证据」）。
4. 若是**误报**（脚本判错），改脚本而不是改项目——并在本文件记录为什么是误报。

## 明确不检查的事（防止过度检查）

见 `references/pitfalls.md` 末节「明确不检查的项」。要点：CloudBase 中间页、网关 `content-disposition` 属**已接受的现状**；`js/store.js` 基址硬编码属**已知遗留**（检查会一直红，故不列）；`cards`/`categories` 的 parseBody 是**误报**（那俩函数是纯 GET，根本没有 parseBody）。

## 已知局限

- 英文泄露检查用的是**已知英文模式正则**（`relation`/`constraint`/…），未知的新英文错误可能漏掉 → 属「降低概率」不是「绝对保证」。
- 离线项靠**源码静态匹配**，只证明「防线代码在」，不证明「运行时行为对」——行为正确性由 `--online` 项覆盖。
- 本机 Steam++ 代理会劫持 `127.0.0.1` 流量并伪造响应，脚本内已用**无代理 opener** 直连规避；若自行写脚本记得同样处理。
- **CORS 检查必须走 curl**（Day 25 实测发现）：Python urllib 发出的请求网关一律不回 CORS 头（疑似按客户端 TLS 指纹区别对待），用 urllib 测 CORS 会得到「所有域名都无头」的假结果——脚本已内置 `curl_cors()`，自行扩展时注意。

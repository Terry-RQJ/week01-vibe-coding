# Day 28 · 最终验收表（28 天作品 v1.0 ·「法律小科普轻站」）

> 验收日期：2026-10-12（Day 28）
> 验收方式：**当天全部重新实测**，不是「上次跑过」。每项给可复现的证据；没验证的写「未执行」，不把「首页能打开」说成全部完成。
> 结论口径：**PASS** = 证据完整且可复现；**FAIL** = 有明确缺陷；**未执行** = 范围内未做，如实标注（不阻塞结营）。

## 0. 一句话结论

10 项主验收 **全部 PASS**（其中「额度与到期」1 项带风险提示）；13 项公网写入链路、21 项核心流程重复检测（3 轮 × 7 项）、发布前检查离线 20/20 + 在线 27/27 全过；3 项如实标注「未执行」；新发现 2 处 P2 瑕疵记账不改。作品以 **v1.0.0**（tag 指向 `44198da`，含 Day 27 修复 `dfbafbb`）交付。

> 逐项打勾的验收清单截图：`day28-shot-acceptance-checklist.png`；公网 URL + 完整作品截图：`day28-shot-live-site.png`（上条为窗口实拍含真实地址栏，下条为同一页面整页截图，两者拼接）。

---

## 1. 主验收清单（10 项）

| # | 验收项 | 结论 | 实际证据（2026-10-12 实测） |
|---|---|---|---|
| 1 | 页面 / 视图数量 | **PASS** | 5 个页面全部 200：`/` 14049B、card.html、bookmarks.html、history.html、check.html（curl 逐个实测）。每页 4 态（加载/成功/空/错误）由 `renderLoading/Empty/Error/CardList` 统一渲染（js/ui.js） |
| 2 | 反馈交互 | **PASS** | 收藏 toast 成败两态（3 处调用）；按钮忙碌态 `aria-busy` + `disabled`；`aria-live` 播报 5 处；删除前二次确认 `<dialog>`（check.html ④ 板块）；3 轮实测每次点击都有可见反馈（toast 原文见 §3） |
| 3 | 数据库读写 | **PASS** | 线上 13 项全过：POST 200（id=37）→ 重复 POST 409 `ALREADY_FAVORITED` → GET 读回 1 条 → PATCH 改备注 → 读回一致 → DELETE 200（`soft:true`）→ 重复 DELETE 404（契约 §2B.4 规定「已软删 → FAVORITE_NOT_FOUND」）→ `on:false` removed=1 / 重复 removed=0（幂等）。库内现状：cards 6 / laws 11 / favorites 18 行（含软删），库 10 MB |
| 4 | 前后端链路 | **PASS** | `/api/health` 200、`/api/cards?limit=50` 200（6 条真实数据）、`/api/categories` 200（6 类各 1）、`?slug=` 200、`?category=labor` 200；前端 `js/store.js` 的 API 基址 = 公网网关地址（非本地 mock） |
| 5 | 合法数据来源 | **PASS** | laws 表 **11/11 条带 source_url，全部指向国家法律法规数据库 flk.npc.gov.cn**；卡片带「核验日期 + 复核人」；页脚免责声明（AI 起草 + 律师复核、不构成法律咨询、12348 / 110） |
| 6 | 公网地址 | **PASS** | https://rqj-2006-d0gl1ael531a243a1-1497985433.tcloudbaseapp.com/ —— 5 个页面 + 6 个接口今天 16:32 复测全部 200 |
| 7 | 线上持久化 | **PASS** | 服务端：POST 写入后重新 GET 读回一致；PATCH 改备注后读回一致。浏览器端：核心流程 3 轮 × 7 项 = 21 项全过，每轮「收藏 → 刷新仍在 → 取消 → 刷新无残留 → 回首页状态一致」 |
| 8 | 回滚与备份说明 | **PASS** | `docs/rollback-playbook.md`（含「什么情况必须回滚」判断表）、`docs/release-checklist-v1.0.md`、`docs/day26-rollback-drill.md`。回滚已实测两轮：**部署回滚 8~11 秒、公网恢复 20~30 秒**。数据备份：一条 SQL 导出三表（今天实测 cards 6 / laws 11 / favorites 18，9069 字符） |
| 9 | CloudBase 额度与到期风险 | **PASS（含风险）** | 资源点 **9.09 / 3000 = 0.30%**，按量付费 0 元；计费周期 2026-09-29 ~ 10-30。⚠️ **环境到期 2027-03-30 23:59:59（体验版，剩 169 天）**——到期不续费则站点与接口一并下线，这是本作品最大的单点风险（详见 `docs/day27-resource-report.md`） |
| 10 | 敏感文件 | **PASS** | `.env`、`.tmp-key.txt` 均未入库（`git ls-files` 0 条）；全历史扫描无真实密钥（AKID / ghp_ / eyJ 的命中逐条核对均为文档里的检查命令字样）；`cloudbaserc.json` 四个云函数 `envVariables` 全为 `{}`；`dist/` 无敏感文件混入 |

**统计：PASS 10 项（含 1 项带风险提示）/ FAIL 0 项 / 未执行 3 项（见下）。**

## 2. 未执行项（如实标注，不阻塞结营）

| # | 项目 | 结论 | 原因 |
|---|---|---|---|
| U1 | `GET /api/history` · `POST /api/history` | **未执行** | 契约 §5 标「Day 18+ 待定」；history 表未建，浏览记录按 PRD §8.3 走 localStorage（Day 13 已实现并验收） |
| U2 | 真人第三方试用（Day 27 主线） | **未执行** | 试用脚本与记录表已备好（`docs/day27-usability-script.md` / `day27-feedback-form.md`）；由记录人自跑替代（见 `docs/day27-trial-record.md`），效力低于真人试用 |
| U3 | RESTful 子路径 `DELETE /api/favorites/:slug` | **未执行（形态调整）** | 网关不支持子路径（Day 17 结论）；落地为 `?id=` 形态并已实现（本表 #3 实测通过），按 slug 的取消走 `POST on:false` |

## 3. 核心流程重复检测（板块②，3 轮 × 7 项 = 21 项全过）

对真实公网站点，用 CDP 驱动真实鼠标点击（非 JS 注入），3 轮各换一张卡完整走：

1. 点 ☆ → 按钮变「★ 已收藏」+ toast「已收藏！可在右上「我的收藏」查看」
2. 刷新 → 该卡仍「已收藏」（localStorage 持久化）
3. 收藏页 → 只有本轮这张卡（无重复、无前轮残留），导出入口可见
4. 导出 JSON → 本地生成 Blob，`format=law-mini-site/bookmarks@1`、count=1、含本卡 slug
5. 点 ☆ 取消 → **不刷新即移出** + 空态 + 导出入口自动隐藏（Day 27 修复项）
6. 刷新 → 0 张，无残留
7. 回首页 → 该卡回到「☆ 收藏」（跨页一致）

每轮耗时 5.3 ~ 6.8 秒，3 轮结论一致，**未发现重复操作导致的脏状态**。

## 4. 今天新发现、记账不改的瑕疵（P2）

1. **网关层错误文案为英文**：`GET /api/cards?keyword=` 传未 URL 编码的中文时，网关直接返回英文 `Bad Request`（HTTP 400）。浏览器端走 `encodeURIComponent`，用户路径不受影响；这是平台网关行为，无法在前端拦截，记为 P2 遗留。
2. ~~**卡片归类不自然**：「房东不退押金」的 `category_id = marriage`（婚姻家庭类）。系 Day 8 演示数据为让 6 个分类各 1 张卡而致；P2 数据瑕疵，记账不改。~~
   **Day 29 更正（属误判）**：这不是 Bug。`data/cards.js` 的 `LAW_CATEGORIES` 里 `marriage` 的 `desc` 写的就是「**租房、婚姻、继承**」——租房（含押金）本就是该分类的既定范围。Day 28 只看 `category_id` 的英文名（`marriage` = 婚姻）就下了结论，没回头读分类定义。Day 29 内容扩充后该类仍是「押金 / 离婚房产 / 彩礼 / 遗产」四张，归类自洽。**本条撤销，不计入遗留。**

## 5. 交付清单清点（板块③）

| 类别 | 内容 |
|---|---|
| 线上作品 | 站点（5 页）+ 6 个公网接口 + 检查台，tag `v1.0.0` = `44198da`（+ Day 27 修复 `dfbafbb`） |
| 代码 | 前端 2935 行（js / css / html）+ 云函数 1624 行（4 个 HTTP 函数，分层：index → repository → db） |
| 数据库 | PostgreSQL 17：`db/schema.sql`（可重复执行）+ `db/seed.sql`（6 卡 / 11 法条）+ `db/exec.py` 执行器 |
| 文档 | PRD / TECH_DESIGN / api-contract / DEPLOY / README + docs/ 18 份（契约、安全清单、验收、演练、回滚、资源说明、试用脚本等）+ 检查 Skill 1 套（27 项） |
| 周验收 | 第 3 周验收表 `docs/week3-acceptance.md`（PASS 29 / 未执行 4）；本表为最终验收 |
| 截图 | 今天 2 张（验收清单打勾、公网 URL + 完整作品）+ 28 天累计 90+ 张过程截图（本地留档，按约定不入库） |
| 版本 | 40 个提交（2026-09-17 起），tag `v0.9.0` / `v1.0.0` 均已推送远端 |

## 6. 复现命令

```bash
SITE=https://rqj-2006-d0gl1ael531a243a1-1497985433.tcloudbaseapp.com
GW=https://rqj-2006-d0gl1ael531a243a1-1497985433.ap-shanghai.app.tcloudbase.com

curl -s -o /dev/null -w "%{http_code}\n" "$SITE/"                      # ⑥ 200
curl -s "$GW/api/health"                                               # ④ {"ok":true,...}
curl -s "$GW/api/cards?limit=50" | head -c 300                          # ④ 6 条真实数据
# ③ 写入链路（Python，禁用本机代理）：.tmp-api-test.py 的逻辑见 docs/day28-acceptance.md §1
# ⑦ 3 轮核心流程：docs/day27-mobile-walkthrough.js（Day 27 已归档）改轮数即得
# ⑨ 额度/到期：tcb env list ; tcb env usage -e rqj-2006-d0gl1ael531a243a1
```

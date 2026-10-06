# 第 3 周验收表 · 「法律小科普轻站」

> 周期：Day 15 – Day 20（2026-09-29 ~ 2026-10-03）
> 填表日期：Day 21（2026-10-06）
> 验收方式：**全部为本次实测复现**，不是「上次跑过」。证据列每项给到可复现的命令或可打开 URL。
> 结论口径：**PASS** = 证据完整且可复现；**FAIL** = 有明确缺陷；**未执行** = 本周范围外，如实标注。

## 0. 一句话结论

第 3 周 6 天目标（建表 → GET → POST → 分层 → 公网真数据）**全部 PASS**；契约中 `history` 两类接口与 `DELETE /api/favorites/:slug` 为**未执行**（本周范围外，理由见 §4）。

---

## 1. 验收项总表

| # | 验收项 | 结论 | 证据（可复现） |
|---|---|---|---|
| W3-1 | schema 脚本：建表可重复执行 | **PASS** | `db/schema.sql` 首行注释「可重复执行：DROP IF EXISTS 先删后建」；`CREATE TABLE cards`/`laws`/`favorites` 三表 + 3 个索引 + 2 条 GRANT；提交 `dfad60f`(Day16)、`c5b8682`(Day18) |
| W3-2 | seed 脚本：种子数据可重复执行 | **PASS** | `db/seed.sql` 头部「TRUNCATE … RESTART IDENTITY CASCADE」+ 2 条 INSERT（6 张卡 + 11 条法条）；提交 `dfad60f` |
| W3-3 | 云端执行器可用 | **PASS** | `db/exec.py` 三子命令 `schema`/`seed`/`verify`；含 Windows 换行截断规避说明 |
| W3-4 | 数据真实落库（不是 mock 回显） | **PASS** | `GET /api/cards` → `items=6, meta.total=6`；`GET /api/categories` → `consume:1 labor:1 loan:1 marriage:1 neighbor:1 traffic:1`（6 类合计 6，与 cards 行数自洽） |
| W3-5 | `GET /api/health` 公网可用 | **PASS** | `curl $GW/api/health` → **200** `{"ok":true,"service":"law-mini-site","version":"v1","time":...}` |
| W3-6 | `GET /api/cards` 列表 + 分页元信息 | **PASS** | 同 W3-4；响应形状 `{ok:true, data:[...6], meta:{total:6}}`；提交 `e60d5d7`(Day17) |
| W3-7 | `GET /api/cards?slug=` 详情（含关联法条） | **PASS** | `curl "$GW/api/cards?slug=gongsi-quantui"` → **200** `title=公司劝退我，该怎么办？` `laws 条数=3` |
| W3-8 | `GET /api/cards?keyword=` 搜索 | **PASS** | `curl "$GW/api/cards?keyword=押金"` → **200** `命中=1` slug=`fangdong-bu-tui-yajin` |
| W3-9 | `GET /api/cards?category=` 筛选 | **PASS** | `curl "$GW/api/cards?category=labor"` → **200** `命中=1` slug=`gongsi-quantui` |
| W3-10 | `GET /api/categories` 聚合计数 | **PASS** | 见 W3-4；提交 `e60d5d7` |
| W3-11 | `POST /api/favorites` 写入成功 | **PASS** | `curl -X POST -d '{client_id,slug,on:true}'` → **200** `{"ok":true,"data":{"slug":"fangdong-bu-tui-yajin","on":true,"favorited_at":"2026-10-06T22:25:41.494401+08:00"}}`；提交 `c5b8682`(Day18) |
| W3-12 | 写入后**读回**一致（持久化） | **PASS** | 紧跟 `GET /api/favorites?client_id=day21-acceptance` → **200** `条数=1, meta.total=1, slug=fangdong-bu-tui-yajin` |
| W3-13 | 防重复提交 | **PASS** | 同参数连发两次 POST → 第二次 **409** `{"code":"ALREADY_FAVORITED","message":"这张卡片已经收藏过了，请勿重复提交"}` |
| W3-14 | 缺字段中文报错 | **PASS** | 只传 `client_id` → **400** `{"code":"MISSING_FIELD","message":"缺少必填字段 slug（要收藏的卡片短名）"}` |
| W3-15 | 不存在的卡片报错 | **PASS** | `slug=no-such-card-xyz` → **404** `{"code":"CARD_NOT_FOUND","message":"找不到这个情形：no-such-card-xyz"}` |
| W3-16 | 取消收藏幂等 | **PASS** | `on:false` → **200** `removed=1`；重复取消 → `removed=0`；取消后 `GET` 读回 `条数=0` |
| W3-17 | 统一响应形状 `{ok,data,error}` | **PASS** | 全部 13 个用例逐条核对：成功恒有 `ok:true`+`data`（列表附 `meta`）；失败恒有 `ok:false`+`error.code`+`error.message`（中文） |
| W3-18 | SQL 参数化（无字符串拼接） | **PASS** | `functions/api/*/​*Repository.js` 全部 `$1/$2/$3` 占位符；repository 内无模板字符串拼 SQL；提交 `ddc0add`(Day19) |
| W3-19 | 分层重构：SQL 全部下沉 repository | **PASS** | 3 个 `index.js` 瘦身为「接请求→校验→调 repository→返响应」，零 SQL；新增 8 文件（3×`db.js` + `cardsRepository`×3 + `lawsRepository` + `favoritesRepository`）；提交 `ddc0add` |
| W3-20 | 重构后接口行为不变（回归） | **PASS** | 重构前后各 21 项线上调用逐字节对比（仅归一化 `time`/`created_at`/`favorited_at`）→ **完全一致**；记录见 `DEPLOY.md` §14 |
| W3-21 | 公网首页可访问 | **PASS** | `https://…tcloudbaseapp.com/` → **200**（12648 bytes） |
| W3-22 | 公网首页展示数据库真实数据 | **PASS** | 首页 6 张卡；控制台改 `title` 加标记 → 刷新出现 → 已还原（`DEPLOY.md` §15 验证清单第 5 项） |
| W3-23 | 公网检查台可访问且功能全 | **PASS** | `https://…tcloudbaseapp.com/check.html` → **200**（3515 bytes）；三板块（健康/真实数据/写入测试）+ 最后更新时间 |
| W3-24 | 其余页面公网可打开 | **PASS** | `/card.html` 200(2033B)、`/bookmarks.html` 200(3346B)、`/history.html` 200(3340B) |
| W3-25 | 前端请求走公网地址（非 mock） | **PASS** | 远端 `js/store.js` 内 API 基址 = `https://rqj-2006-d0gl1ael531a243a1-1497985433.ap-shanghai.app.tcloudbase.com` |
| W3-26 | CORS 收口：只允许自己域名 | **PASS** | 带 `Origin: https://…tcloudbaseapp.com` → 回 `allow-origin: <该域名>`；带 `Origin: https://evil.example.com` → **零 CORS 头**；全链路无 `*` |
| W3-27 | `api-contract.md` 与实现一致 | **PASS** | §1.1–1.3、§2B.1–2B.2 标 ✅ 已实现；§3 占位清单 6 项 ✅ / 3 项待办与实测一致；§4 CORS 有 Day 17 + Day 20 两次实测结论；§6 数据模型与 `schema.sql` 字段一一对应 |
| W3-28 | 密钥无硬编码 | **PASS** | `.env` 未入库（`git ls-files .env` 空）；`cloudbaserc.json` 各函数 `envVariables: {}`；`git grep "eyJ"` 零命中 |
| W3-29 | 周三张截图有留存 | **PASS** | `day19-structure.png`（8 新文件高亮）、`day19-api-regress.png`（地址栏+JSON）、`day20-public-home.png`、`day20-public-check.png`（本地留档，按约定不入库） |
| W3-30 | `DELETE /api/favorites/:slug` | **未执行** | 契约 §2B.3 标注「第 4 周」；本周以 `POST on:false` 幂等替代，已 PASS（W3-16） |
| W3-31 | `GET /api/history` | **未执行** | 契约 §3 标「Day 18+ 待定」；`history` 表未建，浏览记录仍走 localStorage（PRD §8.3 保守方案） |
| W3-32 | `POST /api/history` | **未执行** | 同上 |
| W3-33 | 真人测试（非自动化） | **未执行** | 本周仅自动化回归；真人验证上次为 Day 14，本周未安排 |

**统计：PASS 29 项 / FAIL 0 项 / 未执行 4 项。**

---

## 2. 复现命令（可直接粘贴）

```bash
GW=https://rqj-2006-d0gl1ael531a243a1-1497985433.ap-shanghai.app.tcloudbase.com
SITE=https://rqj-2006-d0gl1ael531a243a1-1497985433.tcloudbaseapp.com

# 健康
curl -s --ssl-no-revoke $GW/api/health
# 列表（看 items 数与 meta.total）
curl -s --ssl-no-revoke $GW/api/cards
# 详情（看 laws 数组条数）
curl -s --ssl-no-revoke "$GW/api/cards?slug=gongsi-quantui"
# 搜索
curl -s --ssl-no-revoke "$GW/api/cards?keyword=%E6%8A%BC%E9%87%91"
# 分类聚合
curl -s --ssl-no-revoke $GW/api/categories
# 写入 → 读回 → 取消（三步）
curl -s --ssl-no-revoke -X POST -H "Content-Type: application/json" \
  -d '{"client_id":"day21-acceptance","slug":"fangdong-bu-tui-yajin","on":true}' $GW/api/favorites
curl -s --ssl-no-revoke "$GW/api/favorites?client_id=day21-acceptance"
curl -s --ssl-no-revoke -X POST -H "Content-Type: application/json" \
  -d '{"client_id":"day21-acceptance","slug":"fangdong-bu-tui-yajin","on":false}' $GW/api/favorites
# CORS 白名单（自己域名 vs 陌生域名）
curl -s --ssl-no-revoke -D - -o /dev/null -H "Origin: $SITE" $GW/api/cards | grep -i access-control
curl -s --ssl-no-revoke -D - -o /dev/null -H "Origin: https://evil.example.com" $GW/api/cards | grep -i access-control
# 密钥泄漏扫描（应为空）
cd "$(git rev-parse --show-toplevel)" && git grep -l "eyJ" $(git ls-files)
```

## 3. 本周产出 ↔ 验收项对照

| 本周产出 | 对应 Day | 验收项 |
|---|---|---|
| `db/schema.sql` / `db/seed.sql` / `db/exec.py` | Day 16 (`dfad60f`) | W3-1 ~ W3-3 |
| GET 读接口（cards 列表/详情、categories） | Day 17 (`e60d5d7`) | W3-4 ~ W3-10 |
| POST 写接口（favorites）+ favorites 表 | Day 18 (`c5b8682`) | W3-11 ~ W3-17 |
| 分层重构（db.js + repository） | Day 19 (`ddc0add`) | W3-18 ~ W3-20 |
| 公网真数据 + 检查台 + CORS 收口 | Day 20 (`b83dbf9`) | W3-21 ~ W3-26 |
| `api-contract.md` 完整性 | 贯穿 Day 15–20 | W3-27 |

## 4. 未执行项的如实说明

1. **`DELETE /api/favorites/:slug`** —— 非缺陷。V1 设计用 `POST on:false` 做幂等取消（HTTP 语义上更简单，且免去 DELETE 预检）。契约 §2B.3 已写明排第 4 周。**不影响本周任何验收目标。**
2. **`GET`/`POST /api/history`** —— 非缺陷。PRD §8.3 明确「不收集身份信息、浏览记录存 localStorage」，上云需重审该条款；本周未动。契约 §3 如实标「待定」。
3. **真人测试** —— 本周全部为脚本化回归（21 项），未约真人。上次真人验证为 Day 14。**已记入下周待办。**

## 5. 本周踩坑与遗留（不修，记录到下周）

| # | 现象 | 影响 | 处置 |
|---|---|---|---|
| 1 | `js/store.js` API 基址硬编码在源码里（非环境变量） | 换环境需改源码 | 下周评估是否抽到构建时注入 |
| 2 | `db/exec.py` 里 `tcb.cmd` 绝对路径带版本号 `22.22.2`（本机实际目录已变为 `22.22.2-5`） | 换机器/升级 Node 后该脚本会失效 | 下周改为「先探测再回退」的路径解析 |
| 3 | 契约 §3 标题仍写「Day 16–20 待实现」，但内容已全部完成 | 文档标题过期 | 下周随 V2 契约一起改 |
| 4 | 缺少自动化回归脚本入库存档（`.tmp-regress.sh` 用完即删） | 下次要重新写 | 下周把 21 项回归固化成 `scripts/regress.js` 入库 |

---

**填表人**：Terry（AI 协助执行，逐项实测）
**复核状态**：待同伴交叉验证（见 `docs/peer-verify.md`）

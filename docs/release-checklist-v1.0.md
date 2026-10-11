# 发布清单 · v1.0.0「法律小科普轻站」

> 发布时间：2026-10-11 22:15 ｜ 发布人：Terry + AI ｜ 环境：CloudBase 体验版 `rqj-2006-d0gl1ael531a243a1`（上海）
> 本文是 Day 26 的发布清单：**版本标记、发布前验证、发布步骤、发布后验证、备份方式**，全部按当天实际执行的命令与结果记录。

---

## 1. 版本标记

| 项 | 内容 |
|---|---|
| 版本号 | **v1.0.0**（首个正式发布版本） |
| 标记位置 | 首页 `index.html` 页脚 `<span class="ver-badge">v1.0.0</span> 正式发布 2026-10-11`（样式在 `css/global.css` 的 `.site-footer .ver` 段） |
| 怎么核对 | 公网首页「查看网页源代码」搜 `ver-badge`，或直接看页脚左侧的白色胶囊徽标 |
| 对应提交 | tag `v1.0.0` → 本次 Day 26 提交；tag `v0.9.0` → `8081183`（Day 25，回滚目标） |
| 为什么放页脚 | ① 对外可核对版本；② **回滚演练时它是「当前部署的是哪一版」的可视判据**——旧版没有这个徽标，一眼可辨 |

> 顺手修掉的陈旧文案：页脚原来写着「Day 8 主视图（mock 数据版）· 2026-09-22」，自 Day 11 起就不准了，本次一并替换。

## 2. 发布内容

- 新增：页脚 v1.0.0 版本徽标（`index.html` + `css/global.css`）
- 修改：页脚「本站为个人学习项目」一行，改为准确表述（内容核验日期 + 说明收藏数据仅存本地）
- 不含：任何后端/数据库改动（`functions/`、`db/` 本次零改动）

## 3. 发布前验证项（全部通过后才发布）

| # | 验证项 | 怎么算通过 | 实测 |
|---|---|---|---|
| 1 | 离线检查 Skill 20 项（密钥防线、输入校验防线、dist 一致性等） | `preflight.py` 全 PASS、退出码 0 | ✅ 20/20 |
| 2 | 根目录与 `dist/` 一致 | C16/C17 逐文件 md5 相同 | ✅ 一致 |
| 3 | 页面可打开 | `tcb hosting detail` Status = Online | ✅ Online |
| 4 | 后端健康 | `/api/health` 返回 `ok:true` | ✅ `{"ok":true,...}` |
| 5 | 改动范围 | `git status` 只有本次该改的文件 | ✅ 仅 2 个文件 |

## 4. 发布步骤（实际执行）

```bash
# ① 同步 dist（dist/ 是静态托管的发布产物目录，在 .gitignore 里，不进仓库）
cp index.html dist/index.html
cp css/global.css dist/css/global.css

# ② 发布前验证（20 项，全过才继续）
python .workbuddy/skills/verify-project/scripts/preflight.py

# ③ 发布（--safe：发布前自动备份，上传或校验失败自动回退；--verify：上传后核对远端与本地一致）
tcb hosting deploy ./dist -e rqj-2006-d0gl1ael531a243a1 --ignore .nojekyll --safe --verify
```

**⚠️ 为什么必须带 `--ignore .nojekyll`**：`.nojekyll` 是 GitHub Pages 专用文件（CloudBase 用不上），CLI 上传时会漏掉它，导致 `--verify` 一致性校验报 `missing=.nojekyll` 而**自动回滚**。本次发布第一次就因此失败（见 `docs/day26-rollback-drill.md`）——这个坑已写进回滚手册。

**关于 `--safe`**：它就是静态托管的「发布保险」——发布前先把线上现状备份，一旦上传失败或校验不过，自动回退到发布前状态。本次实测有效（第一次发布失败后公网未被破坏）。

## 5. 发布后验证

| # | 验证项 | 怎么算通过 | 实测 |
|---|---|---|---|
| 1 | 版本标记生效 | 公网 HTML 含 `ver-badge">v1.0.0` | ✅ |
| 2 | 页面完整 | `<title>法律小科普轻站 · 让生活里的小事 3 分钟读懂</title>` | ✅ |
| 3 | 内容指纹 | 公网 `index.html` 的 SHA-256 与本地 `dist/index.html` **逐字节一致**（`43712ce3c6b51c13…`） | ✅ 一致 |
| 4 | 后端健康 | `/api/health` → `ok:true` | ✅ |
| 5 | 公网检查 Skill 27 项 | `preflight.py --online` 全 PASS、退出码 0 | ✅ 27/27 |
| 6 | CDN 缓存 | 验证一律带 `Cache-Control: no-cache` + 随机参数绕缓存 | 已执行 |

> CDN 提示：部署后公网可能有几分钟缓存。**验证时不要只刷新浏览器**，用上面的 curl 命令（带 no-cache 头）才作数。

## 6. 代码与数据备份方式

**代码（三重）**
1. **Git tag**：`v1.0.0` 打在本次发布提交上 —— 回滚时 `git archive v1.0.0` 一条命令还原任意版本的全部静态文件
2. **远端 GitHub**：`main` 分支 + tag 推送到 `github.com/Terry-RQJ/week01-vibe-coding`
3. **发布产物**：`dist/`（本地）+ CloudBase 侧 `--safe` 发布前自动备份

**数据**
- **用户收藏**：只存在每个用户自己浏览器的 localStorage，**服务端不存**，因此不存在「发布搞丢用户数据」的风险；跨设备迁移走导出/导入 JSON
- **内容表**（`cards` / `categories`）：源头是仓库里的 `data/cards.js` 与文档，可随时重建；云端备份用
  `tcb db execute --sql "SELECT * FROM cards"` 导出 JSON 存档（发布前跑一次，存到本地不放仓库）
- **用户写入表**（`favorites`）：发布前同样 `SELECT * FROM favorites` 导出存档；注意软删除标记 `is_deleted` 也要一并导出
- ⚠️ 导出文件含数据，**不进仓库**（放 `.gitignore` 已覆盖的目录或仓库外）

## 7. 本次发布记录

| 时间 | 动作 | 结果 |
|---|---|---|
| 22:15:07 | 第 1 次发布（`--safe --verify`） | ❌ 11 秒后一致性校验失败（`missing=.nojekyll`），**自动回滚，公网未受影响** |
| 22:15:39 | 第 2 次发布（加 `--ignore .nojekyll`） | ✅ 9 秒成功，16 文件全部 `√` |
| 22:16:02 | 发布后验证 | ✅ 版本标记/标题/指纹/健康全过 |
| 22:16 前后 | 离线 20 项 + 公网 27 项 | ✅ 全过 |

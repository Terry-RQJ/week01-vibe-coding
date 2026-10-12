# Day 27 · 资源与到期说明（不含任何密钥）

> 采集时间：**2026-10-12 15:39（北京时间）**
> 采集方式：`tcb` CLI（版本 3.8.6）实跑命令，命令与原始输出见下方各节。
> **本文件不含、也不需要任何密钥/Token/连接串**——CLI 用的是本机已登录的会话（`~/.config/.cloudbase`，refreshToken 有效期至 2026-10-29）。
> 环境 ID `rqj-2006-d0gl1ael531a243a1` 只用于定位环境，它已公开出现在线上 URL 里，不是密钥。

---

## 0. 一句话结论

**额度非常充裕（资源点用掉 0.30%），但「到期」有两个时间点要盯：本计费周期 2026-10-30 结束（剩 18 天），环境本身 2027-03-30 到期（剩 169 天）。**

---

## 1. 环境与到期

| 项目 | 值 | 出处 |
|---|---|---|
| 环境 ID | `rqj-2006-d0gl1ael531a243a1` | `tcb env list` |
| 套餐 | **体验版**（`PackageName: 体验版`） | `tcb env list --json` |
| 环境状态 | `NORMAL` / `UsageStatus: normal` | `tcb env list --json` |
| 抵扣模式 | `credits`（资源点抵扣） | `tcb env list --json` |
| 创建（出账）时间 | **2026-09-29 15:58:58** | `tcb env list --json` |
| **到期时间** | **2027-03-30 23:59:59** | `tcb env list --json` 的 `ExpireTime` |
| 距今剩余 | **169 天** | 按 2026-10-12 计算 |
| 环境 QPS 配额 | 500 | `EnvQps.QpsQuota` |
| 区域 | ap-shanghai | `tcb env list` 提示行 |

命令（可重复执行复核）：

```bash
tcb env list
tcb env list --json          # 看 ExpireTime / PackageName / EnvDeductionMode
```

---

## 2. 资源点用量（本计费周期）

| 项目 | 值 |
|---|---|
| **当前计费周期** | **2026-09-29 ~ 2026-10-30**（剩 **18 天**） |
| 套餐内资源点 | **已用 8.92 / 共 3000.00** |
| 占比 | **0.30%** |
| 资源包用量 | 0.00 点 |
| 按量付费（超出部分） | **0.00 点**（没有产生任何额外费用） |

命令：

```bash
tcb env usage -e rqj-2006-d0gl1ael531a243a1
```

### 各模块明细（2026-09-29 ~ 2026-10-12）

| 模块 | 资源点 | 说明 |
|---|---|---|
| API 调用 | 5.69 | 占比最大项，来自检查台与联调 |
| 云函数 | 2.21 | 4 个函数的调用与运行 |
| HTTP 网关 | 1.01 | `/api/*` 网关转发 |
| 云存储 | 0.01 | 极小 |
| NoSQL / MySQL / 云托管 / 静态托管 / 认证 / AI / 工作流 / 其他 | 0 | 未使用或未计费 |
| **合计** | **8.92** | 全部走套餐内资源点 |

> 观察：静态托管（本站主要形态）**没有计资源点**。所以「多一个访客来看页面」对额度的实际压力主要来自**接口调用**，而不是页面浏览。

---

## 3. 资源清单（实际部署了什么）

| 资源 | 数量 | 明细 |
|---|---|---|
| 云函数 | 4 | `apiFavorites`、`apiCategories`、`apiCards`、`apiHealth`（均 Nodejs16.13，最近部署 2026-10-09 16:39） |
| 静态托管文件 | 23 | 站点 HTML/CSS/JS/图片 |
| PostgreSQL 数据库 | 1 | 库名 `postgres-ebc42q2s`，**占用 10 MB** |

命令：

```bash
tcb fn list -e rqj-2006-d0gl1ael531a243a1
tcb hosting list -e rqj-2006-d0gl1ael531a243a1
```

---

## 4. 数据资产现状（库内实际行数）

| 表 | 行数 | 说明 |
|---|---|---|
| `cards` | **6** | 情形卡片（核心内容） |
| `laws` | **11** | 法条（挂在卡片下） |
| `favorites` | **15** | 其中**有效 2 条、软删除 13 条**；11 条带备注 |
| 数据库总大小 | **10 MB** | `pg_size_pretty(pg_database_size())` |

```bash
tcb db execute -e rqj-2006-d0gl1ael531a243a1 --sql \
  "SELECT (SELECT COUNT(*) FROM cards) AS cards, (SELECT COUNT(*) FROM laws) AS laws, \
   (SELECT COUNT(*) FROM favorites WHERE is_deleted = false) AS fav_active, \
   (SELECT COUNT(*) FROM favorites WHERE is_deleted = true) AS fav_deleted"
```

> ⚠️ **一处值得知道的现状（不是 Bug，是测试残留）**：`favorites` 里 15 条有 13 条是软删除状态。
> 软删除是 Day 22 有意做的（删错能找回），但它意味着**「删除」不会真的减少数据量**。
> 若将来要清理，需要显式物理删除（`DELETE FROM favorites WHERE is_deleted = true`），**今天不做**，只记在这里。

---

## 5. 到期风险与应对

| 时间点 | 还有 | 会发生什么 | 现在要不要做 |
|---|---|---|---|
| **2026-10-30**（本计费周期结束） | **18 天** | 资源点按控制台规则结算/刷新；按量付费目前是 0，正常不会产生费用 | 到 10-30 后再跑一次 `tcb env usage` 核对即可 |
| **2027-03-30 23:59:59**（环境到期） | **169 天** | 体验版环境到期后**站点与接口都会不可用**（含公网链接） | 到期前需续期或换套餐；今天只需记下日期 |
| 登录态（本机 CLI） | refreshToken 至 **2026-10-29** | 到期后 CLI 需重新 `tcb login` | 到 10-29 前记得重新登录 |

**结论**：本周完全不用担心额度；真正要设提醒的是 **2027-03-30** 这个环境到期日。

---

## 6. 怎么把数据导出来（三层，按重要性）

### 6.1 代码 —— 已在 git 里（最完整的一层）

```bash
git log --oneline -3
git tag -l                 # 已有 v0.9.0、v1.0.0
git push                   # 远端 Terry-RQJ/week01-vibe-coding 就是异地备份
```

### 6.2 静态文件 —— 云端拷贝

```bash
tcb hosting download / ./hosting-backup --dir -e rqj-2006-d0gl1ael531a243a1
```

（`dist/` 目录本身就是发布源，git 里也有一份，三者可互为校验。）

### 6.3 数据库 —— 两种方式

**方式 A（推荐，控制台）**：腾讯云 CloudBase 控制台 → 该环境 → 数据库 → PostgreSQL → 数据导出 / 备份，按提示导出即可。**导出的文件里含用户备注，属于用户数据，不要提交进 git。**

**方式 B（CLI，已实测可用 ✅）** —— 一条 SQL 把三张表打成一份 JSON：

```bash
tcb db execute -e rqj-2006-d0gl1ael531a243a1 --json --sql \
"SELECT json_build_object('exported_at', now(), \
  'cards', (SELECT json_agg(c ORDER BY c.slug) FROM cards c), \
  'laws', (SELECT json_agg(l ORDER BY l.id) FROM laws l), \
  'favorites', (SELECT json_agg(f ORDER BY f.id) FROM favorites f))::text AS dump" \
> db-export.json
```

**实测结果（2026-10-12 15:39）**：导出包字段 `exported_at / cards / laws / favorites`，行数 `6 / 11 / 15`，
`exported_at = 2026-10-12T15:39:19+08:00`。导出成功，验证完**已删除本地临时文件**（含用户备注，不留在仓库里）。

⚠️ 两个坑（都实测踩过）：

1. **多语句一次执行是"假成功"** —— `tcb db execute` 的 SQL 里放多条 `;` 分隔的语句，只有最后一条真正生效且无副作用。所以导出必须写成**一条语句**（上面用的 `json_build_object` 就是为了塞进一条）。
2. **输出是套了两层信封的** —— `--json` 的结果在 `data.Rows[0]`，而它本身又是「一个 JSON 数组的字符串」，里面第 0 个元素才是真正的导出 JSON。取值要剥两到三层：

```python
import json
env  = json.loads(open('db-export.json', encoding='utf-8').read())
v    = env['data']['Rows'][0]
while not isinstance(v, dict):          # 逐层剥：str → list → str → dict
    v = json.loads(v) if isinstance(v, str) else v[0]
print(len(v['cards']), len(v['laws']), len(v['favorites']))
```

### 6.4 结构可重建（最后一道保险）

`db/schema.sql`（建表 + 索引 + 约束）与 `db/seed.sql`（种子数据）都在仓库里，
配合 `python db/exec.py schema / seed` 可在新环境一键重建结构与内容。

---

## 7. 复检清单（下次直接照抄执行）

```bash
# ① 环境与到期
tcb env list

# ② 资源点用量（看「已用 / 总量」和「按量付费」是否为 0）
tcb env usage -e rqj-2006-d0gl1ael531a243a1

# ③ 数据行数
tcb db execute -e rqj-2006-d0gl1ael531a243a1 --sql \
  "SELECT (SELECT COUNT(*) FROM cards) AS cards, (SELECT COUNT(*) FROM laws) AS laws, \
   (SELECT COUNT(*) FROM favorites) AS fav_total"

# ④ 公网可用性（发布后验证，见 docs/release-checklist-v1.0.md）
curl -s -o /dev/null -w "%{http_code}\n" "https://rqj-2006-d0gl1ael531a243a1-1497985433.tcloudbaseapp.com/"
curl -s "https://rqj-2006-d0gl1ael531a243a1-1497985433.ap-shanghai.app.tcloudbase.com/api/health"
```

---

## 8. 密钥声明

- 本文档**不包含**任何 AppSecret / API Key / 数据库连接串 / GitHub Token。
- 云函数读取数据库凭据走的是环境内置能力（`functions/api/favorites/db.js`），凭据不在仓库与本文档中。
- CLI 登录态保存在本机 `~/.config/.cloudbase`，与本文档无关；若需重新登录，执行 `tcb login`（会走浏览器授权，不需要把密钥写进任何文件）。

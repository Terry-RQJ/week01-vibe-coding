# Day 30 · 线上验证记录

> 2026-10-16 ｜ 对象：`rqj-2006-d0gl1ael531a243a1` 环境（公网已部署）
> 原始逐字输出：**`docs/day30-verify-online.txt`**（含全部命令输出，未做修饰）

---

## 0. 验证结论

| # | 验证 | 项数 | 结果 |
|---|---|---|---|
| 1 | 云端真库数据校验（`db/exec.py verify`） | 6 组 select + 2 项约束 | **ALL PASS** |
| 2 | 离线发布前检查（`preflight.py`） | 21 | **21 / 21** |
| 3 | 公网发布前检查（`preflight.py --online`） | 28 | **28 / 28** |
| 4 | 公网浏览器 e2e（`docs/day30-laws-e2e.js`） | 19 | **19 / 19** |
| 5 | 搜索覆盖度体检（142 个真实搜索词） | 142 | **142 有结果 / 0 无结果** |

---

## 1. 云端真库数据校验

`python db/exec.py seed` → `python db/exec.py verify`：

- `cards` = **121** 行、`laws` = **259** 行
- `GROUP BY category_id`（= `/api/categories` 的 count）：
  `consume 20 / labor 20 / loan 20 / marriage 20 / neighbor 21 / traffic 20`
- `JOIN` 关联检查：每张卡 1~4 条法条，无孤儿行
- 约束拦截：插不存在的 `card_slug` → 被外键拦下（PASS）；`status='bogus'` → 被 CHECK 拦下（PASS）

导入用的 `seed.sql` 是 `TRUNCATE ... RESTART IDENTITY CASCADE` + 分批 INSERT，可重复执行且结果一致。

---

## 2. 公网接口检查（`preflight.py --online`，28/28）

公网基址：`https://rqj-2006-d0gl1ael531a243a1-1497985433.ap-shanghai.app.tcloudbase.com`

重点项：

- `GET /api/health` → 200 + `ok:true`
- `GET /api/cards` → 200 + `ok:true`（读接口可用，首条即新内容）
- CORS：陌生域名（`evil.example.com`）**不回任何 CORS 头**；白名单域名（同环境静态托管）**精确单值回显**，无 `*` 通配
- `PATCH` 异常输入回归：`body=null` → 400（修复前 500）、`id` 变形写法（`1e2`/`0x10`/`1.5`/`-1`/`0`/`01`）→ 400
- 响应 message 无英文错误原文泄露

---

## 3. 浏览器 e2e（19/19）

无头 Edge + CDP，真实访问公网域名（含 CloudBase 免费版中间页的真实点击过站）。

| 组 | 覆盖 | 结果 |
|---|---|---|
| 1 | 首页导航有「法条速查」入口 | PASS |
| 2 | 法条速查页首屏：158 条条目 / 17 个法律名 chip / 统计行 / 官方外链 / 「出自情形」/ 默认「全部」 | 7 PASS |
| 3 | 搜法言法语「竞业限制」→ 命中 2 条 + 命中词高亮 7 处 | 2 PASS |
| 4 | 搜口语词「押金」（**条文原文里根本没有这个词**）→ 返回 4 条 + 带出相关卡片 | 2 PASS |
| 5 | 点「民法典」chip 筛选 → 85 条全为民法典 / chip 高亮 / URL 同步 `?law=…` | 4 PASS |
| 6 | 深链 `laws.html?law=民法典` 进入即已筛状态 | 1 PASS |
| 7 | 点「出自情形」→ 跳 `card.html?slug=duzhai-wuxiao` 且含「相关法条」 | 1 PASS |
| 8 | **断网回落**（封 `*app.tcloudbase.com*`）→ 仍渲染 158 条 / 17 chip | 1 PASS |

截图：`day30-laws-01-list.png` ~ `day30-laws-06-offline.png`（6 张，均视口截图）。

---

## 4. 搜索覆盖度体检

用 **142 个「普通人真会搜的词」**打线上 `/api/cards`，分 8 组：劳动 / 消费 / 借贷 / 婚姻家庭 /
交通 / 邻里名誉 六类高频词，加上「长句提问」（如「公司不给加班费怎么办」）与「法律名直搜」（如「民法典」）：

```
总词数 142   OK 142   无结果 0   有卡无法条 0

★ 彻底搜不出来（用户会认为功能坏了）:
（空）

▲ 能搜到情形、但法条区是空的:
（空）
```

对比 Day 29 结营时的 `OK 100 / 无结果 42（29.6%）`——**用户最初抱怨的「搜不出来」已清零**。

---

## 5. 复现命令

```bash
cd "C:/Users/Administrator/Desktop/Vibe Coding"

# 1) 生成内容（唯一源 → seed.sql + cards.js，含自检）
python db/seed-content.py

# 2) 入库 + 真库校验
python db/exec.py seed
python db/exec.py verify

# 3) 同步静态托管
cp -f data/cards.js dist/data/ && cp -f js/*.js dist/js/ && cp -f css/*.css dist/css/ && cp -f *.html dist/
tcb hosting deploy ./dist -e rqj-2006-d0gl1ael531a243a1 --yes

# 4) 发布前检查（离线 / 公网）
python .workbuddy/skills/verify-project/scripts/preflight.py
python .workbuddy/skills/verify-project/scripts/preflight.py --online

# 5) 浏览器端到端（需本机 Edge）
node docs/day30-laws-e2e.js

# 6) 搜索覆盖度回归（结尾必须是「无结果 0」）
python docs/day30-coverage-probe.py
```

> 注：`seed-content.py` 的生成路径为 `db/seed.sql` + `data/cards.js`；
> 上表第 3 步的 `cp` 需在生成之后执行，否则 dist 会落后于源（发布前检查的 C16/C17 会拦截这种不一致）。

# API 接口契约 · 「法律小科普轻站」

> Day 15 占位文档。第 3 周建表与写接口的**唯一依据**，今天只登记形状，不连数据库。
>
> 依据：`PRD.md §8`、`TECH_DESIGN.md v3.0`（已升级到 v4.0，待 §8.3 重审）、`index.html` / `card.html` / `bookmarks.html` / `history.html` 当前真实渲染所需的全部数据。

---

## 0. 通用约定

| 项 | 约定 |
|---|---|
| Base URL（V1 mock） | `https://<envId>.ap-shanghai.tcb-api.tencentcloudapi.com/api`（CloudBase HTTP 触发，云函数前缀 `/api`） |
| 内容类型 | `application/json; charset=utf-8` |
| 鉴权（V1） | 无（V1 只读公开内容） |
| 错误返回 | `{ "error": { "code": "STRING", "message": "USER_READABLE_CN" } }`，HTTP 状态码同步语义（400/404/500） |
| 字段命名 | 全 camelCase，时间统一 ISO 8601（`2026-09-29T14:30:00.000Z`） |
| 分页 | V1 不分页（卡片总数 6–12 张，全量返回） |
| 搜索/筛选 | 走 query 参数；空 keyword 等同于全量 |

---

## 1. 必上：内容侧接口（卡片与分类）

> 第 2 周的 `data/cards.js` 是静态常量；改 CloudBase 后这部分要走 API。

### 1.1 `GET /api/cards`

**用途**：首页卡片网格（替代 `Store.listCards()`）。

**Query 参数**：

| Name | Type | Required | 说明 |
|---|---|---|---|
| `category` | string | 否 | 分类 id（`labor` / `consume` / `loan` / `marriage` / `traffic` / `neighbor`），不传 = 全量 |
| `keyword` | string | 否 | 关键词，匹配范围：标题 / 摘要 / 情景 / 标签 / 应对步骤 / 法条名称+原文。空字符串 = 全量 |

**响应 200**：

```json
{
  "data": [
    {
      "slug": "gongsi-quantui",
      "title": "公司劝退，但只给 N",
      "summary": "公司谈辞退时只提 N，没有 +1，该不该签？",
      "category": "劳动类",
      "categoryId": "labor",
      "tags": ["辞退", "经济补偿"],
      "published_at": "2026-09-21",
      "last_verified_at": "2026-09-21"
    }
  ],
  "meta": { "total": 6 }
}
```

**错误 400**：`category` / `keyword` 类型非法 → `{ "error": { "code": "INVALID_PARAM", "message": "category 不在允许范围" } }`

### 1.2 `GET /api/cards/:slug`

**用途**：详情页（替代 `Store.getCard()`）。

**Path 参数**：`slug`（string，required）

**响应 200**：

```json
{
  "data": {
    "slug": "gongsi-quantui",
    "title": "公司劝退，但只给 N",
    "summary": "公司谈辞退时只提 N，没有 +1，该不该签？",
    "category": "劳动类",
    "categoryId": "labor",
    "scenario": "在公司做了 3 年，最近 HR 找你谈……",
    "solution_steps": [
      "先确认谈话性质：协商解除 vs 单方辞退",
      "如果是协商解除，N 是底线，+1 是谈判筹码"
    ],
    "laws": [
      { "name": "劳动合同法 第四十七条", "text": "经济补偿按劳动者在本单位工作的年限……", "source_url": "https://..." }
    ],
    "published_at": "2026-09-21",
    "last_verified_at": "2026-09-21",
    "author_type": "AI 起草",
    "reviewed_by": "执业律师 张某某"
  }
}
```

**错误 404**：`slug` 不存在 → `{ "error": { "code": "CARD_NOT_FOUND", "message": "找不到这个情形" } }`

### 1.3 `GET /api/categories`

**用途**：首页分类筛选 chip（替代 `Store.listCategories()`）。

**响应 200**：

```json
{
  "data": [
    { "id": "labor",    "name": "劳动类",     "count": 2 },
    { "id": "consume",  "name": "消费类",     "count": 1 },
    { "id": "loan",     "name": "借贷类",     "count": 1 },
    { "id": "marriage", "name": "婚姻家庭类", "count": 1 },
    { "id": "traffic",  "name": "交通类",     "count": 1 },
    { "id": "neighbor", "name": "邻里 / 名誉类", "count": 0 }
  ]
}
```

### 1.4 `GET /api/health`

**用途**：部署冒烟测试（Day 15 第一目标）。

**响应 200**：

```json
{
  "ok": true,
  "service": "law-mini-site",
  "version": "v1",
  "time": "2026-09-29T14:30:00.000Z"
}
```

**错误**：本接口不允许返回非 200，异常一律 500（不要吞错）。

---

## 2. 可选：用户数据接口（收藏 + 浏览记录）

> ⚠️ **Day 5 定稿 §8.3 明确「不上云」**。今天路线由 A 改为 B 后，§8.3 需要重审；Day 22–28 V2 计划里再决定要不要保留 localStorage。

### 2A 方案（保守 · 维持 §8.3）

不开放任何接口，收藏/浏览继续走 localStorage。**今天不实现**。

### 2B 方案（升级 · §8.3 重审通过后）

#### 2B.1 `GET /api/favorites`

**用途**：收藏页（替代 `Store.getCardsBySlugs()` + localStorage）。

**Query 参数**：无（V1 全量返回当前用户全部收藏）

**响应 200**：

```json
{
  "data": [
    { "slug": "gongsi-quantui", "favorited_at": "2026-09-28T11:00:00.000Z" },
    { "slug": "guoqi-shipin",   "favorited_at": "2026-09-28T13:20:00.000Z" }
  ]
}
```

#### 2B.2 `POST /api/favorites`

**用途**：收藏 / 取消收藏（替代 `Store.toggleBookmark()`）。

**Body**：

```json
{ "slug": "gongsi-quantui", "on": true }
```

**响应 200**：`{ "data": { "slug": "gongsi-quantui", "on": true } }`

**错误 404**：slug 不存在 → `{ "error": { "code": "CARD_NOT_FOUND", "message": "..." } }`

#### 2B.3 `DELETE /api/favorites/:slug`

**用途**：取消收藏（与 POST 等价，但 RESTful）。

**响应 200**：`{ "data": { "slug": "...", "on": false } }`

#### 2B.4 `GET /api/history`

**用途**：浏览记录页（替代 `Store.getHistory()`）。

**Query 参数**：`limit`（int，可选，默认 50，上限 50）

**响应 200**：

```json
{
  "data": [
    { "slug": "guoqi-shipin",       "viewed_at": "2026-09-29T11:00:00.000Z" },
    { "slug": "dianche-pengzhuang", "viewed_at": "2026-09-29T10:30:00.000Z" }
  ]
}
```

#### 2B.5 `POST /api/history`

**用途**：浏览详情时自动记录（替代 `Store.addHistory()`）。

**Body**：`{ "slug": "..." }`

**响应 200**：`{ "data": { "ok": true } }`

---

## 3. 占位清单（Day 16–20 待实现）

| 接口 | 状态 | 依赖 |
|---|---|---|
| `GET /api/health` | Day 15 部署 | 无 |
| `GET /api/cards` | Day 16–17 | CloudBase 数据库 + 卡片表 `cards` |
| `GET /api/cards/:slug` | Day 17 | 同上 |
| `GET /api/categories` | Day 17 | 同上 |
| `GET /api/favorites` | Day 18（仅 §8.3 改后） | 收藏表 `favorites` |
| `POST /api/favorites` | Day 18 | 同上 |
| `DELETE /api/favorites/:slug` | Day 18 | 同上 |
| `GET /api/history` | Day 18 | 历史表 `history` |
| `POST /api/history` | Day 18 | 同上 |

---

## 4. 跨域（CORS）

Day 15–17 不配（前端走 CloudBase 静态托管，与云函数同根域；同根域直接走 cookie/header 即可）。Day 19 前端域名迁移（如切到 terry-rqj.github.io）时再开 CORS 白名单。

---

## 5. 变更日志

- 2026-09-29 · Day 15：路线 A→B 重审后新增本文档；§1 内容接口上线；§2 用户数据两套方案待勾选。
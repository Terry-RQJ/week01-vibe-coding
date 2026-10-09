# Day 24 · 修复一个真实 Bug：四步全证据（复现 → 定位 → 修复 → 验证）

> 日期：2026-10-09 ｜ 对象：`functions/api/favorites/index.js` ｜ 触发方式：刁钻输入测试（body 传 `null`）

---

## 现象（一句话）

给 `PATCH /api/favorites?id=` 传一个合法 JSON 但**不是对象**的 body（如 `null`），接口返回
**HTTP 500**「服务器开小差了」——这是服务端错，但根因其实是**输入校验缺失**，应该 400。

---

## ① 复现

**复现步骤**（本地与线上同样复现）：

```bash
# 合法 JSON、但不是对象 → 修复前 500
curl -sv -X PATCH "https://<envId>.api.tcloudbasegateway.com/api/favorites?id=26" \
  -H "Content-Type: application/json" \
  -d 'null'
```

**报错原文**（服务端日志，修复前真实记录，记录时间 2026-10-09 16:37）：

```
[apiFavorites] action=in  method=PATCH path=/api/favorites
[apiFavorites] action=error  message="Cannot convert undefined or null to object"
  at handlePatch (/var/user/index.js:153:37)

→ TypeError 未带 status，被 catch 兜底成 HTTP 500
```

**HTTP 响应原文**（修复前）：

```
HTTP/1.1 500 Internal Server Error
content-type: application/json; charset=utf-8

{"ok":false,"error":{"code":"INTERNAL","kind":"server","message":"服务器开小差了，稍后再试"}}
```

**已尝试动作**（复现阶段就做了，缩小范围）：

- 换 id：0 / -1 / 99999999 仍是 500 → 与 id 无关
- 换方法：DELETE 同样 body:null → 也是 500 → 与具体接口无关，是 body 解析层
- 本地直调 main()：同样复现 → 排除网关因素
- 传合法对象 `{note:"x"}`：正常 200 → 确认问题只出在「非对象 body」

**证据截图**：`day24-shot-bug.png`（复现步骤 + 服务端日志原文 + 500 响应原文 + 已尝试动作 + 修复后 400 对照）

---

## ② 定位：原因排序 → 每个原因的验证方法

按可能性从高到低排四个候选原因，逐一验证：

| # | 候选原因 | 验证方法 | 结果 |
|---|---|---|---|
| 1 | **`parseBody` 解出 `null` 后，`Object.keys(null)` 抛 TypeError** | 读 `index.js:153` —— `Object.keys(body)`；Node 里 `Object.keys(null)` 正是报 `Cannot convert undefined or null to object`；日志行号 153:37 与之吻合 | ✅ **真因**。`parseBody` 只挡了「非法 JSON」，没挡「合法 JSON 但非对象」（`null`/`[]`/`123`/`"x"` 都能穿过） |
| 2 | 数据库拒绝 null body | 看日志：异常抛在 `handlePatch` 第 153 行（入口校验层），**还没进 SQL** | ✗ 排除——进数据库之前就抛了 |
| 3 | 网关把请求变形 | 本地直调 `main({body:'null'},{})` 同样 500，绕开网关 | ✗ 排除——与网关无关 |
| 4 | Day 23 的 errors.js 映射把 400 误判成 500 | TypeError 本来就没带 status，`toErrorResponse` 兜底 500 是**正确行为**；错在上游缺校验 | ✗ 排除——映射层无 bug，但暴露了入口缺校验 |

**顺藤摸瓜发现另外两个同类 Bug**（同一轮刁钻输入测试挖出）：

- **Bug 2**：`parseId` 用 `Number(raw)` 判断 id —— `Number('1e2')===100`、`Number('+1')===1`、`Number('0x10')===16`、`Number('1.5')` 非整数但 `Number.isInteger(Number('1e2'))` 为真 → 这些**不该算合法 id 的写法被静默放行**，拿着变形 id 去查库。
- **Bug 3**：`note` 长度用 `String.length` 校验 —— JS 字符串是 UTF-16 码元，emoji 算 2；而 PostgreSQL `VARCHAR(200)` 按**字符（码点）**计。101 个 emoji（`String.length`=202）会被前端/后端**误拒**，但库里其实装得下 200 个 emoji。

---

## ③ 修复（三处，全在 `functions/api/favorites/index.js`）

**Bug 1 · parseBody 挡非对象**：

```javascript
// 改前：只挡非法 JSON，null/[]/123/"x" 全部穿过 → Object.keys(null) 500
try { parsed = JSON.parse((event && event.body) || '{}'); } catch (e) { …400… }

// 改后：加一层「必须是普通对象」
if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
  return { error: json(400, { ok:false, error:{ code:'INVALID_BODY', kind:'input',
    message:'请求体应该是一个 JSON 对象，例如 {"note":"..."}' } }) };
}
```

**Bug 2 · parseId 白名单正则**：

```javascript
// 改前：Number() 过于宽容（'1e2'→100、'+1'→1、'0x10'→16）
const id = Number(raw); if (!Number.isInteger(id) || id <= 0) …

// 改后：只接受正整数的十进制写法
const s = String(raw).trim();
if (!/^[1-9][0-9]{0,15}$/.test(s)) {
  return { error: json(400, { …, message:'id 格式不对：应为正整数（如 31），不要用 1e2、+1、0x10 这类写法' }) };
}
```

**Bug 3 · note 长度按码点计**：

```javascript
// 改前：String.length 按 UTF-16 码元（emoji 算 2）→ 101 个 emoji 被误拒
if (body.note.length > 200) …

// 改后：Array.from 按码点数，与 PostgreSQL VARCHAR(200) 对齐
const noteLen = Array.from(body.note).length;
if (noteLen > 200) {
  return json(400, { …, message:'备注太长（当前 ' + noteLen + ' 字，上限 200 字）' });
}
```

**配套前端改动**：`check.html` 的 `edit-note` maxlength 200→400（码元口径下 emoji 算 2，400 码元 ≈ 200 emoji），把最终判断权交给后端统一按码点校验（注释已写明）。

---

## ④ 验证留证

**回归清单**：`docs/day24-regression.js`（29 项，本地跑）——覆盖 parseBody 5 种非对象、parseId 7 种宽容写法、note 长度码点边界、合法链路 200、三类错误兜底。

- 本地：**29/29 通过**（含 1 项预期修正：本地无 Key 时合法对象也是 500 `DB_NOT_CONFIGURED`，属正确兜底）
- 线上（部署后 `.tmp-verify24.py`）：**25/25 通过**：
  - body 5 种非对象（`null`/`[]`/`123`/`"x"`/`true`）→ 全部 400 中文提示（修复前 `null` 是 500）
  - id 7 种宽容写法（`1e2`/`+1`/`0x10`/`1.5`/`-1`/`0`/`01`）→ 全部 400
  - note 码点边界：200 emoji → **200 通过**（修复前 101 个就拒）、201 emoji → 400、200 汉字 → 200、201 汉字 → 400
  - 核心链路：读 → 收藏（200）→ 改备注（200）→ 删除（200）→ GET 确认已消失
  - 回归：health / cards / categories 全 200

**证据截图**：

| 截图 | 内容 |
|---|---|
| `day24-shot-bug.png` | 复现步骤 + 服务端日志原文（`Cannot convert undefined or null to object` + 行号）+ 修复前 HTTP 500 响应原文 + 已尝试动作四条 + 修复后同请求 400 对照（标注「记录时间 2026-10-09 16:37（修复前）」） |
| `day24-shot-fixed.png` | 检查台真实操作核心链路：地址栏 `127.0.0.1:8000/check.html` + 删除 #34 → HTTP 200 完整 JSON（`deleted:true, soft:true`）+ 列表空（GET 确认已消失）+ 顶部「写入 200 → 修改 200 → 删除 200」说明条 |

---

## 顺手记录（不做，按任务要求只记不修）

- cards / categories 两个函数的 parseBody 同样只挡非法 JSON 不挡非对象（与 favorites 修复前同款隐患）——Day 24 只修 favorites（今日主任务对象），其余记录在案待后续统一。

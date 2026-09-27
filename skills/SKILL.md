---
name: legal-site-interaction
description: 「法律小科普轻站」前端交互开发规则包：把 Day 7–11 已确认的约束固化为检查单，用于给站点新增任何前端交互（筛选、收藏、搜索、展开收起等）
when_to_use: 给本站新增或修改任何用户可点击/可操作的交互行为时；改完必须跑完「验证清单」才能提交
---

# Skill：legal-site-interaction（法律小科普轻站 · 前端交互开发）

## 适用范围

给本站新增一个交互（筛选 / 收藏 / 搜索 / 展开收起 / 表单反馈……）时，按本文件执行。
**今日边界**：一次只做一个交互；不接后端；不改变整体布局。

## 一、结构约束（改哪些文件、数据怎么走）

1. **数据只走 `js/store.js`**：页面代码不直接读 `window.LAW_CARDS`。
   Store 是唯一数据访问层（TECH_DESIGN v3.0 §7），新查询 = 给 Store 加一个方法。
   延迟统一用现有 `fakeFetch`（600ms），让 loading 态是真实路径。
2. **渲染只走 `js/ui.js`**：DOM 拼接必须过 `esc()` 转义（防 XSS，TECH_DESIGN §9）。
3. **链接一律相对路径**（GitHub Pages 子路径 `/week01-vibe-coding/`，AGENTS.md）。
4. **样式进 `css/global.css`，颜色用 `css/tokens.css` 变量**，不硬编码新色值。

## 二、交互约束（Day 11 确认的状态机模式）

1. **可点击元素用原生 `<button type="button">`**（键盘 Enter/空格免费拿到）。
2. **状态机三态起步**：`空闲 → 处理中(禁用防连点) → 成功/失败`。
   处理中：`disabled` + `aria-busy`；失败：**还原到点击前状态**，不许悄悄吞错。
3. **开关型交互用 `aria-pressed`** 标记（收藏、筛选 chip 都适用）。
4. **反馈就发生在操作点**：按钮自身的文字/样式变化 > 远处提示；
   另加全局 toast（`role="status"` + `aria-live="polite"`）兜底。
5. **事件用委托**（容器上监听一次），渲染换内容不用重绑。
6. **防连点**：处理期间重复点击必须无副作用。

## 三、验证清单（跑完才能提交）

| # | 检查 | 方法 |
|---|---|---|
| 1 | JS 语法 | `node --check js/store.js && node --check js/ui.js` |
| 2 | 服务输出新代码 | `curl -s localhost:8000/` grep 新增关键字 |
| 3 | 交互三态实测 | 有结果 / 无结果（或失败）/ 清空恢复，各留截图 |
| 4 | 移动端 375px | headless 截图，无横向溢出 |
| 5 | 可访问性（加练） | Tab 键能看到焦点环（`:focus-visible`）；`aria-pressed` 随状态同步；反馈有 `aria-live` |
| 6 | 提交格式 | 标题「Day N｜一句话」，正文两行「改了什么 / 加了什么」 |

## 四、调用记录

每次真实使用本 Skill，在 `skills/CALL_LOG.md` 追加一行：
`日期 | 任务 | 用到的检查项 | 三态测试结果 | 提交哈希`

## 五、本站已确认的视觉红线（速查）

- 触控目标 ≥ 44px（`--tap-min`）；正文对比度 ≥ 4.5:1（WCAG AA）。
- 竹林主题：主色 `--bamboo-dark #2F5238`、点缀 `--color-gold-warm #D4A24C`；不添加渐变背景、随机装饰。
- CSS 优先级坑：分类 chip 的颜色规则必须带 `.category-list` 前缀（0,3,0），否则被基础规则压掉（Day 8 教训）。
- 熊猫图必须保持黑白原样，不加任何 filter（Day 9 绿脸教训）。

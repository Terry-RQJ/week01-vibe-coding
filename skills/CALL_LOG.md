# Skill 调用记录（legal-site-interaction）

格式：`日期 | 任务 | 用到的检查项 | 三态测试结果 | 提交哈希`

---

- 2026-09-27 | Day 12 分类筛选交互 | 结构约束 §一（Store 加查询、esc 转义、tokens 变量）；交互约束 §二（原生 button、aria-pressed、事件委托、无后端）；验证清单 §三.1–3（node --check、curl 输出、三态实测）、§三.4（375px 移动端）、§三.5（focus-visible + aria-live） | 有结果 ✅（劳动类筛出 1 张 + chip 变深绿实底）/ 无结果 ✅（临时 draft 卡触发空态，测后已还原数据）/ 清空恢复 ✅（再点同 chip 恢复 6 张） | 见 Day 12 提交
- 2026-09-27 | Day 13 关键词搜索 + 法条解析筛选 | 结构约束 §一（Store.searchCards 唯一数据层、结果行 esc 转义、无新增硬编码色值）；交互约束 §二（原生 input + Enter 直搜、250ms 防抖、过期响应丢弃 loadSeq、反馈在结果行 aria-live）；验证清单 §三.1–5 全项 | 有结果 ✅（搜「押金」1 张；搜「劳动合同法」「诉讼时效」经法条名称/原文各命中 1 张；劳动类+「补偿」叠加 1 张）/ 无结果 ✅（搜「飞船」、劳动类+「押金」均显示「没有找到相关内容」）/ 清空恢复 ✅（清空搜索框恢复 6 张，chip 状态保留独立生效） | 见 Day 13 提交
- 2026-09-28 | Day 13 三视图（详情/收藏/浏览记录）+ 四态 | 结构约束 §一（Store 唯一数据层；卡片标题变 `<a>` 跳详情；书签/历史持久化到 localStorage）；交互约束 §二（原生 button + aria-pressed；面包屑 aria-current；详情页进页自动 addHistory；收藏/历史共用 window.UI 渲染层避免四态文案走样）；验证清单 §三.1–5 全项 | 详情 4 态 ✅（正常渲染 3 条法条 / 无 slug 空 / loading / error 重试成功）/ 收藏 4 态 ✅（seed=1 后展示 2 张 / 无收藏空态提示去首页 ☆ / loading / error）/ 历史 4 态 ✅（seed=1 后展示 2 条倒序+时间胶囊 / 无历史空态提示去首页 / loading / error）/ 视图切换 ✅（首页↔详情↔收藏↔历史四向可达；aria-current 高亮当前位置；浏览器后退可用）/ 移动端 375px ✅（首页/详情 scrollW=375 零溢出） | 本次提交
- 2026-10-03 | Day 20 检查台 check.html（新页面 + 写入测试交互） | 结构约束 §一（复用 tokens 变量、相对路径、esc() 转义、无新增硬编码色值）；交互约束 §二（原生 button、三态禁用 + aria-busy 防连点、aria-live 状态播报）；验证清单 §三（node --check、本地服务输出新代码、写入三态实测、375px scrollWidth=375 零溢出） | 三态测试：收藏 200 ✅ / 重复 409 ALREADY_FAVORITED ✅ / 取消幂等 removed:1 → 空列表 ✅ | 见 Day 20 提交

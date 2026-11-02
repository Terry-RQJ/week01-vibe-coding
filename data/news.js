/* data/news.js — 法律热点新闻的本地回落数据（Day 37 新增）
 *
 * 与 data/cards.js 同一策略：云函数 /api/news 优先；接口不可用时页面回落到本文件，
 * 站点不会因 API 挂掉而空白。
 *
 * 维护方式：只放「已确认上线」的条目（与库里 status='published' 一致），
 * 由 db/news-sync.py 从云端导出生成；候选条目绝不进这里（访客不可见）。
 * 字段与 /api/news 响应一致：newsDate / title / summary / sourceName / sourceUrl / relatedCardSlug
 */
window.LAW_NEWS = [];

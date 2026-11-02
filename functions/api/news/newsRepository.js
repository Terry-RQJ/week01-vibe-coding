/**
 * newsRepository.js — news 表的全部 SQL（Day 37 新增）
 *
 * 表结构（db/schema.sql Day 37 追加）：
 *   status 三态：candidate（AI 抓的候选，接口不返回）
 *               / published（人工确认上线，接口返回）
 *               / offline（下线，接口不返回）
 * 只有 SELECT —— 写入走 db/exec.py（本地维护流程），云函数保持只读角色。
 */
'use strict';

const { execPg } = require('./db');

/** 线上前端列表：已发布的新闻，按日期倒序（同日按 id 倒序保稳定） */
function listPublished(limit) {
  const sql = `
    SELECT id, news_date AS "newsDate", title, summary,
           source_name AS "sourceName", source_url AS "sourceUrl",
           related_card_slug AS "relatedCardSlug",
           to_char(published_at, 'YYYY-MM-DD') AS "publishedAt"
    FROM news
    WHERE status = 'published'
    ORDER BY news_date DESC, id DESC
    LIMIT $1`;
  return execPg(sql, [limit]);
}

/** 本地维护页（admin-news.html）用：列出候选，供人工确认 */
function listCandidates(limit) {
  const sql = `
    SELECT id, news_date AS "newsDate", title, summary,
           source_name AS "sourceName", source_url AS "sourceUrl",
           related_card_slug AS "relatedCardSlug", status
    FROM news
    WHERE status = 'candidate'
    ORDER BY news_date DESC, id DESC
    LIMIT $1`;
  return execPg(sql, [limit]);
}

module.exports = { listPublished, listCandidates };

/**
 * newsRepository.js — news / news_runs 表的全部 SQL（Day 37 建立，Day 44 扩自动化）
 *
 * status 三态：candidate（抓到的候选）/ published（上线，接口返回）/ offline（下线）
 * Day 44 起默认自动上线（AUTO_PUBLISH=true），仍保留 candidate 供「降级人工确认」用。
 * 云函数始终只读 —— 写入走 db/daily-news.js（每日流水线）。
 */
'use strict';

const { execPg } = require('./db');

/** 线上前端列表：已发布新闻 + 解读，按日期倒序（同日 id 倒序保稳定） */
function listPublished(limit) {
  const sql = `
    SELECT id, news_date AS "newsDate", title, summary, takeaway,
           source_name AS "sourceName", source_url AS "sourceUrl",
           related_card_slug AS "relatedCardSlug",
           to_char(published_at, 'YYYY-MM-DD') AS "publishedAt"
    FROM news
    WHERE status = 'published'
    ORDER BY news_date DESC, id DESC
    LIMIT $1`;
  return execPg(sql, [limit]);
}

/** 本地维护页用：列出候选 */
function listCandidates(limit) {
  const sql = `
    SELECT id, news_date AS "newsDate", title, summary, takeaway,
           source_name AS "sourceName", source_url AS "sourceUrl",
           related_card_slug AS "relatedCardSlug", status
    FROM news
    WHERE status = 'candidate'
    ORDER BY news_date DESC, id DESC
    LIMIT $1`;
  return execPg(sql, [limit]);
}

/** Day 44：抓取台账 —— 最近一次成功抓取的日期与条数（前端「今日已更新」徽标要用） */
function latestRun() {
  const sql = `
    SELECT to_char(run_date, 'YYYY-MM-DD') AS "runDate", source, found, added, status, note,
           to_char(created_at AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI') AS "ranAt"
    FROM news_runs
    ORDER BY run_date DESC, id DESC
    LIMIT 1`;
  return execPg(sql, []);
}

module.exports = { listPublished, listCandidates, latestRun };

/**
 * errors.js — 全站错误提示统一模块（Day 23）
 *
 * ⚠️ 本文件是「母版」：CloudBase 部署时按函数 dir 独立打包，跨目录 require 会失败，
 *    所以每个函数目录内都有一份同名副本（cards/ categories/ favorites/ health/）。
 *    **改动时请改本文件，然后同步复制到四个函数目录**：
 *      for d in cards categories favorites health; do
 *        cp functions/api/common/errors.js functions/api/$d/errors.js; done
 *    （与 cardsRepository.js / db.js 的分层副本约定一致）
 *
 * 为什么要有这个文件：
 *    Day 22 之前，几个云函数各写各的 catch——`message: e.message` 会把数据库的
 *    英文原始报错（如 `duplicate key value violates unique constraint`、
 *    `relation "xxx" does not exist`、连接超时栈信息）原样吐给用户。用户看不懂，
 *    而且泄露了内部结构。今天的任务就是把「裸报错」换成「人话」。
 *
 * 三类错误（Day 23 任务定义）：
 *   ① 输入错 INPUT   —— 用户传错了（400/404），必须说清「哪个字段、错在哪、怎么改」
 *   ② 网络错 NETWORK —— 连不上/超时（504），提示「稍后重试」类
 *   ③ 服务端错 SERVER—— 我们自己的问题（500），只回中文概括，绝不吐内部细节
 *
 * 用法：
 *    const { toErrorResponse, makeErr } = require('../common/errors');
 *    try { ... } catch (e) { return toErrorResponse(e); }
 */
'use strict';

/* ---------- 错误分类常量 ---------- */
const KIND = {
  INPUT: 'input',      // ① 输入错：用户能自己改
  NETWORK: 'network',  // ② 网络错：重试可能好
  SERVER: 'server'     // ③ 服务端错：我们的锅
};

/** 面向用户的统一中文兜底文案（按类别） */
const FALLBACK = {
  [KIND.INPUT]: '请求参数有问题，请检查后重试',
  [KIND.NETWORK]: '网络不太顺，请稍后再试一次',
  [KIND.SERVER]: '服务器开小差了，稍后再试'
};

/**
 * 内部错误码 → 类别 映射。
 * 不在表里的错误码按 status 判断，再兜底到 SERVER。
 */
const CODE_KIND = {
  // ① 输入错
  MISSING_FIELD: KIND.INPUT,
  INVALID_PARAM: KIND.INPUT,
  INVALID_BODY: KIND.INPUT,
  CARD_NOT_FOUND: KIND.INPUT,
  FAVORITE_NOT_FOUND: KIND.INPUT,
  ALREADY_FAVORITED: KIND.INPUT,
  METHOD_NOT_ALLOWED: KIND.INPUT,
  // ② 网络错（我们侧连数据库基础设设施的通道问题）
  DB_TIMEOUT: KIND.NETWORK,
  DB_REQUEST_FAILED: KIND.NETWORK,
  // ③ 服务端错
  DB_NOT_CONFIGURED: KIND.SERVER,
  INTERNAL: KIND.SERVER
};

/** 按 HTTP status 猜类别 */
function kindByStatus(status) {
  if (status >= 400 && status < 500) return KIND.INPUT;
  if (status === 504 || status === 502 || status === 503) return KIND.NETWORK;
  return KIND.SERVER;
}

/** 归类一个错误对象 */
function classify(e) {
  const code = (e && e.code) || '';
  if (CODE_KIND[code]) return CODE_KIND[code];
  return kindByStatus((e && e.status) || 500);
}

/**
 * 造一个带 status / code / 中文 message 的错误。
 * 注意：message 必须是「给用户看的人话」，内部技术细节请放 e.detail（不进响应体）。
 */
function makeErr(status, code, message, detail) {
  const e = new Error(message);
  e.status = status;
  e.code = code;
  if (detail) e.detail = detail;   // 只进日志，不进响应
  return e;
}

/**
 * 把任意 Error 转成安全的响应对象。
 * 关键规则：**对外只回中文人话**，内部原始报错只写日志。
 *
 * @param {Error} e 捕获到的错误
 * @param {Function} logFn 可选日志函数，接收 (code, detail)
 * @returns {{statusCode:number, headers:object, body:string}}
 */
function toErrorResponse(e, logFn) {
  const status = (e && e.status) || 500;
  const code = (e && e.code) || 'INTERNAL';
  const kind = classify({ status, code });

  // 输入错：message 是我们自己精心写的中文校验文案，可以原样回
  // 其他两类：只回类别兜底文案，内部细节绝不外泄
  const safeMessage = kind === KIND.INPUT && e && e.message
    ? e.message
    : FALLBACK[kind];

  // 内部细节（原始英文报错等）只进日志
  if (typeof logFn === 'function') {
    logFn(code, {
      kind: kind,
      status: status,
      internal: (e && (e.detail || e.message)) || ''
    });
  }

  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    body: JSON.stringify({
      ok: false,
      error: { code: code, kind: kind, message: safeMessage }
    })
  };
}

/** 便捷：输入错 */
function inputErr(status, code, message) {
  return makeErr(status, code, message);
}

/** 便捷：服务端错（对外统一文案，细节进 detail） */
function serverErr(code, detail) {
  return makeErr(500, code || 'INTERNAL', FALLBACK[KIND.SERVER], detail);
}

module.exports = { KIND, FALLBACK, makeErr, classify, toErrorResponse, inputErr, serverErr };

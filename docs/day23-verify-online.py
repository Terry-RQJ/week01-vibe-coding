#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Day 23 线上三类错误提示验证（Python，避免 bash 引号/换行问题）"""
import json
import ssl
import urllib.request
import urllib.error

BASE = "https://rqj-2006-d0gl1ael531a243a1-1497985433.ap-shanghai.app.tcloudbase.com/api"
CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE

CN = __import__("re").compile(r"[\u4e00-\u9fa5]")
LEAK = __import__("re").compile(
    r"relation|constraint|duplicate key|syntax error|ECONNREFUSED|does not exist|at Object|node_modules",
    __import__("re").I)

R = []


def call(label, method, path, body=None, expect=None):
    url = BASE + path
    data = body.encode("utf-8") if body else None
    req = urllib.request.Request(url, data=data, method=method)
    if data:
        req.add_header("Content-Type", "application/json")
    status, text = 0, ""
    try:
        with urllib.request.urlopen(req, timeout=15, context=CTX) as r:
            status = r.status
            text = r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        status = e.code
        text = e.read().decode("utf-8", "replace")
    except Exception as e:
        status, text = 0, "REQ-ERROR: %s" % e

    try:
        j = json.loads(text)
    except Exception:
        j = None
    err = (j or {}).get("error", {}) if isinstance(j, dict) else {}
    msg = err.get("message", "")
    kind = err.get("kind", "-")
    safe = bool(CN.search(msg)) and not LEAK.search(msg)
    ok = (expect is None or status == expect) and safe
    R.append((label, status, kind, msg, ok))
    print("%s %-34s HTTP %-4s kind=%-8s %s"
          % ("[PASS]" if ok else "[FAIL]", label, status, kind, msg[:60]))
    return status, text


print("════ Day 23 线上三类错误提示验证 ════\n")
print("【① 输入错】")
call("category 非法", "GET", "/cards?category=hack-category", expect=400)
call("limit 越界", "GET", "/cards?limit=999", expect=400)
call("slug 不存在", "GET", "/cards?slug=no-such-card-xyz", expect=404)
call("方法不支持", "POST", "/cards", expect=405)
call("PATCH 缺 id", "PATCH", "/favorites", body='{"note":"x"}', expect=400)
call("PATCH 改未知字段", "PATCH", "/favorites?id=1", body='{"card_slug":"hack"}', expect=400)
call("DELETE 不存在 id", "DELETE", "/favorites?id=99999999", expect=404)
call("body 非法 JSON", "POST", "/favorites", body="{not json", expect=400)

print("\n【正常路径回归】")
for label, method, path, exp in [
    ("GET /health", "GET", "/health", 200),
    ("GET /cards?limit=3", "GET", "/cards?limit=3", 200),
    ("GET /categories", "GET", "/categories", 200),
    ("GET /favorites", "GET", "/favorites?client_id=day23-check", 200),
]:
    url = BASE + path
    req = urllib.request.Request(url, method=method)
    try:
        with urllib.request.urlopen(req, timeout=15, context=CTX) as r:
            st, tx = r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        st, tx = e.code, e.read().decode("utf-8", "replace")
    except Exception as e:
        st, tx = 0, str(e)
    good = st == exp and '"ok":true' in tx.replace(" ", "")
    R.append((label, st, "-", "ok" if good else tx[:60], good))
    print("%s %-24s HTTP %s" % ("[PASS]" if good else "[FAIL]", label, st))

print("\n════ 汇总 ════")
p = sum(1 for r in R if r[4])
print("%d / %d 通过" % (p, len(R)))
if p != len(R):
    for r in R:
        if not r[4]:
            print("  FAIL:", r[0], r[1], r[3][:80])

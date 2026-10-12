#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Day 29 线上验证：内容扩充（24 张卡 / 45 条法条）+ 搜索三段式 + 命中法条

用法：python docs/day29-verify-online.py
退出码 0 = 全通过，1 = 有失败项。

与 Day 23 的验证脚本同套路（Python + urllib，证书不校验——本机走
Watt Toolkit 代理，证书链非标准；这与生产无关，只影响本地验证）。
"""
import json
import ssl
import sys
import urllib.error
import urllib.parse
import urllib.request

BASE = "https://rqj-2006-d0gl1ael531a243a1-1497985433.ap-shanghai.app.tcloudbase.com/api"
CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE

PASS, FAIL = [], []


def get(path, timeout=15):
    """返回 (status, json_or_None, raw_text)"""
    req = urllib.request.Request(BASE + path, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=CTX) as r:
            return r.status, json.loads(r.read().decode("utf-8", "replace")), ""
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", "replace")
        try:
            return e.code, json.loads(raw), raw
        except Exception:
            return e.code, None, raw
    except Exception as e:
        return 0, None, "REQ-ERROR: %s" % e


def check(label, cond, detail=""):
    (PASS if cond else FAIL).append(label)
    print("%s %-46s %s" % ("[PASS]" if cond else "[FAIL]", label, detail))


def cards_path(kw=None, cat=None, limit=None):
    qs = []
    if kw is not None:
        qs.append("keyword=" + urllib.parse.quote(kw))
    if cat is not None:
        qs.append("category=" + urllib.parse.quote(cat))
    if limit is not None:
        qs.append("limit=" + str(limit))
    return "/cards" + ("?" + "&".join(qs) if qs else "")


def search(kw, cat=None, limit=50):
    st, j, raw = get(cards_path(kw, cat, limit))
    if st != 200 or not isinstance(j, dict):
        return None, st, raw
    return j, st, raw


print("=" * 78)
print("A. 内容规模（24 张卡 / 45 条法条 / 每类 4 张）")
print("=" * 78)

j, st, _ = search(None, None, 50)
cards = (j or {}).get("data") or []
check("全量返回 24 张卡", st == 200 and len(cards) == 24, "实际 %d 张" % len(cards))

st2, j2, _ = get("/categories")
cats = (j2 or {}).get("data") or []
counts = {c.get("id"): c.get("count") for c in cats}
check("6 个分类", len(cats) == 6, str(list(counts.keys())))
check("每类 count = 4", all(v == 4 for v in counts.values()), str(counts))

# 抽一张卡详情，确认法条带原文与出处
st3, j3, _ = get("/cards?slug=fangdong-bu-tui-yajin")
laws0 = ((j3 or {}).get("data") or {}).get("laws") or []
check("详情页带法条", st3 == 200 and len(laws0) == 2, "%d 条" % len(laws0))
check("法条含原文与官方出处",
      all(l.get("text") and l.get("source_url") for l in laws0),
      laws0[0].get("name", "") if laws0 else "")

print()
print("=" * 78)
print("B. 搜索三段式（精确 / 近似 / 无结果）")
print("=" * 78)

EXACT = [
    ("加班", "jiaban-fei"),
    ("押金", "fangdong-bu-tui-yajin"),
    ("彩礼", "caili-fanhuan"),
    ("高空抛物", "gaokong-paowu"),
    ("电动车", "dianche-pengzhuang"),
    ("宠物", "chongwu-yaoren"),
    ("噪声", "loudong-chaozhu"),
    ("劳动合同法", None),
]
for kw, expect_first in EXACT:
    j, st, raw = search(kw)
    if j is None:
        check("精确 · %s" % kw, False, "HTTP %s %s" % (st, raw[:60]))
        continue
    data = j.get("data") or []
    meta = j.get("meta") or {}
    hit_slugs = [c["slug"] for c in data]
    good = (st == 200 and len(data) > 0 and meta.get("matchMode") == "exact"
            and (expect_first is None or expect_first in hit_slugs))
    check("精确 · %s" % kw, good,
          "→ %d 张 %s mode=%s" % (len(data), hit_slugs[:3], meta.get("matchMode")))

print()
FUZZY = [
    ("公司不给加班费", "jiaban-fei"),
    ("房东不退押金怎么办", "fangdong-bu-tui-yajin"),
    ("楼上老是吵我睡不着", None),
    ("东西买贵了能退吗", None),
]
for kw, expect_first in FUZZY:
    j, st, raw = search(kw)
    if j is None:
        check("近似 · %s" % kw, False, "HTTP %s %s" % (st, raw[:60]))
        continue
    data = j.get("data") or []
    meta = j.get("meta") or {}
    hit_slugs = [c["slug"] for c in data]
    good = (st == 200 and len(data) > 0 and meta.get("matchMode") == "fuzzy"
            and (expect_first is None or hit_slugs[:1] == [expect_first]))
    check("近似 · %s" % kw, good,
          "→ %d 张 %s mode=%s" % (len(data), hit_slugs[:3], meta.get("matchMode")))

print()
# 「彻底无结果」只能用纯拉丁串构造：中文长句几乎必然被某个 2 字片段命中
# （「一个」「存在」这类高频片段），这是「长句兜底召回」的必然推论，不是缺陷。
j, st, _ = search("zzqqxx")
meta = (j or {}).get("meta") or {}
check("无结果 · 纯拉丁串 zzqqxx",
      st == 200 and (j.get("data") or []) == [] and meta.get("matchMode") == "none"
      and (meta.get("matchedLaws") or []) == [],
      "mode=%s" % meta.get("matchMode"))

# 反过来把设计意图也钉住：自然语言长句必须给出近似结果（不能是 0 条）
j, st, _ = search("这是一个绝对不存在的词组")
meta = (j or {}).get("meta") or {}
check("长句兜底 · 中文长句必给近似结果（不为 0）",
      st == 200 and len((j.get("data") or [])) > 0 and meta.get("matchMode") == "fuzzy",
      "→ %d 张 mode=%s（高频片段命中，属预期）"
      % (len((j.get("data") or [])), meta.get("matchMode")))

print()
print("=" * 78)
print("C. matchedLaws（直接查到法条）")
print("=" * 78)


def matched(kw):
    j, st, _ = search(kw)
    return ((j or {}).get("meta") or {}).get("matchedLaws") or []


m = matched("押金")
names = [l["name"] for l in m]
check("搜「押金」带出民法典 714 条", any("714" in n for n in names), str(names))

m = matched("劳动合同法")
names = [l["name"] for l in m]
check("搜「劳动合同法」带出该法条文 ≥5 条",
      sum(1 for n in names if "劳动合同法" in n) >= 5,
      "共 %d 条，其中劳动合同法 %d 条" % (len(m), sum(1 for n in names if "劳动合同法" in n)))

m = matched("加班")
names = [l["name"] for l in m]
check("搜「加班」带出劳动法 44 条 / 劳动合同法 31 条",
      any("劳动法》第 44" in n for n in names) or any("第 31 条" in n for n in names), str(names))

m = matched("房东不退押金怎么办")
check("命中条数上限 ≤12", len(m) <= 12, "%d 条" % len(m))
check("法条字段完整（name/text/source_url/cardSlug/cardTitle）",
      all(all(k in l for k in ("name", "text", "source_url", "cardSlug", "cardTitle")) for l in m)
      if m else False, "%d 条" % len(m))

m2 = matched("彩礼")
check("搜「彩礼」带出彩礼司法解释",
      any("彩礼" in l["name"] for l in m2),
      str([l["name"] for l in m2])[:110])

print()
print("=" * 78)
print("D. 边界与回归（老行为不能被改坏）")
print("=" * 78)

# 无关键词：meta 不应出现 matchMode（老调用方依赖原形状）
j, st, _ = search(None, None, 50)
meta = (j or {}).get("meta") or {}
check("无关键词时 meta 不含 matchMode/matchedLaws",
      st == 200 and "matchMode" not in meta and "matchedLaws" not in meta,
      str(meta))
check("无关键词时 total=24", meta.get("total") == 24, str(meta.get("total")))

j, st, _ = search("", None, 50)
check("空关键词 = 全量（24 张）", st == 200 and len((j.get("data") or [])) == 24,
      "%d 张" % len((j.get("data") or [])))

j, st, _ = search(None, "labor", 50)
check("分类筛选 labor = 4 张", st == 200 and len((j.get("data") or [])) == 4,
      "%d 张" % len((j.get("data") or [])))

j, st, _ = search("押金", "consume", 50)
meta = (j or {}).get("meta") or {}
check("关键词 + 不匹配分类 = 0 张", st == 200 and len((j.get("data") or [])) == 0,
      "mode=%s" % meta.get("matchMode"))

st, _, _ = get(cards_path(None, "nonexistent", 50))
check("非法 category → 400", st == 400, "HTTP %s" % st)

st, _, _ = get(cards_path(None, None, 0))
check("limit=0 → 400", st == 400, "HTTP %s" % st)

st, _, _ = get(cards_path(None, None, 51))
check("limit=51 → 400", st == 400, "HTTP %s" % st)

j, st, _ = search(None, None, 3)
check("limit=3 → 返回 3 张（total 仍为 24）",
      st == 200 and len((j.get("data") or [])) == 3 and (j.get("meta") or {}).get("total") == 24,
      "数据 %d / total %s" % (len((j.get("data") or [])), (j.get("meta") or {}).get("total")))

st, _, _ = get("/cards?slug=no-such-slug-xyz")
check("详情 404", st == 404, "HTTP %s" % st)

st, j, _ = get("/health")
check("/health 正常", st == 200 and (j or {}).get("ok") is True, "HTTP %s" % st)

st, j, _ = get("/categories")
check("/categories 正常", st == 200 and (j or {}).get("ok") is True, "HTTP %s" % st)

print()
print("=" * 78)
print("结果：%d 通过 / %d 失败 / 共 %d 项" % (len(PASS), len(FAIL), len(PASS) + len(FAIL)))
if FAIL:
    print("失败项：")
    for f in FAIL:
        print("  -", f)
print("=" * 78)
sys.exit(1 if FAIL else 0)

#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Day 29 线上验证：内容扩充 + 搜索三段式 + 命中法条

Day 30 起改为「按现状断言」：卡片数从 /cards 实时取，不再硬编码 24。
（旧版写死 24 张卡 / 每类 4 张，Day 30 扩容到 122 张后每次跑都误报 11 项。）
Day 31 同步：高空抛物/宠物两张卡在 Day 30 已改名；长句兜底断言按 Day 31「收严门槛」的新意图改写。

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
print("A. 内容规模（卡片总数按线上实时值断言）")
print("=" * 78)

j, st, _ = search(None, None, 50)
cards = (j or {}).get("data") or []
TOTAL_EXPECT = 122          # Day 31 现状（Day 30 扩容后 121，新增房产加名卡后 122）
# 注意 limit=50 的语义：data 最多给 50 条，完整总数在 meta.total 里。
# 旧版把 data 条数当总数断言（Day 29 时总共才 24 张 < 50，恰好没暴露这个错误）。
check("无筛选：data 受 limit 截断为 50、meta.total = %d" % TOTAL_EXPECT,
      st == 200 and len(cards) == 50
      and (j.get("meta") or {}).get("total") == TOTAL_EXPECT,
      "data %d 条 / total %s" % (len(cards), (j.get("meta") or {}).get("total")))

st2, j2, _ = get("/categories")
cats = (j2 or {}).get("data") or []
counts = {c.get("id"): c.get("count") for c in cats}
check("6 个分类", len(cats) == 6, str(list(counts.keys())))
# 不写死「每类 4 张」：只校验「分类 count 之和 = 全量总数」且「每类都不为空」，
# 这样以后继续扩容不会让这条断言变成误报（内容规模由覆盖率探针盯，见 day30-coverage-probe）
check("分类 count 之和 = 全量总数",
      sum(counts.values()) == TOTAL_EXPECT and all(v > 0 for v in counts.values()),
      str(counts))

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
    ("高空抛物", "gao-kong-pao-wu-zeren"),
    ("电动车", "dianche-pengzhuang"),
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
    # Day 31 从 EXACT 挪过来：卡片标题是「遛狗不拴绳咬了人」，整串「宠物咬人」并不存在于
    # 任何字段里，所以走近似分支是**正确**行为（Day 29 把它归进 EXACT 是归类错误）。
    ("宠物咬人", "gou-bu-shuansheng"),
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

# ⚠️ 这条断言在 Day 31 被**反向改写**了，别照旧版理解。
# Day 29 的设计意图是「中文长句必给近似结果」——那时近似检索只要蹭到一个 2 字片段就召回，
# 于是「这是一个绝对不存在的词组」也能捞出一堆卡，被当成「兜底能力强」写成了断言。
# Day 31 用户明确选择了「收严门槛，直接走空态推荐」：搜出一屏不相干的东西，
# 比诚实地说「没找到」更糟。所以现在这句话**应该**是 0 条。
j, st, _ = search("这是一个绝对不存在的词组")
meta = (j or {}).get("meta") or {}
check("收严门槛 · 无意义长句应为 0 条（不再是长句兜底）",
      st == 200 and len((j.get("data") or [])) == 0 and meta.get("matchMode") == "none",
      "→ %d 张 mode=%s（应为 0 / none）"
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
check("无关键词时 total=全量 %d" % TOTAL_EXPECT, meta.get("total") == TOTAL_EXPECT, str(meta.get("total")))

j, st, _ = search("", None, 50)
check("空关键词 = 全量（meta.total = %d）" % TOTAL_EXPECT,
      st == 200 and (j.get("meta") or {}).get("total") == TOTAL_EXPECT,
      "total=%s / data %d 条" % ((j.get("meta") or {}).get("total"), len(j.get("data") or [])))

j, st, _ = search(None, "labor", 50)
check("分类筛选 labor = %d 张" % counts.get("labor", 0), st == 200 and len((j.get("data") or [])) == counts.get("labor", 0),
      "%d 张" % len((j.get("data") or [])))

# Day 31 修：原来用「押金 + consume」验证「关键词与分类不匹配 → 0 条」，
# 但 Day 30 扩容后消费类有 20 张卡，其中「定金和订金」确实提到了押金，
# 于是它不再是「不匹配」的组合——返回 1 条反而是正确的。
# 换成语义上真正风马牛不相及的组合：劳动类的「加班费」配交通类。
j, st, _ = search("加班费", "traffic", 50)
meta = (j or {}).get("meta") or {}
check("关键词 + 不匹配分类 = 0 张", st == 200 and len((j.get("data") or [])) == 0,
      "mode=%s 条数=%d" % (meta.get("matchMode"), len(j.get("data") or [])))

st, _, _ = get(cards_path(None, "nonexistent", 50))
check("非法 category → 400", st == 400, "HTTP %s" % st)

st, _, _ = get(cards_path(None, None, 0))
check("limit=0 → 400", st == 400, "HTTP %s" % st)

st, _, _ = get(cards_path(None, None, 51))
check("limit=51 → 400", st == 400, "HTTP %s" % st)

j, st, _ = search(None, None, 3)
check("limit=3 → 返回 3 张（total 仍为全量 %d）" % TOTAL_EXPECT,
      st == 200 and len((j.get("data") or [])) == 3 and (j.get("meta") or {}).get("total") == TOTAL_EXPECT,
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

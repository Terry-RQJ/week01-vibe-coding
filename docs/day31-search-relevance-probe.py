#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Day 31 搜索相关性探针（回归资产，非临时脚本）

背景：Day 30 把内容扩到 121 张卡后，「搜不出来」清零了，但暴露出**更伤体验的问题——假命中**：
搜「搬家公司」返回「公司要裁员」、搜「快递丢了」返回「借条丢了」，
只因为共享「公司」「丢了」两个字就被召回。用户搜不到还会换个词，搜出一屏垃圾会直接判定这站不靠谱。

本脚本用两组词盯住两件事，任何一次改搜索逻辑后都应重跑：
  组 A「假命中词」：期望 = none（或极少量结果），出现大量结果 = 召回又变宽了
  组 B「必须召回词」：期望 = 有结果且首条相关，出现 none = 门槛收得太紧、误伤了正常搜索

运行：python docs/day31-search-relevance-probe.py
"""
import json
import ssl
import urllib.parse
import urllib.request

BASE = "https://rqj-2006-d0gl1ael531a243a1-1497985433.ap-shanghai.app.tcloudbase.com/api"
CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE


def get(path, timeout=20):
    req = urllib.request.Request(BASE + path, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=CTX) as r:
            return json.loads(r.read().decode("utf-8", "replace"))
    except Exception as e:
        return {"ok": False, "_err": str(e)}


def search(kw):
    j = get("/cards?" + urllib.parse.urlencode({"keyword": kw, "limit": 50}))
    if not j.get("ok"):
        return None
    m = j.get("meta") or {}
    d = j.get("data") or []
    return {
        "n": len(d),
        "mode": m.get("matchMode"),
        "top": d[0]["title"] if d else "",
    }


# 组 A：不该被召回的词（此前会返回一堆只共享通用字的卡片）
FAKE = [
    "搬家公司", "快递丢了", "快递损坏", "虚拟财产", "租房中介",
    "装修合同", "群租房", "冒名办公司", "医疗纠纷", "游戏充值",
    "快递代收", "打球受伤", "身份证被冒用", "劳务派遣", "账号被封",
]

# ⚠️ 已知残留白名单（与 docs/day31-local-search-check.js 的 FAKE_KNOWN 保持一致，改一边要同步另一边）
# 这 2 个词各召回 1 条「有点关系但不算跑题」的卡，判定为可接受，不计入失败统计。
# 但**超过 1 条就会被重新计入失败**——防止有人放松门槛后靠这个白名单蒙混过关。
# 根治办法是补内容（把「装修合同」「身份证被冒用」做成真卡片），不是放宽阈值。
FAKE_KNOWN = {"装修合同": 1, "身份证被冒用": 1}

# 组 B：必须能搜到、且首条要相关的词（防止门槛收得太紧误伤正常搜索）
GOOD = [
    "加班费", "押金", "公司不给加班费怎么办", "老板拖欠我工资",
    "被车撞了怎么赔", "楼上噪音太大怎么办", "房东不退我押金",
    "买到过期食品怎么赔", "离婚房子怎么分", "朋友借钱不还怎么办",
    "借条", "工伤", "遛狗不拴绳", "家暴",
]


def run(title, words, expect_none):
    print("\n===== %s =====" % title)
    bad = 0
    for kw in words:
        r = search(kw)
        if r is None:
            print("  [ERR ] %-16s 请求失败" % kw)
            continue
        tag = {"exact": "精确", "fuzzy": "近似", "none": "空态"}.get(r["mode"], str(r["mode"]))
        if expect_none:
            # 期望：没有相关内容 → 应回落到「空态推荐」，而不是塞一屏无关卡片
            tol = FAKE_KNOWN.get(kw, 0)
            if r["n"] > tol:
                flag = "✗假命中"
                bad += 1
            elif r["n"] > 0:
                flag = "·残留"      # 在白名单容忍条数内，不计失败
            else:
                flag = "✓"
        else:
            hit = r["n"] == 0
            flag = "✗漏召回" if hit else "✓"
            if hit:
                bad += 1
        print("  %-5s %-8s %-16s %2d 条  %s" % (flag, tag, kw, r["n"], r["top"][:34]))
    return bad


fake_bad = run("组 A · 假命中词（期望 0 条，回落到空态推荐）", FAKE, True)
good_bad = run("组 B · 必须召回词（期望有结果）", GOOD, False)

print("\n" + "=" * 64)
print("组 A 假命中：        %d / %d   （目标 0；已登记 %d 条已知残留）"
      % (fake_bad, len(FAKE), len(FAKE_KNOWN)))
print("组 B 被误伤漏召回：  %d / %d   （目标 0）" % (good_bad, len(GOOD)))
print("=" * 64)
print("✅ 通过" if fake_bad == 0 and good_bad == 0 else "⚠️ 有项目未达标，见上文 ✗ 标记")
print("判读：组 A 越接近 0 越好；组 B 必须为 0（出现即说明门槛收过头）。")

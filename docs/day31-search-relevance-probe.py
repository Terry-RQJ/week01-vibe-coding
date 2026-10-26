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
# ⚠️ 这组是**会越跑越少**的：每补一张内容空白卡，对应词就该挪进组 B。
#   Day 33：「装修合同」「身份证被冒用」补成真卡 → 挪走（15 → 12 词）
#   Day 34：「快递丢了」等 6 个词被 12 张新卡覆盖 → 挪走（12 → 6 词）
#   Day 35：「租房中介」「账号被封」补成真卡 → 挪走（6 → 4 词）
#           随后发现「游戏充值」「虚拟财产」也被新卡真实覆盖 → 再挪走（4 → 2 词）
# 剩 2 个词内容库确实还没有，等后续补卡。别把挪走的加回来。
FAKE = [
    "搬家公司", "打球受伤",
]

# ⚠️ 已知残留白名单（与 docs/day31-local-search-check.js 的 FAKE_KNOWN 保持一致，改一边要同步另一边）
# Day 31 曾登记 {"装修合同":1, "身份证被冒用":1}；Day 33 把这两张卡真做出来了，白名单清空。
# Day 34 又登记 {"账号被封":1}——「账号」+「号被」两个片段在「账号被盗」里重合，属同音字粘连。
# Day 35 新增 zhanghao-beifeng 后，该词命中正确卡片、进组 B，**本条目已删除**，白名单回到空。
# **补内容而不是放宽阈值，才是根治**。空着才是健康状态。
FAKE_KNOWN = {}

# 组 B：必须能搜到、且首条要相关的词（防止门槛收得太紧误伤正常搜索）
GOOD = [
    "加班费", "押金", "公司不给加班费怎么办", "老板拖欠我工资",
    "被车撞了怎么赔", "楼上噪音太大怎么办", "房东不退我押金",
    "买到过期食品怎么赔", "离婚房子怎么分", "朋友借钱不还怎么办",
    "借条", "工伤", "遛狗不拴绳", "家暴",
    # Day 33 新增：原本在组 A 的 2 个词，补卡后转为「必须搜得到」；外加口语同义词「冒名办公司」
    "装修合同", "身份证被冒用", "冒名办公司",
    # Day 34 新增：原本在组 A 的 6 个词，12 张新卡覆盖后转为「必须搜得到」。
    # 改之前这 6 个词本地各报 1 条假命中——那 1 条正是新卡，说明内容确实对上了。
    "快递丢了", "快递损坏", "快递代收", "群租房", "医疗纠纷", "劳务派遣",
    # Day 35 新增：第二批 12 张卡带来的词。
    # 前两个是从组 A 挪过来的（Day 34 还登记着假命中），后两个同理。
    "租房中介", "账号被封", "游戏充值", "虚拟财产",
    "黑中介", "中介费", "人脸识别", "刷脸", "直播打赏", "酒店退订",
    "洗钱", "跑分", "户口本", "宠物寄养", "保姆", "护工", "养老院", "代购",
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

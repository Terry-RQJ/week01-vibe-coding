#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Day 30 搜索覆盖度体检（回归资产，非临时脚本）

用 142 个「普通人真会搜的词」打线上 /api/cards，统计：
  - mode=none        —— 彻底搜不出来（用户会说「这功能坏的」）
  - 卡片有但法条区空 —— 能看到情形但看不到法条

用途：① 扩容决策依据（Day 30 就是靠它定位出 42 个 0 命中的空档词，扩到 121 张后清零）；
     ② 回归防线——以后每次加/改内容，跑一遍确认没有把已有词搜坏。

运行：python docs/day30-coverage-probe.py
判读：结尾必须出现「无结果 0」。出现新的无结果词 = 内容或检索逻辑出现退化。
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
    q = urllib.parse.urlencode({"keyword": kw, "limit": 50})
    j = get("/cards?" + q)
    if not j.get("ok"):
        return None
    m = j.get("meta") or {}
    return {
        "cards": len(j.get("data") or []),
        "mode": m.get("matchMode"),
        "laws": len(m.get("matchedLaws") or []),
        "titles": [c["title"] for c in (j.get("data") or [])][:3],
    }


WORDS = {
    "劳动": "加班费 加班 不给加班费 试用期 试用期被辞退 辞退 劝退 被裁员 N+1 赔偿金 经济补偿 "
            "没签劳动合同 不签合同 双倍工资 社保 五险一金 工伤 竞业限制 离职 辞职 调岗 降薪 "
            "年假 产假 拖欠工资 克扣工资 末位淘汰 实习 试用期工资",
    "消费": "退款 退货 退钱 七天无理由 过期食品 吃出异物 假货 预付卡 健身房跑路 办卡退卡 赠品 "
            "三包 维修 霸王条款 直播带货 主播 虚假宣传 价格欺诈 订金 定金 会员卡 美容院跑路",
    "借贷": "借钱不还 借条 欠条 利息 高利贷 利率 担保 保证人 微信转账 转账记录 朋友借钱 网贷 "
            "套路贷 逾期 还款 月息",
    "婚姻家庭": "押金 房东不退押金 租房押金 离婚 离婚财产 财产分割 彩礼 退彩礼 继承 遗产 遗嘱 "
                "抚养权 家暴 婚前财产 夫妻共同债务 房产加名 分居 赡养 老人赡养 遗嘱继承 退租",
    "交通": "交通事故 车祸 撞人 被撞 电动车 酒驾 醉驾 逃逸 肇事逃逸 保险 理赔 借车 责任认定 "
            "交强险 误工费 伤残 追尾 闯红灯",
    "邻里名誉": "噪音 扰民 高空抛物 扔东西 宠物 狗咬人 遛狗 造谣 诽谤 名誉 漏水 渗水 采光 "
                "楼道堆物 占车位 物业 邻居 楼上吵",
    "长句提问": "公司不给加班费怎么办 房东不退我押金 朋友借钱不还怎么办 楼上噪音太大怎么办 "
                "买到过期食品怎么赔 离婚房子怎么分 被车撞了怎么赔 网上被人造谣怎么办 "
                "公司要我签自愿离职 老板拖欠我工资",
    "法律名直搜": "劳动合同法 民法典 消费者权益保护法 道路交通安全法 噪声污染防治法 食品安全法 "
                  "劳动法 民间借贷",
}

none_hits, no_law, ok, total = [], [], [], 0
for cat, blob in WORDS.items():
    print("\n===== %s =====" % cat)
    for kw in blob.split():
        total += 1
        r = search(kw)
        if r is None:
            print("  [ERR ] %-16s 请求失败" % kw)
            continue
        tag = {"exact": "精确", "fuzzy": "近似", "none": "★无结果"}.get(r["mode"], str(r["mode"]))
        print("  %-6s %-18s 卡片%-3d 法条%-3d  %s" % (tag, kw, r["cards"], r["laws"],
                                                       "、".join(r["titles"])[:46]))
        if r["mode"] == "none":
            none_hits.append((cat, kw))
        elif r["cards"] > 0 and r["laws"] == 0:
            no_law.append((cat, kw))
        else:
            ok.append((cat, kw))

print("\n" + "=" * 70)
print("总词数 %d   OK %d   无结果 %d   有卡无法条 %d" %
      (total, len(ok), len(none_hits), len(no_law)))
print("\n★ 彻底搜不出来（用户会认为功能坏了）:")
for cat, kw in none_hits:
    print("   [%s] %s" % (cat, kw))
print("\n▲ 能搜到情形、但法条区是空的:")
for cat, kw in no_law:
    print("   [%s] %s" % (cat, kw))

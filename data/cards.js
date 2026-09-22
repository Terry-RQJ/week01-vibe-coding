/* data/cards.js — mock 内容数据（Day 8）
 * 纯静态路线（TECH_DESIGN v3.0 §5）：数据用 .js 而非 .json，
 * 因为双击本地文件预览时 .json 会被浏览器 CORS 拦住，.js 不会。
 * Day 8 阶段共 6 张（每类 1 张）；Day 8–14 滚动补到 12 张（每类 2 张，PRD §8.1）。
 * 字段契约：TECH_DESIGN §6。AGENTS §2-8：所有法条内容必带 last_verified_at。
 *
 * ⚠️ 这些是演示用 mock 数据：结构与真实上线一致，法条条号为真实常见引用，
 *    正式上线前仍需按 Day 8–14 流程逐条复核。
 */
window.LAW_CARDS = [
  {
    slug: "gongsi-quantui",
    title: "公司劝退我，该怎么办？",
    summary: "就像快递员说要「协商退货」——你可以答应，也可以拒收。公司说「你主动辞职吧」，主动权其实在你手里。",
    category: "劳动类",
    tags: ["劳动合同", "离职", "补偿金"],
    scenario: "收到公司 HR 发来的「劝退」短信，暗示你主动辞职，否则调岗降薪。",
    solution_steps: [
      "先别签任何「自愿离职申请」——签了就拿不到补偿",
      "保留证据：聊天记录、录音、考勤、工资条",
      "算清应得补偿：每工作满 1 年补 1 个月工资",
      "协商不成，向当地劳动监察大队投诉或申请劳动仲裁"
    ],
    laws: [
      { name: "《劳动合同法》第 36 条", text: "用人单位与劳动者协商一致，可以解除劳动合同。", source_url: "https://flk.npc.gov.cn/detail2.html?ZmY4MDgxODE3OWFmZmUzMDE3OWJhNTc0NzdmNTAwOTU" },
      { name: "《劳动合同法》第 46 条", text: "用人单位依照本法第三十六条规定向劳动者提出解除劳动合同并与劳动者协商一致解除劳动合同的，应当向劳动者支付经济补偿。", source_url: "https://flk.npc.gov.cn/detail2.html?ZmY4MDgxODE3OWFmZmUzMDE3OWJhNTc0NzdmNTAwOTU" },
      { name: "《劳动合同法》第 47 条", text: "经济补偿按劳动者在本单位工作的年限，每满一年支付一个月工资的标准向劳动者支付。", source_url: "https://flk.npc.gov.cn/detail2.html?ZmY4MDgxODE3OWFmZmUzMDE3OWJhNTc0NzdmNTAwOTU" }
    ],
    related_slugs: [],
    published_at: "2026-09-22",
    updated_at: "2026-09-22",
    author_type: "AI 起草 + 律师复核",
    reviewed_by: "待复核（mock）",
    status: "published",
    last_verified_at: "2026-09-22"
  },
  {
    slug: "guoqi-shipin",
    title: "买到过期食品，除了退款还能索赔吗？",
    summary: "就像买到坏掉的水果不止要换一份——过期食品是法律给消费者的「加倍保护」：退款之外，还可以主张价款十倍的赔偿。",
    category: "消费类",
    tags: ["食品安全", "索赔", "维权"],
    scenario: "在便利店买了瓶酸奶，回家发现过期两天，店员说「退你钱就行了」。",
    solution_steps: [
      "保留小票、商品和包装（证据链第一环）",
      "先与商家协商：退货退款 + 主张赔偿",
      "协商不成，拨 12315 或在全国 12315 平台小程序投诉",
      "仍不解决，可向法院起诉（小额诉讼程序，成本低）"
    ],
    laws: [
      { name: "《食品安全法》第 148 条", text: "生产不符合食品安全标准的食品或者经营明知是不符合食品安全标准的食品，消费者除要求赔偿损失外，还可以向生产者或者经营者要求支付价款十倍或者损失三倍的赔偿金；增加赔偿的金额不足一千元的，为一千元。", source_url: "https://flk.npc.gov.cn/detail2.html?ZmY4MDgxODE4YWFhNzI5YzAxYWFjZDUxNzQ4NTBhOTU" }
    ],
    related_slugs: [],
    published_at: "2026-09-22",
    updated_at: "2026-09-22",
    author_type: "AI 起草 + 律师复核",
    reviewed_by: "待复核（mock）",
    status: "published",
    last_verified_at: "2026-09-22"
  },
  {
    slug: "pengyou-jietiao",
    title: "朋友借钱，借条到底怎么写才有用？",
    summary: "借条就像游戏里的「存档点」——写对了，以后吵翻天也能读档重来；写错了，可能连吵架的资格都没有。",
    category: "借贷类",
    tags: ["借条", "民间借贷", "证据"],
    scenario: "好朋友急借 8000 元，说「咱俩这关系还要打借条？」你有点为难。",
    solution_steps: [
      "写清三要素：金额（大小写）、还款日期、双方姓名+身份证号",
      "利率别超过一年期 LPR 的 4 倍，超出部分法律不保护",
      "转账交付，备注「借款」，别给现金",
      "到期不还，3 年内必须主张（诉讼时效）"
    ],
    laws: [
      { name: "《民法典》第 667 条", text: "借款合同是借款人向贷款人借款，到期返还借款并支付利息的合同。", source_url: "https://flk.npc.gov.cn/detail2.html?ZmY4MDgxODE3YWIyNjE1OTAxN2FiNDA2NjE1OTAyMTU" },
      { name: "《民法典》第 188 条", text: "向人民法院请求保护民事权利的诉讼时效期间为三年。", source_url: "https://flk.npc.gov.cn/detail2.html?ZmY4MDgxODE3YWIyNjE1OTAxN2FiNDA2NjE1OTAyMTU" }
    ],
    related_slugs: [],
    published_at: "2026-09-22",
    updated_at: "2026-09-22",
    author_type: "AI 起草 + 律师复核",
    reviewed_by: "待复核（mock）",
    status: "published",
    last_verified_at: "2026-09-22"
  },
  {
    slug: "fangdong-bu-tui-yajin",
    title: "房东不退押金，一招制胜",
    summary: "押金就像游戏里的「保证金」——只要你没损坏装备（房屋设施），通关（退租）时就得原样退还，少一分都可以较真。",
    category: "婚姻家庭类",
    tags: ["租房", "押金", "合同"],
    scenario: "退租时房东以「墙面有钉子眼」为由，扣下 2000 元押金不还。",
    solution_steps: [
      "翻出租房合同，看押金条款怎么约定的",
      "正常使用痕迹（钉子眼、墙面自然老化）不属损坏",
      "与房东书面协商，保留聊天记录",
      "可找社区调解、拨打 12345，或起诉（金额小，程序快）"
    ],
    laws: [
      { name: "《民法典》第 714 条", text: "承租人应当妥善保管租赁物，因保管不善造成租赁物毁损、灭失的，应当承担赔偿责任。", source_url: "https://flk.npc.gov.cn/detail2.html?ZmY4MDgxODE3YWIyNjE1OTAxN2FiNDA2NjE1OTAyMTU" },
      { name: "《民法典》第 733 条", text: "租赁期限届满，承租人应当返还租赁物。返还的租赁物应当符合按照约定或者根据租赁物的性质使用后的状态。", source_url: "https://flk.npc.gov.cn/detail2.html?ZmY4MDgxODE3YWIyNjE1OTAxN2FiNDA2NjE1OTAyMTU" }
    ],
    related_slugs: [],
    published_at: "2026-09-22",
    updated_at: "2026-09-22",
    author_type: "AI 起草 + 律师复核",
    reviewed_by: "待复核（mock）",
    status: "published",
    last_verified_at: "2026-09-22"
  },
  {
    slug: "dianche-pengzhuang",
    title: "下班路上被电动车撞了，第一步做什么？",
    summary: "别急着私了也别急着吵——就像手机屏幕碎了先截图，路上出事故第一件事是「固定证据」，其次才是谈责任。",
    category: "交通类",
    tags: ["交通事故", "电动车", "报警"],
    scenario: "晚高峰骑车下班，被一辆逆行电动车撞倒，对方说「给你 200 块私了吧」。",
    solution_steps: [
      "先确认人身安全，受伤立即拨打 120",
      "报警 122，等交警出具《道路交通事故认定书》",
      "拍现场照片：车辆位置、刹车痕、周边监控位置",
      "私了有风险：伤情后发（如脑震荡）将无处追偿"
    ],
    laws: [
      { name: "《道路交通安全法》第 76 条", text: "机动车发生交通事故造成人身伤亡、财产损失的，由保险公司在机动车第三者责任强制保险责任限额范围内予以赔偿……", source_url: "https://flk.npc.gov.cn/detail2.html?ZmY4MDgxODE3YzNjMzRiNTAxN2M0NjQwZjNiYzAxMTU" }
    ],
    related_slugs: [],
    published_at: "2026-09-22",
    updated_at: "2026-09-22",
    author_type: "AI 起草 + 律师复核",
    reviewed_by: "待复核（mock）",
    status: "published",
    last_verified_at: "2026-09-22"
  },
  {
    slug: "loudong-chaozhu",
    title: "楼上装修吵翻天，除了忍还能怎么办？",
    summary: "楼层之间就像共享一张桌子——你有敲桌子的自由，但不能在别人睡觉时敲。噪音权是有边界的，越界就要管。",
    category: "邻里 / 名誉类",
    tags: ["噪音", "相邻权", "物业"],
    scenario: "楼上连续两周早 7 点开始电钻装修，沟通后对方说「我装修我自由」。",
    solution_steps: [
      "先查当地装修时间规定（多数城市：工作日 8:00–12:00、14:00–18:00）",
      "记录噪音时间 + 录音录像，形成证据",
      "找物业出面协调（装修一般有保证金约束）",
      "仍无效可报警或依据《噪声污染防治法》向城管投诉"
    ],
    laws: [
      { name: "《噪声污染防治法》第 58 条", text: "对已竣工交付使用的住宅楼、商铺、办公楼等建筑物进行室内装修活动，应当按照规定限定作业时间，采取有效措施，防止、减轻噪声污染。", source_url: "https://flk.npc.gov.cn/detail2.html?ZmY4MDgxODE4MjBiZDU3ZTAxODIwY2JhMTExZTAxMzA" },
      { name: "《民法典》第 288 条", text: "不动产的相邻权利人应当按照有利生产、方便生活、团结互助、公平合理的原则，正确处理相邻关系。", source_url: "https://flk.npc.gov.cn/detail2.html?ZmY4MDgxODE3YWIyNjE1OTAxN2FiNDA2NjE1OTAyMTU" }
    ],
    related_slugs: [],
    published_at: "2026-09-22",
    updated_at: "2026-09-22",
    author_type: "AI 起草 + 律师复核",
    reviewed_by: "待复核（mock）",
    status: "published",
    last_verified_at: "2026-09-22"
  }
];

/* 分类目录（与 PRD §3.3 六大类一致）*/
window.LAW_CATEGORIES = [
  { id: "labor",    name: "劳动类",        desc: "入职、离职、工资、加班" },
  { id: "consume",  name: "消费类",        desc: "网购、食品、售后、维权" },
  { id: "loan",     name: "借贷类",        desc: "借条、利息、催收" },
  { id: "marriage", name: "婚姻家庭类",    desc: "租房、婚姻、继承" },
  { id: "traffic",  name: "交通类",        desc: "事故、责任、保险" },
  { id: "neighbor", name: "邻里 / 名誉类", desc: "噪音、宠物、名誉" }
];

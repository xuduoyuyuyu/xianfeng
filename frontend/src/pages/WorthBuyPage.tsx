import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { RootState } from "../store";
import { Link, useNavigate } from "react-router-dom";
import GlobalPublicNav from "../components/GlobalPublicNav";


/* ===== 类型 ===== */
interface RatingDimensions {
  cost: number;       // 性价比 0-100
  quality: number;    // 质量 0-100
  safety: number;     // 安全性 0-100
  experience: number; // 使用体验 0-100
  afterSales: number; // 售后 0-100
}

interface Reference {
  title: string;
  url: string;
  type: 'expert' | 'test' | 'user_review' | 'official';
}

interface Alternative {
  name: string;
  price: string;
  score: number;
  reason: string;
}

interface AnalysisResult {
  url?: string | null;
  brand?: string | null;
  score: number;
  isIqTax: boolean;
  reason: string;
  pros: string[];
  cons: string[];
  businessModel: string;
  commentAnalysis: string;
  recommendation: string;
  analyzedAt: string;
  // 新增字段
  priceRange?: string;
  ratingDimensions?: RatingDimensions;
  dataPoints?: string[];
  references?: Reference[];
  suitableFor?: string[];
  notSuitableFor?: string[];
  alternatives?: Alternative[];
  buyAdvice?: string;
}

interface HistoryItem {
  query: string;
  url?: string | null;
  brand?: string | null;
  result: AnalysisResult;
  createdAt: string;
}

/* ===== 常量 ===== */
const HISTORY_KEY = "xf_worthbuy_history";
const MAX_HISTORY = 10;

function loadHistory(): HistoryItem[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.slice(0, MAX_HISTORY) : [];
  } catch {
    return [];
  }
}

function saveHistory(items: HistoryItem[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, MAX_HISTORY)));
  } catch {}
}

/* ===== 预置示例数据 ===== */
const DEMO_DATA: Record<string, AnalysisResult> = {
  "贝亲宽口径奶瓶": {
    score: 88,
    isIqTax: false,
    reason: "日本母婴老牌，PPSU材质安全可靠，宽口径设计方便冲泡和清洗，价格合理。",
    pros: ["PPSU材质耐高温180°C，不含双酚A", "宽口径设计，冲泡奶粉不易洒出", "硅胶奶嘴柔软度接近母乳，宝宝接受度高", "价格60-80元区间，性价比优秀"],
    cons: ["奶嘴属于易耗品，需2-3月更换", "假货较多，需认准官方渠道", "刻度线不够清晰，夜间冲奶不太方便"],
    businessModel: "品牌直营为主，电商平台授权经销。部分母婴博主推荐存在联盟佣金（约5-10%），但产品本身口碑过硬。",
    commentAnalysis: "好评集中在材质安全（约72%提及）和宝宝接受度高（约58%），差评主要吐槽刻度线不清和奶嘴不耐用。整体好评率超过95%，差评多为使用习惯问题而非产品质量问题。",
    recommendation: "值得入手。作为新生儿必备品，贝亲奶瓶在安全性、实用性和性价比三个方面都表现优秀。建议在官方旗舰店或大型母婴连锁购买，避免假货。",
    analyzedAt: new Date().toISOString(),
    priceRange: "¥59-89",
    ratingDimensions: { cost: 85, quality: 92, safety: 95, experience: 88, afterSales: 72 },
    dataPoints: ["PPSU材质耐180°C高温", "日本母婴市场占有率第1（连续12年）", "京东好评率 98%+（累计50万+评价）", "月销量10万+", "退货率不到2%"],
    references: [
      { title: "日本消费者厅婴幼儿用品安全白皮书2024", url: "https://www.caa.go.jp/", type: "official" },
      { title: "老爸评测：12款奶瓶横评", url: "https://www.laobapingce.com/", type: "test" },
      { title: "什么值得买：奶瓶选购攻略", url: "https://www.smzdm.com/", type: "user_review" },
    ],
    suitableFor: ["新生儿", "混合喂养", "对奶嘴挑剔的宝宝"],
    notSuitableFor: ["已习惯特定品牌奶嘴的宝宝（需过渡期）"],
    alternatives: [
      { name: "布朗博士防胀气奶瓶", price: "¥79", score: 85, reason: "防胀气专利，肠绞痛宝宝首选" },
      { name: "Hegen PPSU奶瓶", price: "¥198", score: 82, reason: "新加坡品牌，方形设计防滚落" },
    ],
    buyAdvice: "建议0-3个月选160ml+S号奶嘴，3个月后换240ml+M号。官方旗舰店大促期间2支装约¥120，性价比最高。",
  },
  "小猿学练机": {
    score: 75,
    isIqTax: false,
    reason: "护眼墨水屏+AI批改定位清晰，适合家长没时间辅导的家庭，但价格偏高且内容依赖订阅。",
    pros: ["10.3寸墨水屏护眼效果明显，长时间使用不累眼", "AI批改数学题准确率高，解放家长", "内置教材同步资源丰富，覆盖主流版本", "手写体验好，接近纸质书写感"],
    cons: ["售价3299元起，性价比争议大", "部分高级功能需额外订阅会员（299元/年）", "英语口语和作文批改能力较弱", "墨水屏刷新率低，不适合看视频课程"],
    businessModel: "品牌直营+各平台授权经销。教育类博主推广力度大，普遍存在CPS佣金模式。部分评测内容疑似品牌合作软文。",
    commentAnalysis: "家长评价两极分化。认可的点集中在护眼和AI批改功能，吐槽的点主要是价格偏高和内容订阅费。约15%的差评提到使用半年后电池衰减明显。",
    recommendation: "如果预算充足且孩子每天使用超过1小时，推荐购买。如果只是偶尔辅助学习，平板+护眼模式可能是更经济的选择。建议先在线下体验店试用后再决定。",
    analyzedAt: new Date().toISOString(),
    priceRange: "¥3299-3999",
    ratingDimensions: { cost: 58, quality: 78, safety: 90, experience: 80, afterSales: 65 },
    dataPoints: ["墨水屏无蓝光伤害，连续使用4小时不累眼", "AI批改数学题准确率96%+", "内置2000+本教材同步资源", "京东好评率91%", "电池续航约5天（普通使用）"],
    references: [
      { title: "中国消费者协会教育硬件评测报告2024", url: "https://www.cca.cn/", type: "official" },
      { title: "科技美学：9款学习机横评", url: "https://www.kejimx.com/", type: "test" },
      { title: "知乎：小猿学练机半年使用报告", url: "https://www.zhihu.com/", type: "user_review" },
    ],
    suitableFor: ["每天学习1小时以上的学生", "家长没时间辅导作业的家庭", "需要数学精准练习的学生"],
    notSuitableFor: ["偶尔辅助学习", "需要看视频课程的学生", "英语口语薄弱的学生"],
    alternatives: [
      { name: "科大讯飞学习机 T20", price: "¥4999", score: 78, reason: "AI精准学更强，口语评测行业第一" },
      { name: "iPad + 学习App组合", price: "¥2599+", score: 80, reason: "功能更全面，但需要家长管控" },
    ],
    buyAdvice: "建议先在线下体验店试用30分钟以上。确认孩子接受墨水屏刷新速度再入手。618/双11期间通常有300-500元优惠。如果只买来当阅读器，Kindle更划算。",
  },
  "戴森V15吸尘器": {
    score: 82,
    isIqTax: false,
    reason: "吸力强劲、激光探测灰尘是真实卖点，但溢价明显，适合对清洁有高要求的家庭。",
    pros: ["激光探测灰尘功能实用，肉眼看不见的灰尘也能发现", "吸力强劲且持久，电池衰减控制好", "配件丰富，适用场景多（地板/地毯/床褥/缝隙）", "LCD屏实时显示颗粒物数据，清洁效果可视化"],
    cons: ["售价4990元，是同类竞品的2-3倍", "重量偏重（2.6kg），长时间使用手腕疲劳", "集尘盒清理易扬尘", "滤网需定期清洗更换，后期成本不低"],
    businessModel: "品牌直营为主，线下门店+线上官方旗舰店。大量家居博主带货，佣金比例约3-8%。评测内容整体客观，少有虚假宣传。",
    commentAnalysis: "好评率约93%。高频好评词：吸力大、激光好用、宠物毛克星。高频差评词：贵、重、倒灰麻烦。差评中约20%是竞品水军痕迹（账号注册时间短、评价内容模板化）。",
    recommendation: "预算允许且家中有宠物或过敏人群，强烈推荐。追求性价比可考虑戴森V12或追觅等国产品牌。建议大促期间入手，价格可低至3500元左右。",
    analyzedAt: new Date().toISOString(),
    priceRange: "¥3499-4990",
    ratingDimensions: { cost: 55, quality: 95, safety: 92, experience: 88, afterSales: 70 },
    dataPoints: ["激光探测可发现肉眼看不见的微尘", "数字马达转速125,000rpm", "LCD屏实时显示吸入颗粒物大小和数量", "京东好评率93%", "电池续航约60分钟（标准模式）"],
    references: [
      { title: "英国过敏协会认证（Allergy UK）", url: "https://www.allergyuk.org/", type: "official" },
      { title: "爱否科技：12款无线吸尘器横评", url: "https://www.aifou.cn/", type: "test" },
      { title: "什么值得买用户实测：戴森V15半年使用报告", url: "https://www.smzdm.com/", type: "user_review" },
    ],
    suitableFor: ["养宠家庭", "过敏体质人群", "对清洁有高要求的家庭", "大面积铺地板的家庭"],
    notSuitableFor: ["预算紧张", "手腕力量较弱", "不常做家务的单身人士"],
    alternatives: [
      { name: "追觅V16S", price: "¥2599", score: 80, reason: "国产旗舰，吸力接近戴森，价格减半" },
      { name: "戴森V12 Detect Slim", price: "¥3290", score: 84, reason: "更轻更便宜，适合中小户型" },
    ],
    buyAdvice: "大促期间入手最划算（618/双11低至3499元）。养宠/过敏家庭一步到位选V15，普通家庭V12足够。建议官网注册延保，滤网每3-6个月清洗一次。",
  },
  "妙思乐润肤乳": {
    score: 85,
    isIqTax: false,
    reason: "法国药妆品牌，成分天然温和，适合婴幼儿敏感肌肤，医院推荐度高。",
    pros: ["含专利牛油果活源醣（Avocado Perseose），仿生皮脂膜专利", "无香精、无酒精、无防腐剂，过敏率极低", "法国产科医院推荐品牌，临床验证充分", "质地轻盈易推开，不油腻"],
    cons: ["国内售价偏高（150-200元/200ml），法国本土仅一半价格", "保湿持久度一般，冬天需搭配润肤霜使用", "假货泛滥，代购和海淘需谨慎"],
    businessModel: "品牌直营+跨境渠道并行。小红书种草内容密集，存在大量品牌合作推广。但产品本身经临床验证，非智商税。",
    commentAnalysis: "宝妈群体口碑极佳，好评集中在温和不过敏（约80%提及）。差评主要抱怨价格比欧洲贵一倍（海淘约80元）。少数差评提到泵头设计不好用。",
    recommendation: "新生儿和敏感肌宝宝首选。建议通过跨境电商自营或可靠法代购买，价格可省一半。如果预算有限，丝塔芙大白罐是更经济的替代方案。",
    analyzedAt: new Date().toISOString(),
    priceRange: "¥150-200",
    ratingDimensions: { cost: 60, quality: 90, safety: 96, experience: 85, afterSales: 62 },
    dataPoints: ["专利牛油果活源醣仿生皮脂膜技术", "法国产科医院推荐率第1", "0香精0酒精0防腐剂", "天猫好评率98%+", "小红书相关笔记5万+"],
    references: [
      { title: "法国国家药品安全局（ANSM）化妆品备案", url: "https://ansm.sante.fr/", type: "official" },
      { title: "丁香妈妈：12款婴儿润肤乳横评", url: "https://www.dxmm.com/", type: "test" },
      { title: "小红书：妙思乐全线产品使用心得", url: "https://www.xiaohongshu.com/", type: "user_review" },
    ],
    suitableFor: ["新生儿", "敏感肌宝宝", "湿疹倾向皮肤", "追求天然成分的家庭"],
    notSuitableFor: ["预算紧张", "大干皮（冬季需搭配润肤霜）"],
    alternatives: [
      { name: "丝塔芙大白罐", price: "¥79", score: 82, reason: "保湿力更强，价格不到一半，医院常用" },
      { name: "艾惟诺婴儿润肤乳", price: "¥89", score: 80, reason: "美国儿科医生推荐，燕麦成分舒缓好" },
    ],
    buyAdvice: "新生儿必备，建议跨境电商自营购买（约80-90元），比国内专柜便宜近一半。冬季搭配妙思乐润肤霜使用效果更佳。注意识别假货，认准防伪码。",
  },
  "斑马AI课年卡": {
    score: 62,
    isIqTax: true,
    reason: "AI互动课内容质量尚可但有过度营销嫌疑，年卡锁定后孩子兴趣转移风险高。",
    pros: ["动画互动设计精美，低龄儿童喜欢", "每天15分钟碎片化学习，时间压力小", "附赠配套教材礼盒，实物感不错"],
    cons: ["AI互动非真人教学，高阶思维引导不足", "年卡2800元锁定一年，孩子中途失去兴趣无法退款", "内容更新慢，重复率较高", "销售话术中「再不学就落后」制造焦虑"],
    businessModel: "猿辅导旗下品牌，典型的互联网烧钱获客模式。渠道佣金高达20-30%，大量宝妈群和育儿博主在分销体系内。推荐人往往夸大效果以换取佣金。",
    commentAnalysis: "好评多来自新用户（前1-2个月），差评集中在年卡退费难和孩子后期厌倦。约30%的用户表示使用3个月后孩子兴趣明显下降。疑似刷好评比例较高（评价ID可追溯至分销体系）。",
    recommendation: "建议先买月卡或季卡体验（约299元/月），确认孩子持续感兴趣再考虑年卡。不要被「限时优惠」和「别人都在学」的话术裹挟。如果只追求英语启蒙启蒙，免费的Khan Academy Kids质量更高。",
    analyzedAt: new Date().toISOString(),
    priceRange: "¥2800/年",
    ratingDimensions: { cost: 35, quality: 68, safety: 85, experience: 72, afterSales: 30 },
    dataPoints: ["渠道佣金高达20-30%", "30%用户使用3个月后兴趣明显下降", "退费需满足苛刻条件（打卡率>80%）", "年卡锁定后不可转让不可退"],
    references: [
      { title: "中国消费者协会2024在线教育投诉报告", url: "https://www.cca.cn/", type: "official" },
      { title: "知乎：斑马AI课是否值得买？", url: "https://www.zhihu.com/", type: "user_review" },
      { title: "B站UP主实测：6款AI启蒙课对比", url: "https://www.bilibili.com/", type: "test" },
    ],
    suitableFor: ["有时间监督的家长", "孩子自制力较好", "追求AI互动形式的低龄启蒙"],
    notSuitableFor: ["孩子兴趣不稳定", "预算紧张", "追求真人教学效果的家庭"],
    alternatives: [
      { name: "Khan Academy Kids", price: "免费", score: 88, reason: "全球最优质免费启蒙App，无商业化" },
      { name: "叽里呱啦AI课", price: "¥488/年", score: 72, reason: "价格更低，内容相似度高" },
    ],
    buyAdvice: "一定先试月卡！不要被销售话术和「限时优惠」裹挟。孩子持续喜欢再用月卡续费，算下来可能更划算。免费替代方案（Khan Academy Kids）效果更好。",
  },
  "科大讯飞学习机": {
    score: 78,
    isIqTax: false,
    reason: "AI精准学功能确实有技术壁垒，口语评测行业领先，但硬件配置和价格匹配度一般。",
    pros: ["AI个性化学习路径规划，精准定位薄弱知识点", "英语口语评测引擎国内领先，发音纠正效果好", "家长管控功能完善，无法安装游戏", "内置海量真题资源，覆盖中高考"],
    cons: ["T30 Pro售价高达8999元，堪比一台MacBook", "处理器性能一般，多任务切换偶有卡顿", "屏幕尺寸和分辨率不如同价位iPad", "低年龄段（小学）内容不够丰富"],
    businessModel: "品牌直营为主，教育渠道（学校/机构）合作量大。评测内容多为技术导向的理性分析，商业化痕迹不明显。部分教育博主为品牌合作推广。",
    commentAnalysis: "家长好评集中在精准学和口语评测（约65%），差评集中在价格过高和小学内容不足。整体好评率约90%。差评中约10%可能是竞品（步步高、小猿）的水军。",
    recommendation: "初中以上学生且偏科明显，推荐入手（T系列即可，不必上Pro）。小学生的需求用iPad+学习App就能满足。建议关注618/双11大促，通常有500-1000元优惠。",
    analyzedAt: new Date().toISOString(),
    priceRange: "¥4999-8999",
    ratingDimensions: { cost: 45, quality: 85, safety: 95, experience: 82, afterSales: 68 },
    dataPoints: ["AI精准学覆盖K12全学科知识图谱", "英语口语评测引擎通过CNAS认证", "内置500万+真题库", "家长管控可远程锁定设备", "京东好评率90%"],
    references: [
      { title: "教育部教育信息化2.0认证产品", url: "https://www.moe.gov.cn/", type: "official" },
      { title: "中关村在线：学习机年度横评", url: "https://www.zol.com.cn/", type: "test" },
      { title: "知乎家长实录：讯飞学习机一年使用体验", url: "https://www.zhihu.com/", type: "user_review" },
    ],
    suitableFor: ["初中以上学生", "偏科明显需要精准补弱", "需要英语口语训练的学生"],
    notSuitableFor: ["小学生", "预算紧张", "仅需要基础学习辅助"],
    alternatives: [
      { name: "小猿学练机", price: "¥3299", score: 75, reason: "墨水屏护眼，价格更低" },
      { name: "iPad + 学习App", price: "¥2599+", score: 80, reason: "更全面但需家长管控" },
    ],
    buyAdvice: "初中以上偏科生推荐入T系列（约4999元）即可，Pro版溢价主要是存储差异。小学生没必要买，iPad+App组合更灵活。大促期间通常优惠500-1000元。",
  },
  "步步高词典笔F6": {
    score: 76,
    isIqTax: false,
    reason: "OCR识别准确率高，离线可用，适合查单词和古文翻译，但功能单一性价比一般。",
    pros: ["OCR识别速度快（0.3秒），准确率98%+", "3.7寸大屏显示完整，不像旧款要翻页", "内置正版牛津/朗文词典，离线可用", "AI语法分析对英语作文批改有一定帮助"],
    cons: ["售价899元，功能不如同价位二手iPad丰富", "低龄孩子容易当玩具，学习效果打折扣", "英语作文批改偶尔有语法错误", "联网功能鸡肋，部分内容需要付费订阅"],
    businessModel: "品牌直营，线下教育渠道渗透率高。大量教育博主和老师推荐时附带专属链接（CPS佣金约10-15%）。",
    commentAnalysis: "家长好评集中在查词快和护眼，差评吐槽价格高和功能鸡肋。约20%用户表示孩子用了1-2周就闲置。",
    recommendation: "英语阅读量大（如国际学校学生）推荐买。普通家庭可先用手机词典App过渡，确认孩子持续需要再入手。",
    analyzedAt: new Date().toISOString(),
    priceRange: "¥799-899",
    ratingDimensions: { cost: 55, quality: 82, safety: 90, experience: 78, afterSales: 65 },
    dataPoints: ["OCR识别速度0.3秒，准确率98%+", "内置正版牛津高阶+朗文当代", "3.7寸大屏，无需翻页", "20%用户使用1-2周后闲置"],
    references: [
      { title: "教育部教育装备研究与发展中心推荐", url: "https://www.moe.gov.cn/", type: "official" },
      { title: "什么值得买：词典笔选购指南", url: "https://www.smzdm.com/", type: "user_review" },
      { title: "B站：8款词典笔实测横评", url: "https://www.bilibili.com/", type: "test" },
    ],
    suitableFor: ["英语阅读量大（国际学校/英语原版阅读）", "不喜欢用手机查单词的学生", "古文翻译需求"],
    notSuitableFor: ["偶尔查单词", "自制力差容易被分心的孩子", "预算紧张"],
    alternatives: [
      { name: "手机词典App（欧路/有道）", price: "免费", score: 85, reason: "功能全面且免费，手机随时可用" },
      { name: "网易有道词典笔X7", price: "¥699", score: 78, reason: "性价比更高，功能相似" },
    ],
    buyAdvice: "英语阅读量大的学生可以考虑。但建议先用手机词典App使用2周，确认查词频率高再入手。闲鱼二手约500元更划算。",
  },
  "倾听者K9复读机": {
    score: 82,
    isIqTax: false,
    reason: "专为语言学习设计，断句复读和变速播放是核心卖点，英语启蒙神器但功能单一。",
    pros: ["断句复读功能精准，逐句跟读训练效果好", "变速播放不跑调，0.5x-2.0x无级调节", "资源库丰富（RAZ、牛津树等内置）", "无游戏无社交，家长放心给孩子"],
    cons: ["售价698元，本质上是个MP3播放器", "屏幕小（2寸），操作不够流畅", "传文件需用专用软件，不如手机方便", "不支持蓝牙耳机，只能用有线"],
    businessModel: "品牌直营为主，英语启蒙博主和培训机构的推荐力度极大（佣金约15-20%）。存在过度渲染'磨耳朵'理论的情况。",
    commentAnalysis: "好评集中在英语提升效果明显（约70%），差评集中在价格和操作不便。妈妈群口碑极好但有些'被种草'过度的嫌疑。",
    recommendation: "家庭若有英语启蒙需求（4-10岁），强烈推荐。大孩子可直接用手机App替代。建议闲鱼淘二手（约400元），性价比更高。",
    analyzedAt: new Date().toISOString(),
    priceRange: "¥598-698",
    ratingDimensions: { cost: 62, quality: 85, safety: 92, experience: 72, afterSales: 68 },
    dataPoints: ["变速播放0.5x-2.0x不跑调", "内置RAZ+牛津树+海尼曼全套资源", "无游戏无社交，纯粹学习工具", "英语启蒙博主推荐率90%+"],
    references: [
      { title: "中国英语阅读教育研究院推荐", url: "https://www.chinareading.org/", type: "expert" },
      { title: "小花生网：磨耳朵设备横评", url: "https://www.xiaohuasheng.cn/", type: "test" },
      { title: "妈妈群实测：倾听者K9半年使用报告", url: "https://www.xiaohongshu.com/", type: "user_review" },
    ],
    suitableFor: ["4-10岁英语启蒙阶段", "需要无游戏学习环境的家庭", "有大量英语听力输入需求"],
    notSuitableFor: ["10岁以上（可用手机替代）", "需要蓝牙耳机的用户", "追求多功能设备"],
    alternatives: [
      { name: "旧手机+英语App", price: "免费（闲置利用）", score: 78, reason: "功能更全，但需家长管控" },
      { name: "牛听听超记牛", price: "¥499", score: 76, reason: "资源更多但操作更复杂" },
    ],
    buyAdvice: "4-10岁英语启蒙强烈推荐，是真正有用的磨耳朵工具。建议闲鱼淘二手（约400元），性价比极高。大孩子可以直接用手机App替代。",
  },
  "宜家安迪洛高脚餐椅": {
    score: 91,
    isIqTax: false,
    reason: "设计经典、安全可靠、价格良心（99元），全球销量最好的婴儿餐椅之一。",
    pros: ["极简设计，无卫生死角，一擦即净", "三点式安全带+胯部挡柱，安全性好", "可叠放收纳，不占空间", "仅售99元，性价比天花板"],
    cons: ["不可折叠，外出不便", "没有脚踏板和餐盘（需另购），部分宝宝不舒服", "建议搭配充气垫使用（小月龄宝宝支撑不够）"],
    businessModel: "宜家自营，无分销体系。推荐者几乎无佣金动机，是纯粹的性价比之选。",
    commentAnalysis: "好评率超过98%，被宝妈称为'必入单品'。差评极少，主要集中在不可折叠和餐盘另购不划算。",
    recommendation: "强烈推荐！99元能用2-3年，性价比无敌。搭配宜家79元的餐盘垫，一套不到180元搞定。唯一遗憾是不方便携带外出。",
    analyzedAt: new Date().toISOString(),
    priceRange: "¥99",
    ratingDimensions: { cost: 98, quality: 88, safety: 92, experience: 85, afterSales: 80 },
    dataPoints: ["全球年销量超过1000万台", "三点式安全带通过EN14988欧洲标准", "仅售99元，成本仅比麦当劳开心乐园餐贵一点", "可叠放设计节省80%收纳空间", "宝妈推荐率98%+"],
    references: [
      { title: "欧盟EN14988儿童高脚椅安全标准认证", url: "https://ec.europa.eu/", type: "official" },
      { title: "What to Expect：2024最佳婴儿高脚椅", url: "https://www.whattoexpect.com/", type: "expert" },
      { title: "知乎：宜家安迪洛为什么被宝妈疯抢？", url: "https://www.zhihu.com/", type: "user_review" },
    ],
    suitableFor: ["所有有婴儿的家庭", "小户型", "追求极简设计的家庭", "预算理性消费"],
    notSuitableFor: ["需要外出携带餐椅的家庭", "家里空间充足且追求多功能"],
    alternatives: [
      { name: "Peg Perego Siesta", price: "¥1799", score: 80, reason: "多功能可折叠，但价格是18倍" },
      { name: "Stokke Tripp Trapp", price: "¥1990", score: 85, reason: "成长椅设计可用到成人，但价格高" },
    ],
    buyAdvice: "闭眼入！99元是婴儿用品中真正的性价比天花板。搭配79元餐盘垫，总花费不到180元。不喜欢可退货，宜家退货政策好。唯一遗憾是不可折叠。",
  },
  "Babycare婴儿腰凳": {
    score: 72,
    isIqTax: false,
    reason: "解放双手的带娃神器，但价格虚高，国产平替质量差距不大。",
    pros: ["EPP硬挺座垫提供有效支撑，不塌不软", "M型坐姿设计符合髋关节发育标准", "透气面料夏天不闷热", "收纳口袋方便放手机钥匙"],
    cons: ["售价300-400元，国产平替不足100元", "宝宝面朝内时腿部偶尔磨红", "使用周期短（6-18个月为主），性价比存疑", "清洗后晾干慢，建议买两条替换"],
    businessModel: "品牌直营+母婴博主种草模式。小红书和抖音推广力度极大，CPS佣金约15-25%，部分博主夸大产品与平替的差异。",
    commentAnalysis: "好评集中在解放双手（约85%），差评集中在价格和使用周期短。横向对比显示三美婴等国产平替（90元）评价接近。",
    recommendation: "有频繁带娃出行需求推荐入。追求性价比可买三美婴等国产平替（质量差异不大）。建议二手平台收一个（100元左右），使用半年转卖也亏不多。",
    analyzedAt: new Date().toISOString(),
    priceRange: "¥299-399",
    ratingDimensions: { cost: 50, quality: 78, safety: 85, experience: 75, afterSales: 65 },
    dataPoints: ["EPP硬挺座垫，支撑力达30kg", "M型坐姿符合IHDI髋关节发育标准", "小红书相关笔记10万+", "国产平替价格仅1/3（约90元）"],
    references: [
      { title: "国际髋关节发育不良研究所（IHDI）标准", url: "https://hipdysplasia.org/", type: "official" },
      { title: "丁香妈妈：婴儿腰凳选购指南", url: "https://www.dxmm.com/", type: "expert" },
      { title: "什么值得买：Babycare vs 三美婴实测对比", url: "https://www.smzdm.com/", type: "user_review" },
    ],
    suitableFor: ["频繁带娃外出", "6-18个月宝宝", "追求品牌质感的家庭"],
    notSuitableFor: ["偶尔使用", "预算紧张", "宝宝超过18个月"],
    alternatives: [
      { name: "三美婴婴儿腰凳", price: "¥89", score: 70, reason: "性价比极高，质量差异不大" },
      { name: "ergobaby 二狗背带", price: "¥899", score: 82, reason: "专业级人体工学，但价格更高" },
    ],
    buyAdvice: "使用频率高就值得买。如果只是偶尔外出，三美婴等国产平替90元也不错。建议闲鱼收二手（约100元），使用半年转卖也不亏。别囤两条，一条够用。",
  },
  "小天才电话手表Z10": {
    score: 65,
    isIqTax: true,
    reason: "社交壁垒形成的刚需产品，但溢价严重，功能本质上是GPS+微信。",
    pros: ["定位精准（双频GPS+楼层定位），家长安心", "碰一碰加好友功能，社交体验好", "防水防尘，孩子日常佩戴耐造", "上课禁用和家长管控功能完善"],
    cons: ["售价1999元起，硬件成本不足500元", "碰一碰交友形成品牌壁垒，不用小天才=在班里被孤立", "游戏和学习App限制多，实用性不如旧手机", "电池续航一般（1-1.5天），频繁充电"],
    businessModel: "品牌直营+线下代理，利用孩子的社交需求形成垄断。家长被迫购买不是因为产品好而是因为'大家都在用'。",
    commentAnalysis: "好评集中在家长安心（定位+通话），差评集中在价格和社交壁垒带来的被迫消费。约40%的家长明确表示是被孩子'胁迫'购买。",
    recommendation: "如果全班都在用且孩子确实需要社交，买个入门款（约500元）足够。不建议买顶配，隔壁360、华为同价位功能更多但社交圈不在。核心是社交壁垒，不是技术壁垒。",
    analyzedAt: new Date().toISOString(),
    priceRange: "¥499-1999",
    ratingDimensions: { cost: 25, quality: 72, safety: 88, experience: 70, afterSales: 75 },
    dataPoints: ["硬件成本不足500元，售价1999元起", "碰一碰交友形成社交壁垒", "40%家长是被孩子「胁迫」购买", "市场份额超过50%，近乎垄断", "定位精度达到楼层级别"],
    references: [
      { title: "环球网：儿童手表社交壁垒调查", url: "https://www.huanqiu.com/", type: "expert" },
      { title: "36氪：小天才的社交护城河", url: "https://36kr.com/", type: "expert" },
      { title: "知乎家长热议：小天才值得买吗？", url: "https://www.zhihu.com/", type: "user_review" },
    ],
    suitableFor: ["全班都在用小天才的孩子（社交刚需）", "需要精准定位+通话功能"],
    notSuitableFor: ["同学用其他品牌（社交圈不重叠）", "预算紧张", "仅需基础定位"],
    alternatives: [
      { name: "小天才入门款 D3", price: "¥499", score: 72, reason: "核心功能都有，价格仅1/4" },
      { name: "华为儿童手表5X", price: "¥698", score: 75, reason: "功能更强但社交圈不同" },
    ],
    buyAdvice: "如果全班都用，买个入门款（D3约499元）就够了。不要为「更好的配置」付智商税，核心功能都一样。如果班里不流行小天才，360和华为更好。核心问题是社交壁垒，不是产品本身。",
  },
  "德国宝得适双面骑士安全座椅": {
    score: 86,
    isIqTax: false,
    reason: "德国安全标准，360度旋转是实用功能，价格3000+但安全系数值得投入。",
    pros: ["ADAC碰撞测试历年高分，安全性能过硬", "360度旋转方便放置孩子，腰不用弯", "ISOFIX+支撑腿安装，稳固不晃", "0-4岁阶段可用，使用周期合理"],
    cons: ["售价3500元左右，国产通过同样认证的约1500元", "坐垫偏硬，长途宝宝偶尔抗拒", "体积偏大，小型车后排占空间", "布套拆洗较复杂"],
    businessModel: "品牌直营+授权经销。母婴博主推荐多为真实体验分享（产品本身过硬），佣金比例约5-8%。",
    commentAnalysis: "好评集中在安全感和旋转功能，差评集中在价格和体积。整体好评率94%。关于二手安全座椅的风险需注意（碰撞后内部结构可能受损）。",
    recommendation: "预算允许强烈推荐，安全无价。性价比可选惠尔顿、宝贝第一等国产品牌（同标准价格减半）。警惕二手安全座椅，碰撞历史不可查。",
    analyzedAt: new Date().toISOString(),
    priceRange: "¥2999-3899",
    ratingDimensions: { cost: 55, quality: 95, safety: 98, experience: 88, afterSales: 72 },
    dataPoints: ["ADAC碰撞测试历年评分「Gut」（优秀）", "通过欧盟ECE R129（i-Size）最新标准", "360度旋转单手操作", "京东好评率94%", "0-4岁使用寿命合理"],
    references: [
      { title: "德国ADAC 2024儿童安全座椅测试报告", url: "https://www.adac.de/", type: "official" },
      { title: "欧盟ECE R129（i-Size）安全标准", url: "https://ec.europa.eu/", type: "official" },
      { title: "汽车之家：20款安全座椅横评", url: "https://www.autohome.com.cn/", type: "test" },
    ],
    suitableFor: ["0-4岁宝宝", "经常独自带娃开车的家长", "对安全性有极致要求的家庭", "有360度旋转需求的家庭"],
    notSuitableFor: ["预算紧张", "小型车后排空间小", "宝宝超过4岁"],
    alternatives: [
      { name: "惠尔顿智转Pro", price: "¥1599", score: 82, reason: "同标准认证，价格不到一半" },
      { name: "宝贝第一灵悦Pro", price: "¥1899", score: 83, reason: "中国品牌，ADAC评分同样优秀" },
    ],
    buyAdvice: "安全无价，预算允许强烈推荐。但同标准的国产惠尔顿、宝贝第一（1500元左右）同样是优秀选择。千万不要买二手安全座椅，碰撞历史不可查可能导致内部结构损伤。",
  },
  "iEnglish类母语训练系统": {
    score: 42,
    isIqTax: true,
    reason: "高昂售价+强制性学习模式+社交裂变营销，核心是泛读概念包装，性价比极低。",
    pros: ["海量英语分级读物，内容够多", "Pad硬件锁定无游戏，家长管控好", "跟读评分功能有时能纠正发音"],
    cons: ["售价高达7880元！硬件成本不超800元", "强制的'听读时间'抹杀阅读乐趣", "裂变营销模式涉嫌传销（推荐他人购买获佣金）", "阅读内容偏机械跟读，缺乏理解力训练", "英语教育界普遍不认可其教学理念"],
    businessModel: "典型的社交裂变+高价策略。用户既是消费者也是分销商，推荐他人购买可获得高额佣金（10-25%），商业模式接近微商。",
    commentAnalysis: "好评多来自代理商或刚买的新用户（被'打卡群体'氛围裹挟），差评集中在价格、营销模式和实际效果存疑。知乎/B站等平台上，英语教育专业人士几乎一致批评。",
    recommendation: "强烈不推荐。同样的7880元可以买一台iPad+全套RAZ账号+Khan Academy Kids（全部免费），效果远超iEnglish。不要被'别人家都在用'和打卡氛围裹挟。",
    analyzedAt: new Date().toISOString(),
    priceRange: "¥7880",
    ratingDimensions: { cost: 10, quality: 55, safety: 80, experience: 42, afterSales: 20 },
    dataPoints: ["售价7880元，硬件成本不足800元", "裂变分销佣金10-25%（接近微商模式）", "被英语教育界专业人士一致批评", "知乎/B站负面评价占比80%+", "RAZ同类资源订阅仅需100元/年"],
    references: [
      { title: "中国消费者协会2024在线教育投诉报告", url: "https://www.cca.cn/", type: "official" },
      { title: "知乎英语教育话题：iEnglish真的有用吗？", url: "https://www.zhihu.com/", type: "expert" },
      { title: "B站英语UP主揭底：iEnglish营销套路", url: "https://www.bilibili.com/", type: "test" },
    ],
    suitableFor: [],
    notSuitableFor: ["所有人", "尤其是容易被营销话术裹挟的家长"],
    alternatives: [
      { name: "iPad + RAZ + Khan Academy Kids", price: "¥2599+100/年", score: 95, reason: "效果远超iEnglish，英语教育界公认" },
      { name: "ABC Reading（学而思）", price: "¥388/年", score: 82, reason: "专业分级阅读，无社交裂变" },
    ],
    buyAdvice: "强烈不推荐！7880元买一个被英语教育界一致批评的产品。同样的钱买iPad+全套RAZ+Khan Academy Kids，效果碾压iEnglish。不要被打卡氛围和「别人家都在用」裹挟。",
  },
  "戴可思婴儿面霜": {
    score: 78,
    isIqTax: false,
    reason: "老爸评测带火的国产母婴护肤品牌，成分透明、价格亲民，替代国外大牌的高性价比选择。",
    pros: ["成分全公开，无香精无激素，第三方检测可查", "价格亲民（约50元），远低于进口品牌", "金盏花系列舒缓效果好，口水疹有改善", "老爸评测公信力背书，信任度高"],
    cons: ["部分批次品控不稳定，质地有时偏稀", "品牌过度依赖老爸评测背书，存在单一渠道风险", "保湿持久度中等，干皮冬天不够滋润", "线上下渠道价格不一致，常有背刺感"],
    businessModel: "老爸评测成立之初就深度绑定，涉嫌既是裁判又是运动员。商城直营+各电商平台授权。评测推荐人（老爸评测）既是评测方又是销售方，利益冲突明显。",
    commentAnalysis: "好评集中在性价比和成分安全，差评集中在保湿力不足和渠道价格混乱。整体好评率约92%。差评中有部分竞品水军痕迹（Aveeno等进口品牌）。",
    recommendation: "性价比之选，新生儿和敏感肌可用。如果宝宝皮肤没有特殊问题，50元的面霜足够日常使用，没必要买200+的进口品牌。冬天可搭配凡士林晶冻加强保湿。",
    analyzedAt: new Date().toISOString(),
    priceRange: "¥49-69",
    ratingDimensions: { cost: 88, quality: 75, safety: 85, experience: 72, afterSales: 65 },
    dataPoints: ["成分全公开，第三方检测SGS可查", "价格不到进口品牌的1/3", "老爸评测背书，天猫好评率92%", "金盏花舒缓系列对口水疹有明显改善"],
    references: [
      { title: "老爸评测实验室检测报告", url: "https://www.laobapingce.com/", type: "test" },
      { title: "国家药监局化妆品备案信息", url: "https://www.nmpa.gov.cn/", type: "official" },
      { title: "小红书：戴可思全线产品使用报告", url: "https://www.xiaohongshu.com/", type: "user_review" },
    ],
    suitableFor: ["新生儿", "敏感肌宝宝", "追求性价比", "口水疹护理"],
    notSuitableFor: ["大干皮（冬季不够滋润）", "不信任老爸评测背书体系的用户"],
    alternatives: [
      { name: "妙思乐润肤乳", price: "¥150", score: 85, reason: "法国药妆品牌，临床验证更充分" },
      { name: "丝塔芙大白罐", price: "¥79", score: 82, reason: "保湿力更强，医院常用" },
    ],
    buyAdvice: "50元的价格非常良心，新生儿和敏感肌可以闭眼入。但留意老爸评测背书这一单一渠道风险。冬天搭配凡士林晶冻（¥15）加强保湿，总花费不到70元。",
  },
  "babygo儿童爬行垫": {
    score: 84,
    isIqTax: false,
    reason: "XPE材质安全无毒，图案好看价格合理，国产爬行垫的标杆品牌。",
    pros: ["XPE材质通过SGS检测，甲酰胺含量低于国标", "双面图案设计，一面动物一面字母（可用更久）", "回弹好，缓冲效果佳，学步期摔倒不疼", "易清洁，一擦即净"],
    cons: ["折叠款拼接处易藏灰，建议买整体卷款", "部分花色印刷有轻微异味（需通风晾晒2天）", "防滑一般，地板砖上容易滑动（需搭配防滑垫）"],
    businessModel: "品牌直营+电商分销。母婴博主推荐多为真实体验，佣金比例5-10%。产品本身口碑好，营销水分小。",
    commentAnalysis: "好评率96%+。好评集中在安全无异味和图案好看，差评极少且多为个人偏好问题。横向对比贝易、澳乐等竞品，babygo在安全测试中排名更靠前。",
    recommendation: "强烈推荐。爬行垫是宝宝天天接触的产品，安全性第一，babygo在这点上做得很好。200元左右用2-3年，每天成本不到2毛钱。",
    analyzedAt: new Date().toISOString(),
    priceRange: "¥159-259",
    ratingDimensions: { cost: 82, quality: 88, safety: 92, experience: 85, afterSales: 70 },
    dataPoints: ["XPE材质甲酰胺含量<20mg/kg（国标<200mg/kg）", "SGS第三方检测认证", "双面设计可用2-3年", "天猫好评率96%+", "回弹缓冲效果好，保护学步期宝宝"],
    references: [
      { title: "SGS检测报告（甲酰胺/甲醛/重金属）", url: "https://www.sgs.com/", type: "official" },
      { title: "国家玩具安全标准GB 6675认证", url: "https://www.sac.gov.cn/", type: "official" },
      { title: "丁香妈妈：爬行垫选购终极指南", url: "https://www.dxmm.com/", type: "expert" },
    ],
    suitableFor: ["所有有爬行期/学步期宝宝的家庭", "注重安全的家庭", "需要双面设计延长使用"],
    notSuitableFor: ["家里地板砖光滑（需额外防滑垫）"],
    alternatives: [
      { name: "贝易爬行垫", price: "¥139", score: 80, reason: "价格更低，安全测试略逊" },
      { name: "澳乐爬行垫", price: "¥169", score: 79, reason: "图案丰富但材质略硬" },
    ],
    buyAdvice: "强烈推荐！爬行垫天天接触宝宝皮肤，安全性第一。建议买整体卷款（不要折叠款），避免拼接处藏灰。200元左右用2-3年，每天成本不到2毛钱。",
  },
};

/* ===== 评分颜色 ===== */
function scoreColor(s: number): string {
  if (s >= 85) return "#10B981";
  if (s >= 70) return "#22C55E";
  if (s >= 55) return "#F59E0B";
  if (s >= 40) return "#F97316";
  return "#EF4444";
}

/* ===== 页面 ===== */
const WorthBuyPage: React.FC = () => {
  const token = useSelector((state: RootState) => state.user.token);
  const navigate = useNavigate();
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>(loadHistory);
  const [showHistory, setShowHistory] = useState(false);
  const [userSubmissions, setUserSubmissions] = useState<HistoryItem[]>([]);
  const [deletingBrand, setDeletingBrand] = useState<string | null>(null);

  const resultRef = useRef<HTMLDivElement>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const userId = useMemo(() => {
    let id = localStorage.getItem("xianfeng_user_id");
    if (!id) {
      id = "user_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      localStorage.setItem("xianfeng_user_id", id);
    }
    return id;
  }, []);

  /* 加载用户提交列表 */
  const fetchMySubmissions = useCallback(async () => {
    try {
      const resp = await fetch(`/api/worthbuy/my?userId=${encodeURIComponent(userId)}`);
      if (!resp.ok) return;
      const data = await resp.json();
      const items: HistoryItem[] = (data.items || []).map((item: any) => ({
        query: item.brand || item.query || "",
        url: item.result?.url || null,
        brand: item.brand || null,
        result: item.result || {} as AnalysisResult,
        createdAt: item.createdAt || new Date().toISOString(),
      }));
      setUserSubmissions(items);
    } catch {}
  }, [userId]);

  useEffect(() => { fetchMySubmissions(); }, [fetchMySubmissions]);

  /* 删除用户提交 */
  const deleteSubmission = async (brand: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("确定要删除这条分析记录吗？")) return;
    setDeletingBrand(brand);
    try {
      const resp = await fetch(`/api/worthbuy/my/${encodeURIComponent(brand)}`, { method: "DELETE" });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      setUserSubmissions((prev) => prev.filter((s) => s.brand !== brand));
    } catch (err: any) {
      alert("删除失败: " + (err.message || "未知错误"));
    } finally {
      setDeletingBrand(null);
    }
  };

  /* 清理轮询 */
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  /* 保存一条到历史 */
  const saveToHistory = useCallback((query: string, res: AnalysisResult) => {
    const item: HistoryItem = {
      query,
      url: res.url || null,
      brand: res.brand || null,
      result: res,
      createdAt: new Date().toISOString(),
    };
    setHistory((prev) => {
      const next = [item, ...prev.filter((h) => h.query !== query)].slice(0, MAX_HISTORY);
      saveHistory(next);
      return next;
    });
  }, []);

  // 保存到后端（draft 状态，仅自己可见）
  const saveToBackend = useCallback(async (brand: string, query: string, result: AnalysisResult) => {
    try {
      const resp = await fetch("/api/worthbuy/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand, query, result, submittedBy: userId }),
      });
      if (resp.status === 409) {
        // 已存在，忽略
      } else if (!resp.ok) {
        console.warn("保存到后端失败:", await resp.text());
      }
    } catch (e) {
      console.warn("保存到后端异常:", e);
    }
  }, [userId]);

  /* 调用 API — 3 步流程 */
  const analyze = useCallback(async () => {
    const isLoggedIn = !!token || !!localStorage.getItem("token");
    if (!isLoggedIn) {
      document.dispatchEvent(new CustomEvent("xf-show-login-modal", { detail: { title: "登录后即可分析", description: "登录后可使用品牌分析功能，获取个性化消费建议。" } }));
      return;
    }
    const trimmed = input.trim();
    if (!trimmed) return;
    setError(null);
    
    // 停止之前的轮询
    if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
    
    // 1️⃣ 先查 DEMO_DATA（预置示例）
    const demoHit = DEMO_DATA[trimmed];
    if (demoHit) {
      setResult(demoHit);
      setLoading(false);
      saveToHistory(trimmed, demoHit);
      saveToBackend(trimmed, trimmed, demoHit).catch(() => {});
      fetchMySubmissions();
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
      return;
    }

    // 2️⃣ 再查历史记录
    const historyHit = history.find((h) => h.query === trimmed);
    if (historyHit) {
      setResult(historyHit.result);
      setLoading(false);
      saveToBackend(trimmed, trimmed, historyHit.result).catch(() => {});
      fetchMySubmissions();
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
      return;
    }

    // 3️⃣ 都没有 → 调 API 提交分析
    setLoading(true);
    setResult(null);
    try {
      const isUrl = /^https?:\/\//i.test(trimmed);
      const body: Record<string, string> = {};

      // 从淘宝分享文案中提取商品标题
      const shareTitleMatch = trimmed.match(/【淘宝】[^【]*?「([^」]+)」/);
      const extractedTitle = shareTitleMatch ? shareTitleMatch[1].trim() : "";

      if (isUrl) {
        body.url = trimmed;
        // 如果有提取到的标题，一并传给后端
        if (extractedTitle) {
          (body as any).extractedTitle = extractedTitle;
        }
      } else {
        body.brand = trimmed;
      }

      // 步骤 A: POST /api/worthbuy/submit
      const submitBody = { ...body, submittedBy: userId };
      const submitResp = await fetch("/api/worthbuy/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(submitBody),
      });
      const submitData = await submitResp.json();

      if (!submitResp.ok) {
        throw new Error(submitData?.error || `提交失败 (${submitResp.status})`);
      }

      // 步骤 B: 如果直接返回了结果（已有收录），直接展示
      if (submitData.score !== undefined && submitData.score !== null) {
        setResult(submitData);
        setError(null);
        setLoading(false);
        saveToHistory(trimmed, submitData);
        saveToBackend(trimmed, trimmed, submitData).catch(() => {});
        fetchMySubmissions();
        setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
        return;
      }

      // 步骤 C: 排队中 → 开始轮询
      const requestId = submitData.request_id;
      const brand = submitData.brand || trimmed;
      let elapsed = 0;
      const POLL_INTERVAL = 3000;
      const MAX_POLL = 60000;

      pollingRef.current = setInterval(async () => {
        elapsed += POLL_INTERVAL;
        
        try {
          const checkResp = await fetch(
            `/api/worthbuy/check?brand=${encodeURIComponent(brand)}&request_id=${requestId}`
          );
          const checkData = await checkResp.json();

          if (checkData.status === "done" && checkData.result) {
            // 分析完成！
            if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
            setResult(checkData.result);
            setError(null);
            setLoading(false);
            saveToHistory(trimmed, checkData.result);
            saveToBackend(trimmed, trimmed, checkData.result).catch(() => {});
            setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
          } else if (checkData.status === "failed") {
            // 分析失败
            if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
            setError("分析失败，请稍后重试");
            setLoading(false);
          } else if (elapsed >= MAX_POLL) {
            // 超时
            if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
            setError(null);
            setResult(null);
            setLoading(false);
          }
        } catch {
          // 轮询出错，继续等待
          if (elapsed >= MAX_POLL) {
            if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
            setError(null);
            setResult(null);
            setLoading(false);
          }
        }
      }, POLL_INTERVAL);

    } catch (e: any) {
      setError(e?.message || "请求失败，请检查网络后重试");
      setResult(null);
      setLoading(false);
    }
  }, [input, saveToHistory, saveToBackend, history]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !loading) analyze();
  };

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem(HISTORY_KEY);
  };

  /* 点击历史项回显 */
  const pickHistory = (item: HistoryItem) => {
    navigate(`/worthbuy/${encodeURIComponent(item.query)}`, { state: { result: item.result, query: item.query } });
  };

  /* 示例点击 */
  const demoAnalyze = useCallback((query: string) => {
    const isLoggedIn = !!token || !!localStorage.getItem("token");
    if (!isLoggedIn) {
      document.dispatchEvent(new CustomEvent("xf-show-login-modal", { detail: { title: "登录后即可分析", description: "登录后可使用品牌分析功能，获取个性化消费建议。" } }));
      return;
    }
    setInput(query);
    setError(null);
    setLoading(false);
    const demoResult = DEMO_DATA[query];
    if (demoResult) {
      setResult(demoResult);
      saveToHistory(query, demoResult);
      saveToBackend(query, query, demoResult).catch(() => {});
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    }
  }, [token, setInput, setError, setResult]);

  return (
    <div className="worthbuy-page" style={{ minHeight: "100vh", background: "#f8f6ff" }}>
      <GlobalPublicNav showPlanningEntry={true} />

      {/* ===== Hero 区域 ===== */}
      <main className="worthbuy-hero mx-auto max-w-7xl px-4 pt-[76px] pb-2 sm:px-6 lg:px-8">
        <section className="overflow-hidden rounded-[2rem] border border-[#d8d0ef] p-7 shadow-[0_24px_80px_rgba(80,62,125,0.1)] sm:p-9" style={{ background: "radial-gradient(circle at 85% 15%, rgba(143,100,255,0.1), transparent 38%), linear-gradient(135deg, #f4f1fd 0%, #faf8ff 48%, #f0ebff 100%)" }}>
          <div className="max-w-3xl mx-auto text-center">
            <div className="inline-flex rounded-full border border-[#cfc2ef] bg-[#f3eefc] px-4 py-1 text-[11px] font-black uppercase tracking-[0.26em] text-[#5b3fa1]">
              Value Check
            </div>
            <h1 className="mt-4 text-3xl font-black leading-tight tracking-tight text-[#2b1a3a] sm:text-5xl">
              知物
            </h1>
            <p className="mt-3 text-sm leading-7 text-[#6f62a3] sm:text-base">
              输入商品链接或品牌名称，AI 帮你深度分析值不值得买，看穿消费迷雾
            </p>
          </div>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <label
              className="flex h-12 flex-1 items-center gap-2 rounded-2xl border border-[#d8d0ef] bg-white px-4 shadow-sm"
              style={{ transition: "border-color 0.2s" }}
              onFocus={(e) => { e.currentTarget.style.borderColor = "#7C3AED"; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "#d8d0ef"; }}
            >
              <span className="material-symbols-outlined text-[#8f7bd6]">search</span>
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="粘贴商品链接或输入品牌名称…"
                disabled={loading}
                className="w-full border-0 bg-transparent text-sm outline-none ring-0 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
                style={{ fontSize: 14, color: "#1E1B4B", minWidth: 0, borderBottom: "none", WebkitAppearance: "none", appearance: "none" }}
              />
            </label>
            <button
              onClick={analyze}
              disabled={loading || !input.trim()}
              className="inline-flex h-12 items-center justify-center rounded-2xl px-6 text-sm font-bold !text-white transition disabled:opacity-50"
              style={{
                background: loading || !input.trim()
                  ? "#D1D5DB"
                  : "linear-gradient(135deg, #7C3AED, #A855F7)",
                border: "none",
                cursor: loading || !input.trim() ? "not-allowed" : "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {loading ? (
                <>
                  <span className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-[2px] border-white border-t-transparent" />
                  分析中…
                </>
              ) : (
                "开始分析"
              )}
            </button>
          </div>
        </section>
      </main>

      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 20px" }}>
        {/* 用户提交卡片 */}
        {userSubmissions.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <p style={{ fontSize: 12, color: "#9CA3AF", margin: "0 0 10px", textAlign: "center" }}>
              📝 你的分析记录 <span style={{ fontSize: 10, color: "#C4B5FD" }}>（hover 可删除）</span>
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8 }}>
              {userSubmissions.map((item) => (
                <button
                  key={item.query}
                  onClick={() => {
                    setResult(item.result);
                    setInput(item.query);
                    setError(null);
                    setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
                  }}
                  className="group worthbuy-submission-card"
                  style={{
                    position: "relative",
                    textAlign: "left",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "10px 12px",
                    background: "linear-gradient(135deg, #FFFBEB, #FFF7ED)",
                    border: "1.5px solid #FDE68A",
                    borderRadius: 14,
                    cursor: "pointer",
                    transition: "all 0.2s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#F59E0B"; e.currentTarget.style.boxShadow = "0 4px 16px rgba(245,158,11,0.15)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#FDE68A"; e.currentTarget.style.boxShadow = "none"; }}
                >
                  {/* 评分小圆 */}
                  <div style={{
                    width: 32, height: 32, borderRadius: "50%",
                    background: `conic-gradient(${scoreColor(item.result.score)} ${item.result.score * 3.6}deg, #F3F0FF 0deg)`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0, fontSize: 12, fontWeight: 800,
                    color: scoreColor(item.result.score),
                  }}>
                    {item.result.score}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 12, fontWeight: 600, color: "#92400E", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {item.query}
                    </p>
                    <p style={{ fontSize: 10, color: "#B45309", margin: "1px 0 0" }}>
                      {item.result.isIqTax ? "🚨 智商税" : "✅ 非智商税"} · {new Date(item.createdAt).toLocaleDateString("zh-CN")}
                    </p>
                  </div>
                  {/* 删除按钮 */}
                  <button
                    className="worthbuy-close-btn"
                    onClick={(e) => deleteSubmission(item.brand || item.query, e)}
                    disabled={deletingBrand === (item.brand || item.query)}
                    title="删除此分析"
                    style={{
                      position: "absolute", top: 4, right: 4,
                      width: 18, height: 18, borderRadius: "50%",
                      border: "none", background: "rgba(0,0,0,0.04)", color: "#9CA3AF",
                      fontSize: 10, fontWeight: 700, lineHeight: "18px", textAlign: "center",
                      cursor: deletingBrand === (item.brand || item.query) ? "default" : "pointer",
                      opacity: deletingBrand === (item.brand || item.query) ? 0.3 : 0,
                      transition: "opacity 0.15s, background 0.15s",
                      pointerEvents: "none",
                      padding: 0,
                    }}
                    onMouseEnter={(e) => {
                      if (deletingBrand !== (item.brand || item.query)) {
                        e.currentTarget.style.background = "rgba(239,68,68,0.12)";
                        e.currentTarget.style.color = "#EF4444";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (deletingBrand !== (item.brand || item.query)) {
                        e.currentTarget.style.background = "rgba(0,0,0,0.04)";
                        e.currentTarget.style.color = "#9CA3AF";
                      }
                    }}
                  >
                    {deletingBrand === (item.brand || item.query) ? "⌛" : "✕"}
                  </button>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 示例卡片 */}
        <div style={{ marginTop: 20 }}>
          <p style={{ fontSize: 12, color: "#9CA3AF", margin: "0 0 10px", textAlign: "center" }}>
            👇 点击示例快速体验
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
            {[{ q: "贝亲宽口径奶瓶", icon: "🍼", tag: "母婴" },
              { q: "宜家安迪洛高脚餐椅", icon: "🪑", tag: "性价比神" },
              { q: "babygo儿童爬行垫", icon: "🧩", tag: "母婴" },
              { q: "Babycare婴儿腰凳", icon: "👶", tag: "母婴" },
              { q: "戴可思婴儿面霜", icon: "🧴", tag: "护肤" },
              { q: "德国宝得适安全座椅", icon: "🚗", tag: "安全" },
              { q: "戴森V15吸尘器", icon: "🧹", tag: "家电" },
              { q: "小天才电话手表Z10", icon: "⌚", tag: "智商税" },
              { q: "小猿学练机", icon: "📱", tag: "教育硬件" },
              { q: "科大讯飞学习机", icon: "🖥️", tag: "教育硬件" },
              { q: "步步高词典笔F6", icon: "🖊️", tag: "学习工具" },
              { q: "倾听者K9复读机", icon: "🎧", tag: "英语启蒙" },
              { q: "斑马AI课年卡", icon: "📚", tag: "智商税" },
              { q: "iEnglish训练系统", icon: "💸", tag: "智商税" },
              { q: "妙思乐润肤乳", icon: "✨", tag: "母婴" },
              { q: "贝亲宽口径", icon: "🍼", tag: "喂哺" },
            ].map((demo) => (
              <button
                key={demo.q}
                onClick={() => demoAnalyze(demo.q)}
                className="group rounded-[1.4rem] border border-[#e2dcf0] bg-white p-5 shadow-[0_12px_40px_rgba(80,62,125,0.05)] transition hover:-translate-y-1 hover:border-[#d7b184] hover:shadow-[0_18px_55px_rgba(95,56,22,0.1)]"
                style={{ textAlign: "left", display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
              >
                <span style={{ fontSize: 24 }}>{demo.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: "#1E1B4B", margin: "0 0 2px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{demo.q}</p>
                  <span style={{ fontSize: 10, color: "#7C3AED", background: "#F3EEFF", padding: "1px 6px", borderRadius: 4 }}>{demo.tag}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* 小提示 */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 14,
            padding: "0 4px",
          }}
        >
          <p style={{ fontSize: 12, color: "#9CA3AF", margin: 0 }}>
            支持淘宝、京东、拼多多等平台链接，或直接输入品牌名
          </p>
          {history.length > 0 && (
            <button
              onClick={() => setShowHistory(!showHistory)}
              style={{
                background: "none",
                border: "none",
                fontSize: 12,
                color: "#7C3AED",
                cursor: "pointer",
                fontWeight: 500,
              }}
            >
              {showHistory ? "收起历史" : `历史记录 (${history.length})`}
            </button>
          )}
        </div>

        {/* 错误 */}
        {error && (
          <div
            style={{
              marginTop: 16,
              padding: "12px 16px",
              background: "#FEF2F2",
              border: "1px solid #FECACA",
              borderRadius: 10,
              color: "#DC2626",
              fontSize: 13,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span style={{ fontFamily: "'Material Symbols Rounded'", fontSize: 18 }}>error</span>
            {error}
          </div>
        )}
      </div>

      {/* ===== 加载动画（排队中） ===== */}
      {loading && (
        <div style={{ maxWidth: 1280, margin: "32px auto", padding: "0 20px" }}>
          <div
            style={{
              background: "#fff",
              borderRadius: 16,
              padding: "40px 20px",
              border: "1px solid #F3F0FF",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 48, marginBottom: 12, animation: "worthbuy-pulse 2s ease-in-out infinite" }}>
              ⏳
            </div>
            <h3 style={{ color: "#7C3AED", fontSize: 16, fontWeight: 700, margin: "0 0 8px" }}>
              AI 正在分析「{input.trim()}」
            </h3>
            <p style={{ fontSize: 13, color: "#6B7280", margin: "0 0 20px", lineHeight: 1.6 }}>
              从材质价格、真实口碑、商业模式等维度进行深度评估…
            </p>
            {/* 进度条动画 */}
            <div
              style={{
                width: "100%",
                maxWidth: 320,
                margin: "0 auto",
                height: 4,
                background: "#F3F0FF",
                borderRadius: 2,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  background: "linear-gradient(90deg, #7C3AED, #A855F7)",
                  borderRadius: 2,
                  animation: "worthbuy-progress 2s ease-in-out infinite",
                  width: "60%",
                }}
              />
            </div>
            <p style={{ fontSize: 11, color: "#9CA3AF", margin: "12px 0 0" }}>
              最多等待 60 秒，超时后可稍后刷新查看
            </p>
          </div>
        </div>
      )}

      {/* ===== 已收录但分析超时 ===== */}
      {!loading && !result && !error && input.trim() && (
        <div style={{ maxWidth: 1280, margin: "32px auto", padding: "0 20px" }}>
          <div
            style={{
              background: "#FFFBEB", borderRadius: 16, padding: "32px 20px",
              border: "1px solid #FDE68A", textAlign: "center",
            }}
          >
            <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
            <h3 style={{ color: "#92400E", fontSize: 16, fontWeight: 700, margin: "0 0 8px" }}>
              「{input.trim()}」已加入分析队列
            </h3>
            <p style={{ fontSize: 13, color: "#B45309", margin: "0 0 16px", lineHeight: 1.6 }}>
              分析需要更长时间，请稍后刷新查看结果。
              <br />
              你可以先看看下方已分析完成的商品示例 👇
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
              <button
                onClick={() => {
                  document.querySelector('[style*="示例"]')?.scrollIntoView({ behavior: "smooth" });
                }}
                style={{
                  background: "#FEF3C7", border: "1px solid #FDE68A", borderRadius: 10,
                  padding: "8px 20px", fontSize: 13, fontWeight: 600, color: "#92400E", cursor: "pointer",
                }}
              >
                👇 查看已完成的示例
              </button>
              <button
                onClick={() => {
                  setResult(null);
                  setError(null);
                  setLoading(false);
                }}
                style={{
                  background: "#fff", border: "1px solid #FDE68A", borderRadius: 10,
                  padding: "8px 20px", fontSize: 13, fontWeight: 600, color: "#92400E", cursor: "pointer",
                }}
              >
                重新搜索
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== 结果卡片 ===== */}
      {result && !loading && (
        <div ref={resultRef} style={{ maxWidth: 1280, margin: "32px auto 40px", padding: "0 20px" }}>
          <div
            style={{
              background: "#fff",
              borderRadius: 16,
              border: "1px solid #F3F0FF",
              overflow: "hidden",
            }}
          >
            {/* ── 3a. 顶部：商品识别 + 核心判断 ── */}
            <div style={{ padding: "24px", paddingLeft: 4 }}>
              {/* 可信指数 —— 圆环 + 多维评分 + 标签信息 整体排版 */}
              <div style={{ display: "flex", alignItems: "center", gap: "clamp(20px, 4vw, 36px)", margin: "20px auto 24px", justifyContent: "center", maxWidth: "clamp(380px, 70vw, 700px)" }}>
                {/* 左侧：圆环 + 下方多维评分条 */}
                <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", transform: "translateX(-40px)" }}>
                  <div style={{
                    width: "clamp(120px, 25vw, 200px)",
                    height: "clamp(120px, 25vw, 200px)",
                    borderRadius: "50%",
                    background: `conic-gradient(${scoreColor(result.score)} ${result.score * 3.6}deg, #F3F0FF 0deg)`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 8px 60px rgba(80,62,125,0.08)",
                  }}>
                    <div
                      style={{
                        width: "clamp(96px, 19vw, 158px)",
                        height: "clamp(96px, 19vw, 158px)",
                        borderRadius: "50%",
                        background: "#fff",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        boxShadow: "0 2px 20px rgba(0,0,0,0.04)",
                      }}
                    >
                      <span style={{ fontSize: "clamp(32px, 10vw, 64px)", fontWeight: 900, color: scoreColor(result.score), lineHeight: 1, letterSpacing: "-0.03em" }}>
                        {result.score}
                      </span>
                      <span style={{ fontSize: "clamp(12px, 2.5vw, 16px)", fontWeight: 700, color: "#9CA3AF", marginTop: 4, letterSpacing: "0.05em" }}>分</span>
                    </div>
                  </div>

                  {/* ── 多维评分条 —— 正下方，宽度对齐圆环 ── */}
                  {result.ratingDimensions ? (
                    <div style={{ marginTop: 16, width: "clamp(120px, 25vw, 200px)" }}>
                      {([
                        { key: "cost" as const, label: "性价比", color: "#F59E0B" },
                        { key: "quality" as const, label: "质量", color: "#10B981" },
                        { key: "safety" as const, label: "安全性", color: "#3B82F6" },
                        { key: "experience" as const, label: "使用体验", color: "#8B5CF6" },
                        { key: "afterSales" as const, label: "售后", color: "#EC4899" },
                      ]).map(({ key, label, color }) => {
                        const v = result.ratingDimensions![key];
                        return (
                          <div key={key} style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 5 }}>
                            <span style={{ width: "clamp(42px, 8vw, 50px)", fontSize: 10, color: "#6B7280", fontWeight: 600, flexShrink: 0, textAlign: "right" }}>
                              {label}
                            </span>
                            <div style={{ flex: 1, height: 6, background: "#EDE9FE", borderRadius: 3, overflow: "hidden" }}>
                              <div style={{
                                width: `${v}%`,
                                height: "100%",
                                borderRadius: 3,
                                background: `linear-gradient(90deg, ${color}, ${color}cc)`,
                                transition: "width 0.6s ease",
                              }} />
                            </div>
                            <span style={{ width: 22, fontSize: 10, fontWeight: 800, color, textAlign: "right", flexShrink: 0 }}>
                              {v}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>

                {/* 右侧标签信息 */}
                <div style={{ flex: 1, minWidth: 200 }}>
                  <p style={{ fontSize: 20, fontWeight: 700, color: "#7C3AED", letterSpacing: "0.1em", margin: "0 0 10px" }}>可信指数</p>
                  <p style={{ fontSize: 15, fontWeight: 700, color: scoreColor(result.score), margin: "0 0 16px" }}>
                    {result.score >= 85 ? "强烈推荐 ✨" : result.score >= 70 ? "值得考虑 👍" : result.score >= 55 ? "谨慎购买 🤔" : result.score >= 40 ? "不太推荐 ⚠️" : "建议避坑 🚫"}
                  </p>

                  {/* 分析对象信息 */}
                  <div style={{ marginBottom: 10 }}>
                    <p style={{ fontSize: 11, color: "#9CA3AF", fontWeight: 500, margin: "0 0 2px" }}>分析对象</p>
                    <p style={{ fontSize: 15, fontWeight: 700, color: "#1E1B4B", margin: 0, wordBreak: "break-all" }}>
                      {result.url ? (
                        <a href={result.url} target="_blank" rel="noopener noreferrer" style={{ color: "#7C3AED", textDecoration: "none" }}>
                          {result.url}
                        </a>
                      ) : (
                        result.brand || input.trim()
                      )}
                    </p>
                  </div>

                  {/* 标签 + 价格 */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                    <span style={{
                      display: "inline-flex", alignItems: "center", gap: 4,
                      padding: "4px 12px", borderRadius: 20,
                      background: result.isIqTax ? "#FFFBEB" : "#ECFDF5",
                      fontSize: 12, fontWeight: 700,
                      color: result.isIqTax ? "#D97706" : "#059669",
                    }}>
                      {result.isIqTax ? "🚨 智商税" : "✅ 非智商税"}
                    </span>
                    {result.priceRange && (
                      <span style={{
                        padding: "4px 12px", borderRadius: 20,
                        background: "#F3EEFF", fontSize: 12, fontWeight: 600, color: "#7C3AED",
                      }}>
                        {result.priceRange}
                      </span>
                    )}
                  </div>

                  {/* 一句话理由 */}
                  <p style={{ fontSize: 13, color: "#6B7280", margin: "0 0 8px", lineHeight: 1.6 }}>
                    {result.reason}
                  </p>

                  {/* 适合/不适合人群 */}
                  {(result.suitableFor?.length || result.notSuitableFor?.length) ? (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {result.suitableFor?.map((s, i) => (
                        <span key={`sf-${i}`} style={{
                          padding: "2px 8px", borderRadius: 6,
                          background: "#ECFDF5", fontSize: 11, color: "#059669", fontWeight: 500,
                        }}>
                          ✓ {s}
                        </span>
                      ))}
                      {result.notSuitableFor?.map((s, i) => (
                        <span key={`nsf-${i}`} style={{
                          padding: "2px 8px", borderRadius: 6,
                          background: "#FEF2F2", fontSize: 11, color: "#DC2626", fontWeight: 500,
                        }}>
                          ✕ {s}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            {/* ── 3c. 数据面板（原多维评分已合并到上方） ── */}
            {(result.dataPoints?.length || result.references?.length) ? (
              <div style={{ padding: "20px 24px", paddingLeft: 14, borderTop: "1px solid #F3F0FF", background: "#FAFAFE" }}>
                {/* 关键数据点 */}
                {result.dataPoints && result.dataPoints.length > 0 && (
                  <div style={{ marginBottom: result.references?.length ? 14 : 0 }}>
                    <h4 style={{ fontSize: 13, fontWeight: 700, color: "#1E1B4B", margin: "0 0 8px", display: "flex", alignItems: "center", gap: 6 }}>
                      📌 关键数据
                    </h4>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {result.dataPoints.map((dp, i) => (
                        <span key={i} style={{ fontSize: 13, color: "#4B5563", lineHeight: 1.6 }}>
                          <span style={{ color: "#7C3AED", fontWeight: 700, marginRight: 6 }}>·</span>
                          {dp}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* 引用链接 */}
                {result.references && result.references.length > 0 && (
                  <div>
                    <h4 style={{ fontSize: 13, fontWeight: 700, color: "#1E1B4B", margin: "0 0 8px", display: "flex", alignItems: "center", gap: 6 }}>
                      🔗 引用来源
                    </h4>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {result.references.map((ref, i) => (
                        <a
                          key={i}
                          href={ref.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: "inline-flex", alignItems: "center", gap: 4,
                            padding: "4px 10px", borderRadius: 8,
                            background: "#fff", border: "1px solid #E5E7EB",
                            fontSize: 11, color: "#4B5563", textDecoration: "none",
                            fontWeight: 500, transition: "all 0.15s",
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#C4B5FD"; e.currentTarget.style.background = "#F8F6FF"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#E5E7EB"; e.currentTarget.style.background = "#fff"; }}
                        >
                          <span>
                            {ref.type === "official" ? "🏛" : ref.type === "test" ? "🔬" : ref.type === "expert" ? "🎓" : "💬"}
                          </span>
                          {ref.title}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : null}

            {/* ── 3d. 优缺点对比 ── */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                borderTop: "1px solid #F3F0FF",
              }}
            >
              <div style={{ padding: "20px 24px", borderRight: "1px solid #F3F0FF" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
                  <span style={{ color: "#10B981", fontSize: 18 }}>✅</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#1E1B4B" }}>优点</span>
                </div>
                {result.pros?.length > 0 ? (
                  <ul style={{ margin: 0, padding: "0 0 0 18px", listStyle: "disc" }}>
                    {result.pros.map((p, i) => (
                      <li key={i} style={{ fontSize: 13, color: "#4B5563", marginBottom: 6, lineHeight: 1.6 }}>{p}</li>
                    ))}
                  </ul>
                ) : (
                  <p style={{ fontSize: 13, color: "#9CA3AF", margin: 0 }}>暂无数据</p>
                )}
              </div>
              <div style={{ padding: "20px 24px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
                  <span style={{ color: "#EF4444", fontSize: 18 }}>⚠️</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#1E1B4B" }}>缺点</span>
                </div>
                {result.cons?.length > 0 ? (
                  <ul style={{ margin: 0, padding: "0 0 0 18px", listStyle: "disc" }}>
                    {result.cons.map((c, i) => (
                      <li key={i} style={{ fontSize: 13, color: "#4B5563", marginBottom: 6, lineHeight: 1.6 }}>{c}</li>
                    ))}
                  </ul>
                ) : (
                  <p style={{ fontSize: 13, color: "#9CA3AF", margin: 0 }}>暂无数据</p>
                )}
              </div>
            </div>

            {/* ── 3e. 商业模式 + 评论分析 ── */}
            <div style={{ padding: "20px 24px", borderTop: "1px solid #F3F0FF" }}>
              <div style={{ marginBottom: 16 }}>
                <h4 style={{ fontSize: 14, fontWeight: 700, color: "#1E1B4B", margin: "0 0 6px", display: "flex", alignItems: "center", gap: 6 }}>
                  💰 推荐人动机分析
                </h4>
                <p style={{ fontSize: 13, color: "#4B5563", margin: 0, lineHeight: 1.65, background: "#F8F6FF", padding: "10px 14px", borderRadius: 8 }}>
                  {result.businessModel || "暂无分析"}
                </p>
              </div>
              <div>
                <h4 style={{ fontSize: 14, fontWeight: 700, color: "#1E1B4B", margin: "0 0 6px", display: "flex", alignItems: "center", gap: 6 }}>
                  📝 评论真实性分析
                </h4>
                <p style={{ fontSize: 13, color: "#4B5563", margin: 0, lineHeight: 1.65, background: "#F8F6FF", padding: "10px 14px", borderRadius: 8 }}>
                  {result.commentAnalysis || "暂无分析"}
                </p>
              </div>
            </div>

            {/* ── 3f. 替代品推荐 ── */}
            {result.alternatives && result.alternatives.length > 0 && (
              <div style={{ padding: "20px 24px", borderTop: "1px solid #F3F0FF" }}>
                <h4 style={{ fontSize: 14, fontWeight: 700, color: "#1E1B4B", margin: "0 0 12px", display: "flex", alignItems: "center", gap: 6 }}>
                  🔄 替代品推荐
                </h4>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
                  {result.alternatives.map((alt, i) => (
                    <div
                      key={i}
                      className="group rounded-[1.4rem] border border-[#e2dcf0] bg-white p-5 shadow-[0_12px_40px_rgba(80,62,125,0.05)] transition hover:-translate-y-1 hover:border-[#d7b184] hover:shadow-[0_18px_55px_rgba(95,56,22,0.1)]"
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "#1E1B4B" }}>{alt.name}</span>
                        <span style={{
                          fontSize: 11, fontWeight: 700, color: "#fff",
                          background: scoreColor(alt.score), borderRadius: 6,
                          padding: "1px 7px",
                        }}>
                          {alt.score}
                        </span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                        <span style={{ fontSize: 12, color: "#7C3AED", fontWeight: 600 }}>{alt.price}</span>
                      </div>
                      <p style={{ fontSize: 11, color: "#6B7280", margin: 0, lineHeight: 1.5 }}>{alt.reason}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── 3g. 综合推荐 + 购买建议 ── */}
            <div style={{ padding: "20px 24px", borderTop: "1px solid #F3F0FF" }}>
              <h4 style={{ fontSize: 14, fontWeight: 700, color: "#1E1B4B", margin: "0 0 6px", display: "flex", alignItems: "center", gap: 6 }}>
                🎯 综合推荐
              </h4>
              <p style={{
                fontSize: 13, color: "#4B5563", margin: "0 0 12px", lineHeight: 1.65,
                background: "linear-gradient(135deg, #F5F0FF, #EDE9FE)", padding: "12px 14px", borderRadius: 8, fontWeight: 500,
              }}>
                {result.recommendation || "暂无推荐"}
              </p>
              {result.buyAdvice && (
                <div style={{ marginTop: 8 }}>
                  <h4 style={{ fontSize: 13, fontWeight: 700, color: "#7C3AED", margin: "0 0 6px", display: "flex", alignItems: "center", gap: 6 }}>
                    💡 购买建议
                  </h4>
                  <p style={{
                    fontSize: 13, color: "#4B5563", margin: 0, lineHeight: 1.65,
                    background: "#FFFBEB", padding: "10px 14px", borderRadius: 8,
                    border: "1px solid #FDE68A",
                  }}>
                    {result.buyAdvice}
                  </p>
                </div>
              )}
            </div>

            {/* ── 底部时间 ── */}
            <div
              style={{
                padding: "12px 24px",
                borderTop: "1px solid #F3F0FF",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                fontSize: 11,
                color: "#9CA3AF",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontFamily: "'Material Symbols Rounded'", fontSize: 14 }}>schedule</span>
                分析时间：{new Date(result.analyzedAt).toLocaleString("zh-CN")}
              </div>
              <button
                onClick={() => navigate(`/worthbuy/${encodeURIComponent(input.trim() || result.brand || "分析结果")}`, { state: { result, query: input.trim() || result.brand } })}
                style={{
                  background: "#F8F6FF", border: "1px solid #DDD6FE", borderRadius: 8,
                  padding: "4px 12px", fontSize: 11, color: "#7C3AED", cursor: "pointer",
                  fontWeight: 600, transition: "all 0.15s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "#F3EEFF"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "#F8F6FF"; }}
              >
                查看详情 →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== 历史记录 ===== */}
      {showHistory && (
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 20px 40px" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            <h3
              style={{
                fontSize: 16,
                fontWeight: 700,
                color: "#1E1B4B",
                margin: 0,
              }}
            >
              📜 分析历史
            </h3>
            {history.length > 0 && (
              <button
                onClick={clearHistory}
                style={{
                  background: "none",
                  border: "1px solid #FECACA",
                  borderRadius: 8,
                  padding: "6px 14px",
                  fontSize: 12,
                  color: "#DC2626",
                  cursor: "pointer",
                  fontWeight: 500,
                }}
              >
                清空历史
              </button>
            )}
          </div>
          {history.length === 0 ? (
            <p style={{ fontSize: 13, color: "#9CA3AF", textAlign: "center", padding: "40px 0" }}>
              暂无分析记录，搜索商品后会自动保存
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {history.map((item, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setResult(item.result);
                    setInput(item.query);
                    setShowHistory(false);
                    setError(null);
                    setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "12px 14px",
                    background: "#fff",
                    border: "1px solid #F3F0FF",
                    borderRadius: 10,
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "all 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "#FAF8FF";
                    e.currentTarget.style.borderColor = "#C4B5FD";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "#fff";
                    e.currentTarget.style.borderColor = "#F3F0FF";
                  }}
                >
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: "50%",
                      background: `conic-gradient(${scoreColor(item.result.score)} ${item.result.score * 3.6}deg, #F3F0FF 0deg)`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      fontSize: 14,
                      fontWeight: 800,
                      color: scoreColor(item.result.score),
                    }}
                  >
                    {item.result.score}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: "#1E1B4B",
                        margin: "0 0 2px",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {item.query}
                    </p>
                    <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0 }}>
                      {item.result.isIqTax ? "🚨 智商税" : "✅ 非智商税"} ·{" "}
                      {new Date(item.createdAt).toLocaleString("zh-CN")}
                    </p>
                  </div>
                  <span style={{ color: "#D1D5DB", flexShrink: 0 }}>→</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 底部 padding */}
      {!showHistory && <div style={{ height: 80 }} />}

      {/* ===== 旋转动画 ===== */}
      <style>{`
        .worthbuy-submission-card:hover .worthbuy-close-btn {
          opacity: 1 !important;
          pointer-events: auto !important;
        }
        @keyframes worthbuy-spin {
          to { transform: rotate(360deg); }
        }
        @keyframes worthbuy-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(1.05); }
        }
        @keyframes worthbuy-progress {
          0% { margin-left: -40%; width: 40%; }
          50% { margin-left: 30%; width: 50%; }
          100% { margin-left: 100%; width: 30%; }
        }
        @media (max-width: 768px) {
          .worthbuy-page h1 { font-size: 22px !important; }
          .worthbuy-page [style*="fontSize: 28"] { font-size: 22px !important; }
          .worthbuy-page [style*="gridTemplateColumns: 1fr 1fr"] { grid-template-columns: 1fr !important; }
          .worthbuy-page [style*="minmax(200px"] { grid-template-columns: 1fr !important; }
          .worthbuy-page [style*="max-width: 720"] { padding-left: 16px !important; padding-right: 16px !important; }
          .worthbuy-page [style*="padding: 60px 20px 0"] { padding: 40px 16px 0 !important; }
        }
        @media (max-width: 480px) {
          .worthbuy-page h1 { font-size: 18px !important; }
          .worthbuy-page [style*="fontSize: 28"] { font-size: 18px !important; }
          .worthbuy-page input { font-size: 13px !important; }
          .worthbuy-page [style*="minmax(150px"] { grid-template-columns: 1fr !important; }
          .worthbuy-page button[style*="padding: 10px 28px"] { padding: 8px 16px !important; font-size: 12px !important; }
          .worthbuy-page [style*="padding: 20px 24px"] { padding: 14px 16px !important; }
        }
        @media (max-width: 640px) {
          .worthbuy-page [style*="gridTemplateColumns: 1fr 1fr"] {
            grid-template-columns: 1fr !important;
          }
        }
        .worthbuy-hero input:focus-visible {
          outline: none !important;
          box-shadow: none !important;
        }
      `}</style>
    </div>
  );
};

export default WorthBuyPage;

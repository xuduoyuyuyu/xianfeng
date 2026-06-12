export interface WorthBuyEmojiInput {
  title?: string | null;
  query?: string | null;
  result?: {
    brand?: string | null;
    reason?: string | null;
    recommendation?: string | null;
    businessModel?: string | null;
    commentAnalysis?: string | null;
    pros?: string[];
    cons?: string[];
    suitableFor?: string[];
    notSuitableFor?: string[];
    buyAdvice?: string | null;
    isIqTax?: boolean;
  } | null;
}

const WORTH_BUY_EMOJI_RULES: Array<{ emoji: string; keywords: string[] }> = [
  { emoji: "💡", keywords: ["护眼灯", "大路灯", "台灯", "落地灯", "阅读灯", "照明", "频闪", "照度"] },
  { emoji: "🍼", keywords: ["奶瓶", "奶嘴", "喂养", "辅食", "吸奶", "PPSU", "ppsu"] },
  { emoji: "⌚", keywords: ["电话手表", "儿童手表", "智能手表", "定位手表"] },
  { emoji: "📱", keywords: ["学习机", "学练机", "平板", "墨水屏", "教育硬件", "AI批改", "ai批改"] },
  { emoji: "📚", keywords: ["课程", "AI课", "ai课", "训练系统", "网课", "英语课", "阅读课", "年卡"] },
  { emoji: "🖊️", keywords: ["词典笔", "点读笔", "扫描笔", "翻译笔"] },
  { emoji: "🎲", keywords: ["桌游", "棋", "玩具", "积木", "拼图", "逻辑游戏"] },
  { emoji: "🧸", keywords: ["爬行垫", "爬爬垫", "地垫", "安抚玩具", "毛绒"] },
  { emoji: "🎒", keywords: ["书包", "背包", "护脊包"] },
  { emoji: "👓", keywords: ["眼镜", "防蓝光", "近视", "护眼仪"] },
  { emoji: "🪥", keywords: ["牙刷", "电动牙刷", "冲牙器", "牙膏", "口腔"] },
  { emoji: "👟", keywords: ["鞋", "运动鞋", "学步鞋", "童鞋"] },
  { emoji: "🪑", keywords: ["学习桌", "椅", "座椅", "儿童桌", "升降桌"] },
  { emoji: "🥛", keywords: ["牛奶", "奶粉", "乳铁蛋白", "益生菌", "钙", "DHA", "dha"] },
];

function compactText(parts: Array<unknown>): string {
  return parts
    .flatMap((part) => (Array.isArray(part) ? part : [part]))
    .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
    .join(" ")
    .toLowerCase();
}

export function chooseWorthBuyEmoji(input: WorthBuyEmojiInput): string {
  const result = input.result || {};
  const haystack = compactText([
    input.title,
    input.query,
    result.brand,
    result.reason,
    result.recommendation,
    result.businessModel,
    result.commentAnalysis,
    result.pros,
    result.cons,
    result.suitableFor,
    result.notSuitableFor,
    result.buyAdvice,
  ]);

  for (const rule of WORTH_BUY_EMOJI_RULES) {
    if (rule.keywords.some((keyword) => haystack.includes(keyword.toLowerCase()))) {
      return rule.emoji;
    }
  }

  return "🛍️";
}

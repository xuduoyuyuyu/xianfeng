const CHARACTER_RECOGNITION_VERSION = "2026-08-12-r4";
const CHARACTERS_PER_BAND = 5;
const CHARACTER_BANDS = [
  ["日", "月", "山", "水", "人", "口", "手", "大", "小", "天", "火", "木", "田", "土", "中"],
  ["找", "跟", "秋", "纸", "奶", "家", "学", "花", "雨", "车", "门", "看", "吃", "玩", "书"],
  ["洁", "期", "窗", "短", "乘", "教", "级", "课", "读", "写", "朋", "海", "星", "画", "跑"],
  ["鼓", "健", "越", "整", "熟", "旅", "醒", "赛", "温", "轻", "影", "感", "助", "部", "题"],
  ["慕", "谨", "繁", "览", "颠", "默", "察", "解", "尊", "境", "需", "续", "责", "聚", "辨"],
  ["簇", "瞥", "蕴", "辙", "瀑", "骤", "疆", "耀", "赢", "藏", "霞", "薄", "嚼", "瓣", "鹰"]
];
const CHARACTER_SAMPLE_SIZE = CHARACTER_BANDS.length * CHARACTERS_PER_BAND;

function buildCharacterSample(random = Math.random, previousSample = [], testedCharacters = []) {
  const testedSet = new Set(testedCharacters);
  const sample = CHARACTER_BANDS.flatMap((band) => {
    const unseen = band.filter((character) => !testedSet.has(character));
    const seen = band.filter((character) => testedSet.has(character));
    const shuffle = (values) => {
      const shuffled = [...values];
      for (let index = 0; index < shuffled.length; index += 1) {
        const swapIndex = index + Math.floor(random() * (shuffled.length - index));
        [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
      }
      return shuffled;
    };
    return [...shuffle(unseen), ...shuffle(seen)].slice(0, CHARACTERS_PER_BAND);
  });
  if (sample.every((character, index) => character === previousSample[index])) {
    const replacement = CHARACTER_BANDS[0].find((character) => !sample.slice(0, CHARACTERS_PER_BAND).includes(character));
    if (replacement) sample[CHARACTERS_PER_BAND - 1] = replacement;
  }
  return sample;
}

function estimateCharacterRecognition(answers) {
  if (!Array.isArray(answers) || answers.length !== CHARACTER_SAMPLE_SIZE) {
    throw new Error(`需要完成全部 ${CHARACTER_SAMPLE_SIZE} 个字`);
  }
  if (answers.some((answer) => answer !== 0 && answer !== 1)) {
    throw new Error("每个字都需要标记认识或不认识");
  }

  const recognizedCount = answers.reduce((sum, answer) => sum + answer, 0);
  const estimate = recognizedCount * 100;
  const estimatedMin = Math.max(0, estimate - 150);
  const estimatedMax = Math.min(3000, estimate + 150);
  const estimateLabel = recognizedCount >= 28
    ? `${estimatedMin}–3000+`
    : `${estimatedMin}–${estimatedMax}`;

  let reference = "仍在积累高频生活用字";
  if (estimate >= 2500) reference = "达到第二学段累计识字量参考目标";
  else if (estimate >= 1600) reference = "达到第一学段累计识字量参考目标";
  else if (estimate >= 750) reference = "正在积累第一学段常用字";

  return {
    recognizedCount,
    sampledCount: CHARACTER_SAMPLE_SIZE,
    cumulativeRecognizedCount: recognizedCount,
    cumulativeSampledCount: CHARACTER_SAMPLE_SIZE,
    completedRounds: 1,
    estimatedMin,
    estimatedMax,
    estimateLabel,
    reference
  };
}

function buildCharacterRecognitionAnalysis(summary, childName = "孩子") {
  const cumulativeRecognizedCount = Number(summary.cumulativeRecognizedCount ?? summary.recognizedCount);
  const cumulativeSampledCount = Number(summary.cumulativeSampledCount ?? summary.sampledCount);
  const completedRounds = Number(summary.completedRounds || 1);
  const estimateExplanation = cumulativeRecognizedCount < 5
    ? "本次认出的分层样本较少，当前版本不展示识字数量换算。建议在孩子状态稳定时再次测试，并结合多次表现观察变化。"
    : `只有题库经过足够儿童样本标定、信效度检验并建立常模后，短测才能较可靠地估算识字总量。当前版本尚未完成这些标定，因此“${summary.estimateLabel}”只保留为探索性换算区间，不是实际逐字测得的数量。随着累计有效样本增加，单个答案对结果的影响会降低。`;
  const cumulativeExplanation = completedRounds > 1
    ? `目前已完成 ${completedRounds} 轮，累计覆盖 ${cumulativeSampledCount} 个不同样本字。重复出现的字不会增加有效样本数；估算变得更稳定，不代表孩子的识字量因为多测而增加。`
    : "继续测试时会优先出现尚未测过的字。覆盖的不同样本越多，估算通常越稳定；这不代表识字量会因为多测而增加。";
  return {
    title: `${childName}本次认出 ${summary.recognizedCount} / ${summary.sampledCount} 个抽样字`,
    paragraphs: [
      "这 30 个字从 6 个难度字库中各随机抽取 5 个。它观察的是孩子面对由常见到较难汉字时，认读表现如何变化，而不是让一个字固定代表 100 个字。",
      estimateExplanation,
      cumulativeExplanation,
      "判断“认识”时，孩子应能独立读出这个字，并说出大致意思或组成一个常见词；只凭字形眼熟、家长提示后才读出，都应记为暂不认识。",
      "这个结果适合用于观察和后续复测，不用于诊断阅读困难，也不能替代学校测评或专业评估。孩子状态、方言读音和家长判断尺度都会影响结果。"
    ]
  };
}

module.exports = {
  CHARACTER_BANDS,
  CHARACTER_RECOGNITION_VERSION,
  CHARACTER_SAMPLE_SIZE,
  CHARACTERS_PER_BAND,
  buildCharacterRecognitionAnalysis,
  buildCharacterSample,
  estimateCharacterRecognition
};

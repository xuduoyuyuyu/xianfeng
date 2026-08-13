const {
  ADVANCED_CHARACTER_BANK,
  BASE_CHARACTER_BANK,
  CHARACTER_BANK,
  CHARACTER_STAGES
} = require("./characterRecognitionBank");

const BASE_CHARACTER_RECOGNITION_VERSION = "2026-08-13-r1";
const LEGACY_CHARACTER_RECOGNITION_VERSION = "2026-08-13-r2";
const CHARACTER_RECOGNITION_VERSION = "2026-08-13-r3";
const CHARACTERS_PER_PAGE = 20;
const BASE_CHARACTER_SAMPLE_SIZE = BASE_CHARACTER_BANK.length;
const CHARACTER_SAMPLE_SIZE = CHARACTER_BANK.length;
const CHARACTER_PAGE_COUNT = CHARACTER_SAMPLE_SIZE / CHARACTERS_PER_PAGE;

function buildCharacterPage(pageIndex, answers = [], recognitionGroup = 1) {
  const isIndependentGroup = answers.length === BASE_CHARACTER_SAMPLE_SIZE;
  const sampleSize = isIndependentGroup ? BASE_CHARACTER_SAMPLE_SIZE : CHARACTER_SAMPLE_SIZE;
  const pageCount = sampleSize / CHARACTERS_PER_PAGE;
  const boundedPageIndex = Math.max(0, Math.min(pageCount - 1, Number(pageIndex) || 0));
  const start = boundedPageIndex * CHARACTERS_PER_PAGE;
  const groupOffset = isIndependentGroup && Number(recognitionGroup) === 2 ? BASE_CHARACTER_SAMPLE_SIZE : 0;
  const bank = groupOffset ? ADVANCED_CHARACTER_BANK : CHARACTER_BANK;
  const stageIndex = start + groupOffset;
  const stage = CHARACTER_STAGES.find((item) => stageIndex >= item.start && stageIndex < item.end) || CHARACTER_STAGES[0];
  return {
    pageIndex: boundedPageIndex,
    pageNumber: boundedPageIndex + 1,
    pageCount,
    start,
    end: start + CHARACTERS_PER_PAGE,
    stage,
    characters: bank.slice(start, start + CHARACTERS_PER_PAGE).map((character, offset) => ({
      character,
      index: start + offset,
      unknown: answers[start + offset] === 0
    }))
  };
}

function buildCharacterRecognitionSummary(answers, recognitionGroup = 1) {
  if (!Array.isArray(answers) || ![BASE_CHARACTER_SAMPLE_SIZE, CHARACTER_SAMPLE_SIZE].includes(answers.length)) {
    throw new Error("需要完成一组 800 字或旧版累计 1600 字");
  }
  if (answers.some((answer) => answer !== 0 && answer !== 1)) {
    throw new Error("每个字都需要标记认识或不认识");
  }
  const recognizedCount = answers.reduce((sum, answer) => sum + answer, 0);
  const groupOffset = answers.length === BASE_CHARACTER_SAMPLE_SIZE && Number(recognitionGroup) === 2
    ? BASE_CHARACTER_SAMPLE_SIZE
    : 0;
  const groupEnd = groupOffset + answers.length;
  const stageResults = CHARACTER_STAGES.filter((stage) => stage.start >= groupOffset && stage.start < groupEnd).map((stage) => {
    const stageStart = stage.start - groupOffset;
    const stageEnd = Math.min(stage.end, groupEnd) - groupOffset;
    const stageAnswers = answers.slice(stageStart, stageEnd);
    const stageRecognizedCount = stageAnswers.reduce((sum, answer) => sum + answer, 0);
    return {
      id: stage.id,
      label: stage.label,
      audience: stage.audience,
      recognizedCount: stageRecognizedCount,
      totalCount: stageAnswers.length
    };
  });
  return {
    recognizedCount,
    sampledCount: answers.length,
    cumulativeRecognizedCount: recognizedCount,
    cumulativeSampledCount: answers.length,
    completedRounds: answers.length === CHARACTER_SAMPLE_SIZE ? 2 : 1,
    estimatedMin: recognizedCount,
    estimatedMax: recognizedCount,
    estimateLabel: String(recognizedCount),
    reference: answers.length === CHARACTER_SAMPLE_SIZE
      ? "旧版累计 1600 字逐字筛选结果"
      : `第 ${Number(recognitionGroup) === 2 ? 2 : 1} 组 800 字逐字筛选结果`,
    stageResults
  };
}

function buildCharacterRecognitionAnalysis(summary, childName = "孩子") {
  return {
    title: `${childName}已确认认识 ${summary.recognizedCount} 个字`,
    paragraphs: [
      "这个数字来自本轮逐字筛选，不是用少量样本推算出的识字量。结果同时保留每个认识和不认识的字，方便后续复习与再次核对。",
      "首批 800 字依据 2024—2025 统编小学语文一年级上册、下册和二年级上册识字表顺序去重整理；进阶字先接续二年级下册识字表，再按《义务教育语文课程标准（2022年版）》附录常用字表补足。阶段只用于由易到难呈现，不是官方达标线。",
      "判断“认识”时，孩子应能独立读出，并说出大致意思或组成一个常见词；只凭字形眼熟、家长提示后才读出，应改选为不认识。",
      "识字不等于阅读理解。结果适合用来找出具体会和不会的字，不用于诊断阅读困难，也不能替代学校测评或专业评估。"
    ]
  };
}

module.exports = {
  ADVANCED_CHARACTER_BANK,
  BASE_CHARACTER_RECOGNITION_VERSION,
  BASE_CHARACTER_BANK,
  BASE_CHARACTER_SAMPLE_SIZE,
  CHARACTER_BANK,
  CHARACTER_PAGE_COUNT,
  CHARACTER_RECOGNITION_VERSION,
  LEGACY_CHARACTER_RECOGNITION_VERSION,
  CHARACTER_SAMPLE_SIZE,
  CHARACTER_STAGES,
  CHARACTERS_PER_PAGE,
  buildCharacterPage,
  buildCharacterRecognitionAnalysis,
  buildCharacterRecognitionSummary
};

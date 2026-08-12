import { Router, Response } from "express";
import FlashTestResult, { FlashTestDimensionScore, FlashTestRecognitionSummary } from "../models/FlashTestResult";
import UserXiaowanziSync from "../models/UserXiaowanziSync";
import { authenticate, AuthenticatedRequest } from "../middlewares/auth";

const router = Router();

export const EIGHT_TALENTS_VERSION = "2026-08-11";
export const CHARACTER_RECOGNITION_VERSION = "2026-08-12-r4";
const SUPPORTED_ASSESSMENT_IDS = ["eight-talents", "character-recognition"] as const;
const CHARACTER_BANDS = [
  ["日", "月", "山", "水", "人", "口", "手", "大", "小", "天", "火", "木", "田", "土", "中"],
  ["找", "跟", "秋", "纸", "奶", "家", "学", "花", "雨", "车", "门", "看", "吃", "玩", "书"],
  ["洁", "期", "窗", "短", "乘", "教", "级", "课", "读", "写", "朋", "海", "星", "画", "跑"],
  ["鼓", "健", "越", "整", "熟", "旅", "醒", "赛", "温", "轻", "影", "感", "助", "部", "题"],
  ["慕", "谨", "繁", "览", "颠", "默", "察", "解", "尊", "境", "需", "续", "责", "聚", "辨"],
  ["簇", "瞥", "蕴", "辙", "瀑", "骤", "疆", "耀", "赢", "藏", "霞", "薄", "嚼", "瓣", "鹰"],
];

const DIMENSIONS = [
  { code: "M", name: "记忆" },
  { code: "Y", name: "推演" },
  { code: "B", name: "表达" },
  { code: "G", name: "感知" },
  { code: "S", name: "数理" },
  { code: "C", name: "操作" },
  { code: "K", name: "狂热" },
  { code: "Z", name: "创造" },
];

function levelForTotal(total: number) {
  if (total >= 20) return "顶级核心天赋";
  if (total >= 15) return "优势可发展能力";
  if (total >= 10) return "普通中等能力";
  return "弱势短板能力";
}

export function normalizeAnswers(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length !== 40) return null;
  const answers = value.map(Number);
  if (answers.some((answer) => !Number.isInteger(answer) || answer < 1 || answer > 5)) return null;
  return answers;
}

export function normalizeCharacterRecognitionAnswers(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length !== 30) return null;
  const answers = value.map(Number);
  if (answers.some((answer) => answer !== 0 && answer !== 1)) return null;
  return answers;
}

export function normalizeCharacterRecognitionSample(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length !== 30) return null;
  const characters = value.map((character) => String(character || ""));
  if (new Set(characters).size !== 30) return null;
  const validBands = CHARACTER_BANDS.every((band, bandIndex) => (
    characters.slice(bandIndex * 5, bandIndex * 5 + 5).every((character) => band.includes(character))
  ));
  return validBands ? characters : null;
}

export function scoreCharacterRecognition(
  answers: number[],
  cumulativeAnswers: number[] = answers,
  completedRounds = 1
): FlashTestRecognitionSummary {
  const recognizedCount = answers.reduce((sum, answer) => sum + answer, 0);
  const cumulativeRecognizedCount = cumulativeAnswers.reduce((sum, answer) => sum + answer, 0);
  const cumulativeSampledCount = cumulativeAnswers.length;
  const estimate = Math.round((cumulativeRecognizedCount / cumulativeSampledCount) * 3000 / 50) * 50;
  const halfWidth = Math.max(50, Math.round((150 * 30 / cumulativeSampledCount) / 50) * 50);
  const estimatedMin = Math.max(0, estimate - halfWidth);
  const estimatedMax = Math.min(3000, estimate + halfWidth);
  const estimateLabel = cumulativeRecognizedCount / cumulativeSampledCount >= 28 / 30
    ? `${estimatedMin}–3000+`
    : `${estimatedMin}–${estimatedMax}`;
  let reference = "仍在积累高频生活用字";
  if (estimate >= 2500) reference = "达到第二学段累计识字量参考目标";
  else if (estimate >= 1600) reference = "达到第一学段累计识字量参考目标";
  else if (estimate >= 750) reference = "正在积累第一学段常用字";
  return {
    recognizedCount,
    sampledCount: 30,
    cumulativeRecognizedCount,
    cumulativeSampledCount,
    completedRounds,
    estimatedMin,
    estimatedMax,
    estimateLabel,
    reference,
  };
}

export function scoreEightTalents(answers: number[]): FlashTestDimensionScore[] {
  return DIMENSIONS.map((dimension, index) => {
    const total = answers.slice(index * 5, index * 5 + 5).reduce((sum, answer) => sum + answer, 0);
    return {
      ...dimension,
      total,
      radarValue: Math.round(total / 5),
      level: levelForTotal(total),
    };
  });
}

function serializeResult(result: any) {
  return {
    id: String(result._id),
    assessmentId: result.assessmentId,
    assessmentVersion: result.assessmentVersion,
    mode: result.mode,
    childId: result.childId || "",
    childName: result.childName || "",
    scores: result.scores,
    recognitionSummary: result.recognitionSummary,
    sampleCharacters: result.assessmentId === "character-recognition" ? result.sampleCharacters : undefined,
    completedAt: result.completedAt,
  };
}

router.post("/results", authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = String(req.user?.id || "");
    const assessmentId = String(req.body?.assessmentId || "");
    const assessmentVersion = String(req.body?.assessmentVersion || "");
    const mode = String(req.body?.mode || "");
    const childId = String(req.body?.childId || "").trim();
    const answers = assessmentId === "character-recognition"
      ? normalizeCharacterRecognitionAnswers(req.body?.answers)
      : normalizeAnswers(req.body?.answers);
    const sampleCharacters = assessmentId === "character-recognition"
      ? normalizeCharacterRecognitionSample(req.body?.sampleCharacters)
      : [];

    if (!SUPPORTED_ASSESSMENT_IDS.includes(assessmentId as any)) {
      res.status(400).json({ message: "暂不支持该测试" });
      return;
    }
    const expectedVersion = assessmentId === "character-recognition"
      ? CHARACTER_RECOGNITION_VERSION
      : EIGHT_TALENTS_VERSION;
    if (assessmentVersion !== expectedVersion) {
      res.status(400).json({ message: "测试题目版本已更新，请重新开始" });
      return;
    }
    if (mode !== "self" && mode !== "child") {
      res.status(400).json({ message: "测试对象无效" });
      return;
    }
    if (!answers) {
      res.status(400).json({ message: assessmentId === "character-recognition" ? "请完成全部 30 个字" : "请完成全部 40 道题" });
      return;
    }
    if (assessmentId === "character-recognition" && !sampleCharacters) {
      res.status(400).json({ message: "本次识字样本无效，请重新开始" });
      return;
    }
    if (assessmentId === "character-recognition" && mode !== "child") {
      res.status(400).json({ message: "识字量测试需要选择孩子档案" });
      return;
    }

    let childName = "";
    if (mode === "child") {
      if (!childId) {
        res.status(400).json({ message: "请选择孩子档案" });
        return;
      }
      const sync = await UserXiaowanziSync.findOne({ userId }).select("childProfiles").lean();
      const child = (sync?.childProfiles || []).find((item: any) => String(item?.id || "") === childId);
      if (!child) {
        res.status(404).json({ message: "孩子档案不存在或不属于当前账号" });
        return;
      }
      childName = String((child as any).title || (child as any).name || "").trim();
    }

    let recognitionSummary: FlashTestRecognitionSummary | undefined;
    if (assessmentId === "character-recognition") {
      const previousResults = await FlashTestResult.find({
        userId,
        assessmentId,
        mode: "child",
        childId,
      }).select("answers sampleCharacters").sort({ completedAt: 1, _id: 1 }).lean();
      const observations = new Map<string, number>();
      previousResults.forEach((previous) => {
        previous.sampleCharacters.forEach((character, index) => {
          observations.set(character, previous.answers[index]);
        });
      });
      sampleCharacters!.forEach((character, index) => {
        observations.set(character, answers[index]);
      });
      recognitionSummary = scoreCharacterRecognition(
        answers,
        [...observations.values()],
        previousResults.length + 1
      );
    }

    const result = await FlashTestResult.create({
      userId,
      assessmentId,
      assessmentVersion,
      mode,
      childId: mode === "child" ? childId : "",
      childName,
      answers,
      sampleCharacters,
      scores: assessmentId === "eight-talents" ? scoreEightTalents(answers) : [],
      recognitionSummary,
      completedAt: new Date(),
    });
    res.status(201).json({ result: serializeResult(result) });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "测试结果保存失败" });
  }
});

router.get("/results", authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const assessmentId = String(req.query.assessmentId || "").trim();
    const mode = String(req.query.mode || "").trim();
    const childId = String(req.query.childId || "").trim();
    if (assessmentId && !SUPPORTED_ASSESSMENT_IDS.includes(assessmentId as any)) {
      res.status(400).json({ message: "暂不支持该测试" });
      return;
    }
    if (mode && mode !== "self" && mode !== "child") {
      res.status(400).json({ message: "测试对象无效" });
      return;
    }
    if (childId && mode !== "child") {
      res.status(400).json({ message: "孩子档案参数无效" });
      return;
    }
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const filter: Record<string, unknown> = { userId: req.user?.id };
    if (assessmentId) filter.assessmentId = assessmentId;
    if (mode) filter.mode = mode;
    if (childId) filter.childId = childId;
    const results = await FlashTestResult.find(filter)
      .sort({ completedAt: -1, _id: -1 })
      .limit(limit)
      .lean();
    res.json({ results: results.map(serializeResult) });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "测试结果读取失败" });
  }
});

export default router;

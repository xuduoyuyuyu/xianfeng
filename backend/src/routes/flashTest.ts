import { Router, Response } from "express";
import FlashTestResult, { FlashTestDimensionScore, FlashTestRecognitionSummary } from "../models/FlashTestResult";
import UserXiaowanziSync from "../models/UserXiaowanziSync";
import { authenticate, AuthenticatedRequest } from "../middlewares/auth";
import {
  ADVANCED_CHARACTER_RECOGNITION_BANK,
  BASE_CHARACTER_RECOGNITION_BANK,
  CHARACTER_RECOGNITION_BANK,
} from "./characterRecognitionBank";

const router = Router();

export const EIGHT_TALENTS_VERSION = "2026-08-11";
export const BASE_CHARACTER_RECOGNITION_VERSION = "2026-08-13-r1";
export const LEGACY_CHARACTER_RECOGNITION_VERSION = "2026-08-13-r2";
export const CHARACTER_RECOGNITION_VERSION = "2026-08-13-r3";
const SUPPORTED_ASSESSMENT_IDS = ["eight-talents", "character-recognition"] as const;

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
  if (!Array.isArray(value) || ![800, CHARACTER_RECOGNITION_BANK.length].includes(value.length)) return null;
  const answers = value.map(Number);
  if (answers.some((answer) => answer !== 0 && answer !== 1)) return null;
  return answers;
}

export function normalizeCharacterRecognitionSample(value: unknown, recognitionGroup = 1): string[] | null {
  if (!Array.isArray(value) || ![800, CHARACTER_RECOGNITION_BANK.length].includes(value.length)) return null;
  const characters = value.map((character) => String(character || ""));
  const expectedBank = characters.length === CHARACTER_RECOGNITION_BANK.length
    ? CHARACTER_RECOGNITION_BANK
    : Number(recognitionGroup) === 2
      ? ADVANCED_CHARACTER_RECOGNITION_BANK
      : BASE_CHARACTER_RECOGNITION_BANK;
  const matchesBank = characters.every((character, index) => character === expectedBank[index]);
  return matchesBank ? characters : null;
}

export function scoreCharacterRecognition(
  answers: number[],
  recognitionGroup = 1
): FlashTestRecognitionSummary {
  const recognizedCount = answers.reduce((sum, answer) => sum + answer, 0);
  const sampledCount = answers.length;
  return {
    recognizedCount,
    sampledCount,
    cumulativeRecognizedCount: recognizedCount,
    cumulativeSampledCount: sampledCount,
    completedRounds: sampledCount === CHARACTER_RECOGNITION_BANK.length ? 2 : 1,
    estimatedMin: recognizedCount,
    estimatedMax: recognizedCount,
    estimateLabel: String(recognizedCount),
    reference: sampledCount === 1600
      ? "旧版累计 1600 字逐字筛选结果"
      : `第 ${Number(recognitionGroup) === 2 ? 2 : 1} 组 800 字逐字筛选结果`,
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
    recognitionGroup: Number(result.recognitionGroup) === 2 || result.sampleCharacters?.length === 1600 ? 2 : 1,
    answers: result.assessmentId === "character-recognition" ? result.answers : undefined,
    sampleCharacters: result.assessmentId === "character-recognition" ? result.sampleCharacters : undefined,
    completedAt: result.completedAt,
  };
}

function serializeRecognitionGroupMastery(result: any, recognitionGroup: 1 | 2) {
  if (!result) return null;
  const answers = Array.isArray(result.answers) ? result.answers.map(Number) : [];
  const groupAnswers = answers.length === CHARACTER_RECOGNITION_BANK.length
    ? answers.slice((recognitionGroup - 1) * 800, recognitionGroup * 800)
    : answers;
  if (groupAnswers.length !== 800) return null;
  return {
    resultId: String(result._id),
    recognitionGroup,
    recognizedCount: groupAnswers.reduce((sum: number, answer: number) => sum + answer, 0),
    sampledCount: 800,
    completedAt: result.completedAt,
  };
}

function latestRecognitionGroupMastery(independentResult: any, legacyResult: any, recognitionGroup: 1 | 2) {
  if (!independentResult) return serializeRecognitionGroupMastery(legacyResult, recognitionGroup);
  if (!legacyResult) return serializeRecognitionGroupMastery(independentResult, recognitionGroup);
  const independentTime = new Date(independentResult.completedAt).getTime();
  const legacyTime = new Date(legacyResult.completedAt).getTime();
  return serializeRecognitionGroupMastery(
    independentTime >= legacyTime ? independentResult : legacyResult,
    recognitionGroup
  );
}

router.post("/results", authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = String(req.user?.id || "");
    const assessmentId = String(req.body?.assessmentId || "");
    const assessmentVersion = String(req.body?.assessmentVersion || "");
    const mode = String(req.body?.mode || "");
    const childId = String(req.body?.childId || "").trim();
    const requestedRecognitionGroup = Number(req.body?.recognitionGroup);
    const recognitionGroup = requestedRecognitionGroup === 2 ? 2 : 1;
    const answers = assessmentId === "character-recognition"
      ? normalizeCharacterRecognitionAnswers(req.body?.answers)
      : normalizeAnswers(req.body?.answers);
    const sampleCharacters = assessmentId === "character-recognition"
      ? normalizeCharacterRecognitionSample(req.body?.sampleCharacters, recognitionGroup)
      : [];

    if (!SUPPORTED_ASSESSMENT_IDS.includes(assessmentId as any)) {
      res.status(400).json({ message: "暂不支持该测试" });
      return;
    }
    const expectedVersion = assessmentId === "character-recognition"
      ? (Array.isArray(answers) && answers.length === 1600
        ? LEGACY_CHARACTER_RECOGNITION_VERSION
        : requestedRecognitionGroup === 1 || requestedRecognitionGroup === 2
          ? CHARACTER_RECOGNITION_VERSION
          : BASE_CHARACTER_RECOGNITION_VERSION)
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
      res.status(400).json({ message: assessmentId === "character-recognition" ? "请完成一组 800 字" : "请完成全部 40 道题" });
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
      recognitionSummary = scoreCharacterRecognition(answers, recognitionGroup);
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
      recognitionGroup: assessmentId === "character-recognition" ? recognitionGroup : undefined,
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
    let recognitionGroups: Record<string, ReturnType<typeof serializeRecognitionGroupMastery>> | undefined;
    if (assessmentId === "character-recognition") {
      const groupFilter = { ...filter, assessmentId: "character-recognition" };
      const [firstGroup, secondGroup, legacyResult] = await Promise.all([
        FlashTestResult.findOne({
          ...groupFilter,
          "recognitionSummary.sampledCount": 800,
          recognitionGroup: { $ne: 2 },
        }).sort({ completedAt: -1, _id: -1 }).lean(),
        FlashTestResult.findOne({
          ...groupFilter,
          "recognitionSummary.sampledCount": 800,
          recognitionGroup: 2,
        }).sort({ completedAt: -1, _id: -1 }).lean(),
        FlashTestResult.findOne({
          ...groupFilter,
          "recognitionSummary.sampledCount": 1600,
        }).sort({ completedAt: -1, _id: -1 }).lean(),
      ]);
      recognitionGroups = {
        1: latestRecognitionGroupMastery(firstGroup, legacyResult, 1),
        2: latestRecognitionGroupMastery(secondGroup, legacyResult, 2),
      };
    }
    res.json({ results: results.map(serializeResult), recognitionGroups });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "测试结果读取失败" });
  }
});

export default router;

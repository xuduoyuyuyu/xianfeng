import { Router, Response } from "express";
import FlashTestResult, { FlashTestDimensionScore } from "../models/FlashTestResult";
import UserXiaowanziSync from "../models/UserXiaowanziSync";
import { authenticate, AuthenticatedRequest } from "../middlewares/auth";

const router = Router();

export const EIGHT_TALENTS_VERSION = "2026-08-11";

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
    const answers = normalizeAnswers(req.body?.answers);

    if (assessmentId !== "eight-talents") {
      res.status(400).json({ message: "暂不支持该测试" });
      return;
    }
    if (assessmentVersion !== EIGHT_TALENTS_VERSION) {
      res.status(400).json({ message: "测试题目版本已更新，请重新开始" });
      return;
    }
    if (mode !== "self" && mode !== "child") {
      res.status(400).json({ message: "测试对象无效" });
      return;
    }
    if (!answers) {
      res.status(400).json({ message: "请完成全部 40 道题" });
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

    const result = await FlashTestResult.create({
      userId,
      assessmentId,
      assessmentVersion,
      mode,
      childId: mode === "child" ? childId : "",
      childName,
      answers,
      scores: scoreEightTalents(answers),
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
    if (assessmentId && assessmentId !== "eight-talents") {
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

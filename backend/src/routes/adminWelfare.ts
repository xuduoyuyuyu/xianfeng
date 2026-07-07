import { Router, Request, Response } from "express";
import mongoose from "mongoose";
import User from "../models/User";
import WelfareActivationCode from "../models/WelfareActivationCode";
import WelfareCampaign from "../models/WelfareCampaign";
import WelfareClaim from "../models/WelfareClaim";
import UserXiaowanziSync from "../models/UserXiaowanziSync";
import {
  asNumber,
  asOptionalDate,
  asStatus,
  asText,
  idQuery,
  resolveNow,
  serializeWelfareCampaign,
  serializeWelfareClaim,
} from "./welfareUtils";

const router = Router();

function parseActivationCodes(input: any): { codes: string[]; duplicateCount: number } {
  const source = Array.isArray(input?.codes) ? input.codes.join("\n") : asText(input?.codesText || input?.codes);
  const seen = new Set<string>();
  let duplicateCount = 0;
  const codes = String(source || "")
    .split(/[\n,，;\t]+/)
    .map((item) => asText(item))
    .filter((item) => {
      if (!item) return false;
      if (seen.has(item)) {
        duplicateCount += 1;
        return false;
      }
      seen.add(item);
      return true;
    });
  return { codes, duplicateCount };
}

function csvCell(value: unknown): string {
  const text = asText(value).replace(/\r?\n/g, " ");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function childAgeFromBirthDate(value: unknown) {
  const text = asText(value);
  if (!text) return "";
  const birthDate = new Date(text);
  if (Number.isNaN(birthDate.getTime())) return "";
  const now = new Date();
  let age = now.getFullYear() - birthDate.getFullYear();
  const monthDiff = now.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birthDate.getDate())) age -= 1;
  return age >= 0 && age <= 30 ? `${age}岁` : "";
}

function serializeChildProfile(profile: any) {
  return {
    id: asText(profile?.id || profile?.childId),
    name: asText(profile?.displayName || profile?.name || profile?.childName),
    age: asText(profile?.accurateAge || profile?.age) || childAgeFromBirthDate(profile?.birthDate || profile?.birthday),
    grade: asText(profile?.grade || profile?.childGrade),
  };
}

function campaignPayload(body: any) {
  const totalStock = Math.max(0, Math.floor(asNumber(body?.totalStock, 0)));
  return {
    title: asText(body?.title),
    subtitle: asText(body?.subtitle),
    description: asText(body?.description),
    coverImageUrl: asText(body?.coverImageUrl),
    claimInstructions: asText(body?.claimInstructions),
    externalUrl: asText(body?.externalUrl),
    claimButtonText: asText(body?.claimButtonText) || "立即领取",
    totalStock,
    startsAt: asOptionalDate(body?.startsAt),
    endsAt: asOptionalDate(body?.endsAt),
    status: asStatus(body?.status),
    sortOrder: asNumber(body?.sortOrder, 0),
  };
}

async function activationCodeStats(campaignIds: any[]) {
  const ids = campaignIds.map((id) => String(id)).filter(mongoose.Types.ObjectId.isValid);
  if (!ids.length) return new Map<string, { total: number; claimed: number; remaining: number }>();
  const rows = await WelfareActivationCode.aggregate([
    { $match: { campaignId: { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) } } },
    {
      $group: {
        _id: "$campaignId",
        total: { $sum: 1 },
        claimed: { $sum: { $cond: [{ $ne: ["$claimId", null] }, 1, 0] } },
      },
    },
  ]);
  return new Map(rows.map((row: any) => {
    const total = Number(row.total || 0);
    const claimed = Number(row.claimed || 0);
    return [String(row._id), { total, claimed, remaining: Math.max(0, total - claimed) }];
  }));
}

function withActivationCodeStats(campaign: any, now: Date, stats: Map<string, { total: number; claimed: number; remaining: number }>) {
  const serialized = serializeWelfareCampaign(campaign, now);
  const itemStats = stats.get(String(serialized._id)) || { total: 0, claimed: 0, remaining: 0 };
  return {
    ...serialized,
    activationCodeCount: itemStats.total,
    activationCodeClaimedCount: itemStats.claimed,
    activationCodeRemainingCount: itemStats.remaining,
  };
}

async function buildClaimRows(campaign: any) {
  const claims = await WelfareClaim.find({ campaignId: campaign._id }).sort({ claimedAt: -1 }).lean();
  const userIds = Array.from(new Set(claims.map((claim) => asText(claim.userId)).filter(mongoose.Types.ObjectId.isValid)));
  const [users, syncRows] = await Promise.all([
    User.find({ _id: { $in: userIds } }).select("_id username mobile name avatar_initial avatar_image childGrade grade city region").lean(),
    UserXiaowanziSync.find({ userId: { $in: userIds } }).select("userId childProfiles childProfileDeletions").lean(),
  ]);
  const usersById = new Map(users.map((user: any) => [String(user._id), user]));
  const syncByUserId = new Map(syncRows.map((row: any) => [String(row.userId), row]));
  return claims.map((claim: any) => {
    const userId = asText(claim.userId);
    const user = usersById.get(userId);
    const sync = syncByUserId.get(userId);
    const deletedChildIds = new Set((sync?.childProfileDeletions || []).map((item: any) => asText(item?.id || item?.childId)).filter(Boolean));
    const children = (sync?.childProfiles || [])
      .filter((profile: any) => !deletedChildIds.has(asText(profile?.id || profile?.childId)))
      .map(serializeChildProfile)
      .filter((profile: any) => profile.name || profile.age || profile.grade);
    return {
      ...serializeWelfareClaim(claim),
      user: user ? {
        _id: String(user._id),
        username: asText(user.username),
        nickname: asText(user.name) || asText(user.username),
        mobile: asText(user.mobile),
        avatarInitial: asText(user.avatar_initial),
        avatarImage: asText(user.avatar_image),
        childGrade: asText(user.childGrade || user.grade),
        city: asText(user.city),
        region: asText(user.region),
      } : null,
      children,
    };
  });
}

router.get("/", async (req: Request, res: Response) => {
  try {
    const now = resolveNow(req.query.now);
    const items = await WelfareCampaign.find({}).sort({ sortOrder: -1, createdAt: -1 }).lean();
    const stats = await activationCodeStats(items.map((item) => item._id));
    res.json({ items: items.map((item) => withActivationCodeStats(item, now, stats)) });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "获取福利活动失败" });
  }
});

router.post("/", async (req: Request, res: Response) => {
  try {
    const payload = campaignPayload(req.body);
    if (!payload.title) {
      res.status(400).json({ message: "请填写福利标题" });
      return;
    }
    const campaign = await WelfareCampaign.create(payload);
    const now = resolveNow(req.body?.now);
    const stats = await activationCodeStats([campaign._id]);
    res.status(201).json({ campaign: withActivationCodeStats(campaign, now, stats) });
  } catch (error: any) {
    res.status(400).json({ message: error?.message || "创建福利活动失败" });
  }
});

router.put("/:id", async (req: Request, res: Response) => {
  try {
    const payload = campaignPayload(req.body);
    if (!payload.title) {
      res.status(400).json({ message: "请填写福利标题" });
      return;
    }
    const campaign = await WelfareCampaign.findOneAndUpdate(idQuery(asText(req.params.id)), payload, {
      returnDocument: "after",
      runValidators: true,
    });
    if (!campaign) {
      res.status(404).json({ message: "福利活动不存在" });
      return;
    }
    const now = resolveNow(req.body?.now);
    const stats = await activationCodeStats([campaign._id]);
    res.json({ campaign: withActivationCodeStats(campaign, now, stats) });
  } catch (error: any) {
    res.status(400).json({ message: error?.message || "更新福利活动失败" });
  }
});

router.post("/:id/activation-codes", async (req: Request, res: Response) => {
  try {
    const campaignId = asText(req.params.id);
    const campaign = await WelfareCampaign.findOne(idQuery(campaignId));
    if (!campaign) {
      res.status(404).json({ message: "福利活动不存在" });
      return;
    }
    const parsed = parseActivationCodes(req.body);
    const codes = parsed.codes;
    if (!codes.length) {
      res.status(400).json({ message: "请粘贴至少 1 个激活码" });
      return;
    }
    const existingCodes = new Set(
      (await WelfareActivationCode.find({ campaignId: campaign._id, code: { $in: codes } }).select("code").lean())
        .map((item: any) => asText(item.code))
    );
    const latest = await WelfareActivationCode.findOne({ campaignId: campaign._id }).sort({ importIndex: -1 }).select("importIndex").lean();
    let importIndex = Math.max(-1, Number(latest?.importIndex ?? -1));
    const documents = codes
      .filter((code) => !existingCodes.has(code))
      .map((code) => {
        importIndex += 1;
        return { campaignId: campaign._id, code, importIndex };
      });
    if (documents.length) {
      await WelfareActivationCode.insertMany(documents, { ordered: true });
    }
    const [codeCount, claimCount] = await Promise.all([
      WelfareActivationCode.countDocuments({ campaignId: campaign._id }),
      WelfareClaim.countDocuments({ campaignId: campaign._id, status: "claimed" }),
    ]);
    campaign.totalStock = Math.max(codeCount, claimCount);
    campaign.claimedCount = Math.max(Number(campaign.claimedCount || 0), claimCount);
    await campaign.save();
    const now = resolveNow(req.body?.now);
    const stats = await activationCodeStats([campaign._id]);
    res.json({
      importedCount: documents.length,
      skippedCount: parsed.duplicateCount + codes.length - documents.length,
      campaign: withActivationCodeStats(campaign, now, stats),
    });
  } catch (error: any) {
    res.status(400).json({ message: error?.message || "导入激活码失败" });
  }
});

router.get("/:id/claims", async (req: Request, res: Response) => {
  try {
    const campaign = await WelfareCampaign.findOne(idQuery(asText(req.params.id))).lean();
    if (!campaign) {
      res.status(404).json({ message: "福利活动不存在" });
      return;
    }
    res.json({ claims: await buildClaimRows(campaign) });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "获取领取记录失败" });
  }
});

router.get("/:id/claims/export", async (req: Request, res: Response) => {
  try {
    const campaign = await WelfareCampaign.findOne(idQuery(asText(req.params.id))).lean();
    if (!campaign) {
      res.status(404).json({ message: "福利活动不存在" });
      return;
    }
    const rows = await buildClaimRows(campaign);
    const header = ["福利标题", "领取时间", "状态", "用户ID", "昵称", "用户名", "手机号", "城市", "地区", "孩子档案", "激活码"];
    const csvRows = rows.map((claim: any) => [
      campaign.title,
      claim.claimedAt || claim.createdAt || "",
      claim.status,
      claim.userId,
      claim.user?.nickname || "",
      claim.user?.username || "",
      claim.user?.mobile || "",
      claim.user?.city || "",
      claim.user?.region || "",
      (claim.children || []).map((child: any) => [child.name, child.age, child.grade].filter(Boolean).join(" · ")).join("; "),
      claim.activationCode || "",
    ]);
    const csv = [header, ...csvRows].map((row) => row.map(csvCell).join(",")).join("\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="welfare-${campaign._id}-claims.csv"`);
    res.send(`\uFEFF${csv}`);
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "导出领取记录失败" });
  }
});

export default router;

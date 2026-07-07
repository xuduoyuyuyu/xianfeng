import { Router, Request, Response } from "express";
import mongoose from "mongoose";
import User from "../models/User";
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

router.get("/", async (req: Request, res: Response) => {
  try {
    const now = resolveNow(req.query.now);
    const items = await WelfareCampaign.find({}).sort({ sortOrder: -1, createdAt: -1 }).lean();
    res.json({ items: items.map((item) => serializeWelfareCampaign(item, now)) });
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
    res.status(201).json({ campaign: serializeWelfareCampaign(campaign, now) });
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
    res.json({ campaign: serializeWelfareCampaign(campaign, now) });
  } catch (error: any) {
    res.status(400).json({ message: error?.message || "更新福利活动失败" });
  }
});

router.get("/:id/claims", async (req: Request, res: Response) => {
  try {
    const campaign = await WelfareCampaign.findOne(idQuery(asText(req.params.id))).lean();
    if (!campaign) {
      res.status(404).json({ message: "福利活动不存在" });
      return;
    }
    const claims = await WelfareClaim.find({ campaignId: campaign._id }).sort({ claimedAt: -1 }).lean();
    const userIds = Array.from(new Set(claims.map((claim) => asText(claim.userId)).filter(mongoose.Types.ObjectId.isValid)));
    const [users, syncRows] = await Promise.all([
      User.find({ _id: { $in: userIds } }).select("_id username mobile name avatar_initial avatar_image childGrade grade city region").lean(),
      UserXiaowanziSync.find({ userId: { $in: userIds } }).select("userId childProfiles childProfileDeletions").lean(),
    ]);
    const usersById = new Map(users.map((user: any) => [String(user._id), user]));
    const syncByUserId = new Map(syncRows.map((row: any) => [String(row.userId), row]));
    const serialized = claims.map((claim: any) => {
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
    res.json({ claims: serialized });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "获取领取记录失败" });
  }
});

export default router;

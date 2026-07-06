import { Router, Request, Response } from "express";
import WelfareCampaign from "../models/WelfareCampaign";
import WelfareClaim from "../models/WelfareClaim";
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
    res.json({ claims: claims.map(serializeWelfareClaim) });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "获取领取记录失败" });
  }
});

export default router;

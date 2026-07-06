import { Router, Response } from "express";
import mongoose from "mongoose";
import WelfareCampaign from "../models/WelfareCampaign";
import WelfareClaim from "../models/WelfareClaim";
import { authenticate, AuthenticatedRequest } from "../middlewares/auth";
import {
  asText,
  idQuery,
  resolveNow,
  resolveWelfareAvailability,
  serializeWelfareCampaign,
  serializeWelfareClaim,
} from "./welfareUtils";

const router = Router();

router.get("/campaigns", async (req, res: Response) => {
  try {
    const now = resolveNow(req.query.now);
    const campaigns = await WelfareCampaign.find({ status: "published" }).sort({ sortOrder: -1, createdAt: -1 }).lean();
    const serialized = campaigns.map((campaign) => serializeWelfareCampaign(campaign, now));
    res.json({
      active: serialized.filter((campaign) => campaign.availability === "active"),
      history: serialized.filter((campaign) => campaign.availability === "expired" || campaign.availability === "sold_out"),
      upcoming: serialized.filter((campaign) => campaign.availability === "upcoming"),
    });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "获取福利失败" });
  }
});

router.post("/campaigns/:id/claims", authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const now = resolveNow(req.body?.now || req.query.now);
    const campaignId = asText(req.params.id);
    if (!mongoose.Types.ObjectId.isValid(campaignId)) {
      res.status(404).json({ message: "福利活动不存在" });
      return;
    }
    const userId = asText(req.user?.id);
    const existing = await WelfareClaim.findOne({ campaignId, userId, status: "claimed" }).lean();
    if (existing) {
      const campaign = await WelfareCampaign.findOne(idQuery(campaignId)).lean();
      res.json({
        claim: serializeWelfareClaim(existing),
        campaign: campaign ? serializeWelfareCampaign(campaign, now) : null,
      });
      return;
    }

    const campaign = await WelfareCampaign.findOne(idQuery(campaignId));
    if (!campaign || campaign.status !== "published") {
      res.status(404).json({ message: "福利活动不存在" });
      return;
    }
    const availability = resolveWelfareAvailability(campaign, now);
    if (availability === "expired") {
      res.status(410).json({ message: "福利已过期" });
      return;
    }
    if (availability === "sold_out") {
      res.status(409).json({ message: "这个福利已经被抢完" });
      return;
    }
    if (availability !== "active") {
      res.status(400).json({ message: "这个福利暂时不可领取" });
      return;
    }

    const updated = await WelfareCampaign.findOneAndUpdate(
      { _id: campaign._id, claimedCount: { $lt: campaign.totalStock } },
      { $inc: { claimedCount: 1 } },
      { returnDocument: "after" }
    );
    if (!updated) {
      res.status(409).json({ message: "这个福利已经被抢完" });
      return;
    }

    try {
      const claim = await WelfareClaim.create({
        campaignId: campaign._id,
        userId,
        claimedAt: now,
      });
      res.status(201).json({
        claim: serializeWelfareClaim(claim),
        campaign: serializeWelfareCampaign(updated, now),
      });
    } catch (error: any) {
      if (error?.code === 11000) {
        await WelfareCampaign.updateOne({ _id: campaign._id, claimedCount: { $gt: 0 } }, { $inc: { claimedCount: -1 } });
        const claim = await WelfareClaim.findOne({ campaignId, userId, status: "claimed" }).lean();
        const current = await WelfareCampaign.findOne(idQuery(campaignId)).lean();
        res.json({
          claim: claim ? serializeWelfareClaim(claim) : null,
          campaign: current ? serializeWelfareCampaign(current, now) : null,
        });
        return;
      }
      throw error;
    }
  } catch (error: any) {
    res.status(400).json({ message: error?.message || "领取福利失败" });
  }
});

export default router;

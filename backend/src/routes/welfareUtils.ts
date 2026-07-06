import mongoose from "mongoose";
import { WelfareCampaignStatus } from "../models/WelfareCampaign";

export type WelfareAvailability = "draft" | "hidden" | "archived" | "upcoming" | "active" | "expired" | "sold_out";

const CAMPAIGN_STATUSES: WelfareCampaignStatus[] = ["draft", "published", "hidden", "archived"];

export function asText(value: unknown): string {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

export function asOptionalDate(value: unknown): Date | null {
  const text = asText(value);
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function asNumber(value: unknown, fallback = 0): number {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function asStatus(value: unknown): WelfareCampaignStatus {
  const text = asText(value);
  return CAMPAIGN_STATUSES.includes(text as WelfareCampaignStatus) ? (text as WelfareCampaignStatus) : "draft";
}

export function resolveNow(value: unknown): Date {
  const parsed = asOptionalDate(value);
  return parsed || new Date();
}

export function idQuery(id: string) {
  if (mongoose.Types.ObjectId.isValid(id)) return { _id: id };
  return { _id: null };
}

export function resolveWelfareAvailability(campaign: any, now: Date): WelfareAvailability {
  if (campaign.status === "draft") return "draft";
  if (campaign.status === "hidden") return "hidden";
  if (campaign.status === "archived") return "archived";
  const startsAt = campaign.startsAt ? new Date(campaign.startsAt) : null;
  const endsAt = campaign.endsAt ? new Date(campaign.endsAt) : null;
  if (startsAt && startsAt.getTime() > now.getTime()) return "upcoming";
  if (endsAt && endsAt.getTime() <= now.getTime()) return "expired";
  if (Number(campaign.totalStock || 0) <= Number(campaign.claimedCount || 0)) return "sold_out";
  return "active";
}

export function serializeWelfareCampaign(campaign: any, now: Date) {
  const source = typeof campaign.toObject === "function" ? campaign.toObject() : campaign;
  const availability = resolveWelfareAvailability(source, now);
  const totalStock = Math.max(0, Number(source.totalStock || 0));
  const claimedCount = Math.max(0, Number(source.claimedCount || 0));
  return {
    ...source,
    _id: String(source._id),
    availability,
    totalStock,
    claimedCount,
    remainingStock: Math.max(0, totalStock - claimedCount),
  };
}

export function serializeWelfareClaim(claim: any) {
  const source = typeof claim.toObject === "function" ? claim.toObject() : claim;
  return {
    ...source,
    _id: String(source._id),
    campaignId: String(source.campaignId?._id || source.campaignId),
    userId: String(source.userId?._id || source.userId),
  };
}

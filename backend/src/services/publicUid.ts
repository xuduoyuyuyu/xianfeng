import { randomInt } from "node:crypto";
import User from "../models/User";

const PUBLIC_UID_MIN = 100_000_000;
const PUBLIC_UID_MAX_EXCLUSIVE = 1_000_000_000;
const PUBLIC_UID_PATTERN = /^\d{9}$/;

export function createPublicUid(): string {
  return String(randomInt(PUBLIC_UID_MIN, PUBLIC_UID_MAX_EXCLUSIVE));
}

export async function ensurePublicUid(userId: string): Promise<string> {
  const existing = await User.findById(userId).select("publicUid").lean();
  const existingUid = String(existing?.publicUid || "");
  if (PUBLIC_UID_PATTERN.test(existingUid)) return existingUid;

  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      const assigned = await User.findOneAndUpdate(
        { _id: userId, publicUid: { $in: [null, ""] } },
        { $set: { publicUid: createPublicUid() } },
        { returnDocument: "after" }
      ).select("publicUid").lean();
      const assignedUid = String(assigned?.publicUid || "");
      if (PUBLIC_UID_PATTERN.test(assignedUid)) return assignedUid;

      const current = await User.findById(userId).select("publicUid").lean();
      const currentUid = String(current?.publicUid || "");
      if (PUBLIC_UID_PATTERN.test(currentUid)) return currentUid;
    } catch (error: any) {
      if (error?.code === 11000) continue;
      throw error;
    }
  }

  throw new Error("生成用户 UID 失败，请稍后重试");
}

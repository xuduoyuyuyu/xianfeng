import mongoose from "mongoose";
import MamaResourceTask from "../models/MamaResourceTask";
import MamaResourceTaskAssignment from "../models/MamaResourceTaskAssignment";
import MamaResourceTaskContentLink from "../models/MamaResourceTaskContentLink";

export type MamaResourceContentLinkStats = {
  total: number;
  assigned: number;
  remaining: number;
};

function asText(value: unknown): string {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

export function normalizeMamaResourceContentUrl(value: unknown): string {
  const text = asText(value);
  if (!text) return "";
  const url = new URL(text);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("链接仅支持 HTTP(S)");
  }
  return url.toString();
}

export function parseMamaResourceContentLinks(input: any): { links: string[]; duplicateCount: number } {
  const source = Array.isArray(input?.links) ? input.links.join("\n") : asText(input?.linksText || input?.links);
  const seen = new Set<string>();
  let duplicateCount = 0;
  const links = String(source || "")
    .split(/[\n,，;\t]+/)
    .map((item) => asText(item))
    .filter(Boolean)
    .map((item, index) => {
      try {
        return normalizeMamaResourceContentUrl(item);
      } catch (error: any) {
        throw new Error(`第 ${index + 1} 条链接格式错误：${error?.message || "请输入有效链接"}`);
      }
    })
    .filter((item) => {
      if (seen.has(item)) {
        duplicateCount += 1;
        return false;
      }
      seen.add(item);
      return true;
    });
  return { links, duplicateCount };
}

export async function getMamaResourceContentLinkStats(taskIds: any[]) {
  const ids = taskIds
    .map((id) => String(id))
    .filter(mongoose.Types.ObjectId.isValid)
    .map((id) => new mongoose.Types.ObjectId(id));
  if (!ids.length) return new Map<string, MamaResourceContentLinkStats>();
  const rows = await MamaResourceTaskContentLink.aggregate([
    { $match: { taskId: { $in: ids } } },
    {
      $group: {
        _id: "$taskId",
        total: { $sum: 1 },
        assigned: { $sum: { $cond: [{ $ne: ["$assignmentId", null] }, 1, 0] } },
      },
    },
  ]);
  return new Map(rows.map((row: any) => {
    const total = Number(row.total || 0);
    const assigned = Number(row.assigned || 0);
    return [String(row._id), { total, assigned, remaining: Math.max(0, total - assigned) }];
  }));
}

export async function syncMamaResourceTaskContentState(taskId: any) {
  const task = await MamaResourceTask.findById(taskId).select("status contentLinkPoolEnabled pausedForContent");
  if (!task || !task.contentLinkPoolEnabled || task.status === "archived") return task;
  if (task.pausedForContent) {
    if (task.status === "paused") task.status = "listed";
    task.pausedForContent = false;
    await task.save();
  }
  return task;
}

async function reserveNextContentLink(taskId: any, assignment: any) {
  const now = new Date();
  const link = await MamaResourceTaskContentLink.findOneAndUpdate(
    { taskId, assignmentId: null },
    {
      $set: {
        assignmentId: assignment._id,
        assignedProfileId: assignment.profileId,
        assignedAt: now,
      },
    },
    { sort: { importIndex: 1, _id: 1 }, returnDocument: "after" }
  );
  if (!link) return null;
  const updatedAssignment = await MamaResourceTaskAssignment.findOneAndUpdate(
    {
      _id: assignment._id,
      taskId,
      contentUrl: { $in: ["", null] },
    },
    { $set: { contentUrl: link.url, contentUpdatedAt: now } },
    { returnDocument: "after", runValidators: true }
  );
  if (updatedAssignment) return updatedAssignment;
  await MamaResourceTaskContentLink.updateOne(
    { _id: link._id, assignmentId: assignment._id },
    { $set: { assignmentId: null, assignedProfileId: null, assignedAt: null } }
  );
  return null;
}

export async function assignNextMamaResourceContentLink(taskId: any, assignmentId: any) {
  const assignment = await MamaResourceTaskAssignment.findOne({ _id: assignmentId, taskId });
  if (!assignment) return null;
  if (assignment.contentUrl) return assignment;
  const updatedAssignment = await reserveNextContentLink(taskId, assignment);
  await syncMamaResourceTaskContentState(taskId);
  return updatedAssignment;
}

export async function distributeMamaResourceContentLinks(taskId: any) {
  const assignments = await MamaResourceTaskAssignment.find({
    taskId,
    contentUrl: { $in: ["", null] },
  }).sort({ createdAt: 1, _id: 1 });
  let assignedCount = 0;
  for (const assignment of assignments) {
    const updatedAssignment = await reserveNextContentLink(taskId, assignment);
    if (!updatedAssignment) break;
    assignedCount += 1;
  }
  await syncMamaResourceTaskContentState(taskId);
  return assignedCount;
}

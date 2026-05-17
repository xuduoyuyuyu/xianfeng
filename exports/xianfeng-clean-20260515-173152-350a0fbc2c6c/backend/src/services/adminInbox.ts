import mongoose from "mongoose";
import AdminInboxMessageModel, {
  InboxSourceType,
  InboxTargetType,
  InboxTaskStatus,
  InboxTaskType,
} from "../models/AdminInboxMessage";
import Program from "../models/Program";
import GuestModel from "../models/Guest";

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function clipText(value: unknown, max = 300): string {
  const text = asText(value);
  if (text.length <= max) return text;
  return `${text.slice(0, max).trim()}...`;
}

function taskTypeLabel(taskType: InboxTaskType): string {
  if (taskType === "proofread_transcript") return "文稿校对";
  if (taskType === "enrich_program_content") return "节目资料收集";
  if (taskType === "enrich_guest_profile") return "嘉宾资料收集";
  if (taskType === "generate_program_artwork") return "节目配图生成";
  return "节目解析";
}

function taskStatusLabel(taskStatus: InboxTaskStatus): string {
  if (taskStatus === "succeeded") return "已完成";
  if (taskStatus === "failed") return "失败";
  return "已取消";
}

async function resolveTargetTitle(targetType: InboxTargetType, targetId: string): Promise<string> {
  if (!mongoose.Types.ObjectId.isValid(targetId)) return "";
  const oid = new mongoose.Types.ObjectId(targetId);
  if (targetType === "program") {
    const row = await Program.findById(oid, { title: 1, programCode: 1 }).lean();
    return asText((row as any)?.title) || asText((row as any)?.programCode);
  }
  const guest = await GuestModel.findById(oid, { name: 1 }).lean();
  return asText((guest as any)?.name);
}

export async function createInboxMessage(input: {
  sourceType: InboxSourceType;
  sourceId: string;
  taskType: InboxTaskType;
  taskStatus: InboxTaskStatus;
  targetType: InboxTargetType;
  targetId: string;
  summary?: string;
  payload?: Record<string, any>;
}) {
  const sourceId = asText(input.sourceId);
  if (!sourceId) return null;
  if (!mongoose.Types.ObjectId.isValid(input.targetId)) return null;

  const targetTitle = await resolveTargetTitle(input.targetType, input.targetId);
  const title = `${taskTypeLabel(input.taskType)} · ${taskStatusLabel(input.taskStatus)}${targetTitle ? ` · ${targetTitle}` : ""}`;
  const summary = clipText(input.summary || "", 320);

  const doc = await AdminInboxMessageModel.findOneAndUpdate(
    {
      sourceType: input.sourceType,
      sourceId,
      taskStatus: input.taskStatus,
    },
    {
      $setOnInsert: {
        sourceType: input.sourceType,
        sourceId,
        taskType: input.taskType,
        taskStatus: input.taskStatus,
        targetType: input.targetType,
        targetId: new mongoose.Types.ObjectId(input.targetId),
        targetTitle,
        title,
        summary,
        payload: input.payload || {},
        isRead: false,
        readAt: null,
      },
    },
    { upsert: true, new: true }
  ).lean();

  return doc;
}

export function normalizeInboxMessage(row: any) {
  if (!row) return null;
  return {
    _id: String(row._id),
    sourceType: row.sourceType as InboxSourceType,
    sourceId: asText(row.sourceId),
    taskType: row.taskType as InboxTaskType,
    taskStatus: row.taskStatus as InboxTaskStatus,
    targetType: row.targetType as InboxTargetType,
    targetId: String(row.targetId),
    targetTitle: asText(row.targetTitle),
    title: asText(row.title),
    summary: asText(row.summary),
    payload: row.payload || {},
    isRead: !!row.isRead,
    readAt: row.readAt || null,
    createdAt: row.createdAt || null,
    updatedAt: row.updatedAt || null,
  };
}

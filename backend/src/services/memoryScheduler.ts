/**
 * 午夜定时任务：批量压缩提取孩子记忆
 * 每天凌晨 0:00 运行一次
 */
import * as cron from "node-cron";
import UserChildMemory from "../models/UserChildMemory";
import { processChildMemoryBatch, MemoryQueueItem } from "./childMemory";

// 队列存储：Map<userId:childId, MemoryQueueItem[]>
const memoryQueues = new Map<string, MemoryQueueItem[]>();

export function getMemoryQueues() {
  return memoryQueues;
}

export function enqueueToMemoryQueue(userId: string, childId: string, item: MemoryQueueItem) {
  const key = `${userId}:${childId}`;
  const queue = memoryQueues.get(key) || [];
  queue.push(item);
  // 最多保留 200 条待处理
  if (queue.length > 200) queue.shift();
  memoryQueues.set(key, queue);
}

export async function flushMemoryQueues() {
  const entries = Array.from(memoryQueues.entries());
  console.log(`[记忆压缩] 开始处理 ${entries.length} 个队列...`);

  for (const [key, items] of entries) {
    const [userId, childId] = key.split(":");
    if (!items.length) continue;

    try {
      const doc = await UserChildMemory.findOne({ userId, childId });
      if (!doc || doc.enabled === false) {
        // 没有文档或已禁用 → 清空队列
        memoryQueues.delete(key);
        continue;
      }

      const result = await processChildMemoryBatch({
        queueItems: items,
        previousSummary: doc.summary || "",
      });

      if (result.factsAdded.length) {
        doc.summary = result.summary;
        await doc.save();
        console.log(`[记忆压缩] ${key} 新增 ${result.factsAdded.length} 条记忆，总长 ${result.summary.length} 字`);
      }
    } catch (error: any) {
      console.error(`[记忆压缩] ${key} 失败:`, error?.message);
    }

    // 清空已处理的队列
    memoryQueues.delete(key);
  }

  console.log("[记忆压缩] 完成");
}

let cronJob: cron.ScheduledTask | null = null;

export function startMemoryScheduler() {
  if (cronJob) return;
  // 每天凌晨 0:00（Asia/Shanghai）
  cronJob = cron.schedule("0 0 * * *", async () => {
    console.log("[记忆压缩] 午夜定时任务触发");
    await flushMemoryQueues();
  }, {
    timezone: "Asia/Shanghai",
  });
  console.log("[记忆压缩] 午夜定时任务已启动（每天 00:00）");
}

export function stopMemoryScheduler() {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
  }
}

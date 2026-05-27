import type { RootState } from "../store";

/**
 * 获取当前用户的 userId，用于话题系统（创建者标识、隐藏列表等）
 * 优先级：登录用户 _id（MongoDB ObjectId） > 手机号 > localStorage 随机 ID（兜底）
 * 
 * 重要：永远不要返回空字符串！空字符串会导致后端 `if (userId)` 为 false，
 * 从而跳过 pending 话题查询和 userTopics 独立查询，导致用户创建的话题"丢失"。
 */
export function getTopicUserId(currentUser: RootState["user"]["user"] | null): string {
  if (currentUser) {
    // 优先用 _id，可直接关联 User 表
    if (currentUser._id) return currentUser._id;
    const mobile = (currentUser as any).mobile;
    if (mobile) return String(mobile);
    // _id 和 mobile 都没有（数据异常？），降级用 localStorage 随机 ID
    console.warn("[getTopicUserId] 登录用户缺少 _id 和 mobile，降级使用 localStorage 随机 ID");
  }
  // 未登录 / 降级：用 localStorage 随机 ID（持久化，刷新不变）
  const key = "xianfeng_topic_userId";
  let uid = localStorage.getItem(key);
  if (!uid) {
    uid = "user_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    localStorage.setItem(key, uid);
  }
  return uid;
}

import type { RootState } from "../store";

/**
 * 获取当前用户的 userId，用于话题系统（创建者标识、隐藏列表等）
 * 优先级：登录用户 _id（MongoDB ObjectId） > 手机号 > localStorage 随机 ID（未登录兜底）
 */
export function getTopicUserId(currentUser: RootState["user"]["user"] | null): string {
  if (currentUser) {
    // 优先用 _id，可直接关联 User 表
    if (currentUser._id) return currentUser._id;
    const mobile = (currentUser as any).mobile || "";
    if (mobile) return mobile;
    return "";
  }
  // 未登录：用 localStorage 随机 ID
  const key = "xianfeng_topic_userId";
  let uid = localStorage.getItem(key);
  if (!uid) {
    uid = "user_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    localStorage.setItem(key, uid);
  }
  return uid;
}

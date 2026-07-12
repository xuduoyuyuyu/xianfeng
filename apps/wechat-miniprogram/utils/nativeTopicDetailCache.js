const NATIVE_TOPIC_DETAIL_CACHE_PREFIX = "xf_native_topic_detail_cache:";
const NATIVE_TOPIC_DETAIL_CACHE_VERSION = 1;
const NATIVE_TOPIC_DETAIL_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

function normalizeKeyPart(value, fallback) {
  const text = String(value || "").trim();
  return text || fallback;
}

function nativeTopicDetailCacheKey(slug, userId) {
  return `${NATIVE_TOPIC_DETAIL_CACHE_PREFIX}${normalizeKeyPart(slug, "topic")}:${normalizeKeyPart(userId, "anon")}`;
}

function readNativeTopicDetailCache(slug, userId) {
  try {
    const value = wx.getStorageSync(nativeTopicDetailCacheKey(slug, userId));
    if (!value || typeof value !== "object") return null;
    if (value.version !== NATIVE_TOPIC_DETAIL_CACHE_VERSION) return null;
    if (String(value.slug || "").trim() !== String(slug || "").trim()) return null;
    if (String(value.userId || "").trim() !== String(userId || "").trim()) return null;
    const cachedAt = Number(value.cachedAt) || 0;
    if (!cachedAt || Date.now() - cachedAt > NATIVE_TOPIC_DETAIL_CACHE_TTL_MS) return null;
    return value;
  } catch (_error) {
    return null;
  }
}

function saveNativeTopicDetailCache(slug, userId, patch) {
  const topicSlug = String(slug || "").trim();
  if (!topicSlug || !patch || typeof patch !== "object") return;
  try {
    const existing = readNativeTopicDetailCache(topicSlug, userId) || {};
    wx.setStorageSync(nativeTopicDetailCacheKey(topicSlug, userId), {
      ...existing,
      ...patch,
      version: NATIVE_TOPIC_DETAIL_CACHE_VERSION,
      cachedAt: Date.now(),
      userId: String(userId || "").trim(),
      slug: topicSlug
    });
  } catch (_error) {}
}

module.exports = {
  nativeTopicDetailCacheKey,
  readNativeTopicDetailCache,
  saveNativeTopicDetailCache
};

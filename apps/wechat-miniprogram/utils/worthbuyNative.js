const CACHE_PREFIX = "xf_native_worthbuy:";

function text(value) { return String(value == null ? "" : value).trim(); }
function list(value) { return Array.isArray(value) ? value.map(text).filter(Boolean) : []; }
function objectList(value) { return Array.isArray(value) ? value.filter((item) => item && typeof item === "object") : []; }

function normalizeWorthBuyResult(value, fallbackTitle) {
  const source = value && typeof value === "object" ? value : {};
  const dimensions = source.ratingDimensions && typeof source.ratingDimensions === "object"
    ? Object.entries(source.ratingDimensions).map(([key, score]) => ({ key, score: Math.max(0, Math.min(100, Number(score) || 0)) }))
    : [];
  const result = {
    title: text(source.brand || source.title || fallbackTitle || "知物分析"),
    score: Math.max(0, Math.min(100, Number(source.score) || 0)),
    isIqTax: source.isIqTax === true,
    reason: text(source.reason || source.summary || source.verdict),
    priceRange: text(source.priceRange),
    pros: list(source.pros), cons: list(source.cons),
    businessModel: text(source.businessModel), commentAnalysis: text(source.commentAnalysis),
    recommendation: text(source.recommendation), buyAdvice: text(source.buyAdvice),
    dataPoints: list(source.dataPoints), suitableFor: list(source.suitableFor), notSuitableFor: list(source.notSuitableFor),
    references: objectList(source.references).map((item) => ({ title: text(item.title), url: text(item.url), type: text(item.type) })).filter((item) => item.title || item.url),
    alternatives: objectList(source.alternatives).map((item) => ({ name: text(item.name), price: text(item.price), score: Number(item.score) || 0, reason: text(item.reason) })).filter((item) => item.name),
    dimensions,
    analyzedAt: text(source.analyzedAt),
    url: text(source.url), brand: text(source.brand)
  };
  for (const key of ["Pros", "Cons", "BusinessModel", "CommentAnalysis", "DataPoints", "Audience", "Alternatives", "Recommendation", "BuyAdvice", "References", "Dimensions"]) {
    const property = key.charAt(0).toLowerCase() + key.slice(1);
    const valueForKey = property === "audience" ? result.suitableFor.length + result.notSuitableFor.length : result[property];
    result[`has${key}`] = Array.isArray(valueForKey) ? valueForKey.length > 0 : !!valueForKey;
  }
  return result;
}

function normalizeWorthBuyItem(item) {
  const source = item && typeof item === "object" ? item : {};
  const query = text(source.query || source.brand || (source.result && (source.result.brand || source.result.title)));
  return { id: text(source._id || query), query, status: text(source.status), createdAt: text(source.createdAt), ...normalizeWorthBuyResult(source.result || source, query) };
}

function classifyWorthBuyError(error) {
  const status = Number(error && error.statusCode);
  const data = (error && error.data) || {};
  if (status === 401) return "auth";
  if (status === 402 && (data.remainingPointBalance !== undefined || /point|点数/i.test(text(data.code || data.message)))) return "points";
  if (status === 402 || data.code === "PRO_REQUIRED") return "pro";
  if (status === 400 || status === 422) return "validation";
  return "network";
}

function worthBuyDetailPath(query) { return `/pages/worthbuy-detail/index?query=${encodeURIComponent(text(query))}`; }
function cacheKey(key) { return `${CACHE_PREFIX}${key}`; }
function writeWorthBuyCache(key, ownerId, value) { try { wx.setStorageSync(cacheKey(key), { ownerId: text(ownerId), savedAt: Date.now(), value }); } catch (_error) {} }
function readWorthBuyCache(key, ownerId) { try { const payload = wx.getStorageSync(cacheKey(key)); return payload && payload.ownerId === text(ownerId) ? payload.value : null; } catch (_error) { return null; } }
function parseWorthBuyInput(value) {
  const raw = text(value);
  const match = raw.match(/https?:\/\/[^\s]+/i);
  const url = match ? match[0] : "";
  const title = text(raw.replace(url, "").replace(/^【[^】]+】/, "").replace(/[，,。；;]+$/, ""));
  return { raw, url, title: title || (url ? "" : raw), brand: title || raw };
}

module.exports = { normalizeWorthBuyResult, normalizeWorthBuyItem, classifyWorthBuyError, worthBuyDetailPath, writeWorthBuyCache, readWorthBuyCache, parseWorthBuyInput };

const { DEFAULT_WEB_ORIGIN } = require("../../utils/config");
const { getNativeTopbarMetrics, getNativeWebviewParams } = require("../../utils/nativeChrome");
const { SETTINGS_SECTIONS, createNativeSettingsMethods } = require("../../utils/nativeSettings");
const { request } = require("../../utils/request");
const { preloadNativeReadingBooks } = require("../../utils/readingPreload");
const { getToken } = require("../../utils/session");
const { createPageShare, createWebviewShare, enableShareMenu } = require("../../utils/share");
const { TOPIC_DETAIL_WEBVIEW_VERSION, WELFARE_WEBVIEW_VERSION, buildNativeProUrl, inferWebPageTitle, webUrl: buildWebUrl } = require("../../utils/webview");
const { readNativeTopicDetailCache, saveNativeTopicDetailCache } = require("../../utils/nativeTopicDetailCache");

const LOGO_HEIGHT_RPX = 56;
const BOOK_DETAIL_CACHE_PREFIX = "xf_native_book_detail:";
const NATIVE_BOOKS_CACHE_KEY = "xf_native_books_cache_v6";
const NATIVE_BOOKS_FIRST_PAGE_CACHE_KEY = "xf_native_books_first_page_v3";
const EXTERNAL_BOOK_DETAIL_CACHE_PREFIX = "xf_external_book_detail:";
const EXTERNAL_BOOK_LIBRARY_RECORDS_KEY = "xf_external_book_library:records";
const READING_PENDING_FILTER_KEY = "xf_reading_pending_filter_v1";
const DEFAULT_READING_COVER_IMAGE = "/assets/menu/jiyue-logo.png";
const GUEST_FALLBACK_AVATAR = "/assets/wel-avatar/no-hat.png";
const GUEST_FALLBACK_AVATAR_MARKERS = [
  "/assets/xiaowanzi-nohat.png",
  "/assets/wel-avatar/no-hat.png",
  "/assets/wel-avatar/optimized/no-hat.webp",
  "1779668991727-vzxkyx0x.png",
  "1780579648191-wkisaaid.png"
];
const GUEST_WISHES_KEY = "xf_guest_wishes";
const GUEST_WISHES_SENT_KEY = "xf_guest_wishes_sent";
const INVALID_TOPIC_CACHE_KEY = "xf_native_topic_invalidated_v1";

function readStorageMap(key) {
  try {
    const value = wx.getStorageSync(key);
    if (value && typeof value === "object") return { ...value };
    if (typeof value === "string" && value.trim()) {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" ? parsed : {};
    }
  } catch (_error) {}
  return {};
}

function readGuestWishState(guestId) {
  const key = String(guestId || "").trim();
  if (!key) return { count: 0, sent: false };
  const counts = readStorageMap(GUEST_WISHES_KEY);
  const sent = readStorageMap(GUEST_WISHES_SENT_KEY);
  return {
    count: Math.max(0, Number(counts[key]) || 0),
    sent: !!sent[key]
  };
}

function recordGuestWish(guestId, count) {
  const key = String(guestId || "").trim();
  if (!key) return;
  const counts = readStorageMap(GUEST_WISHES_KEY);
  const sent = readStorageMap(GUEST_WISHES_SENT_KEY);
  counts[key] = Math.max(1, Number(count) || 1);
  sent[key] = true;
  wx.setStorageSync(GUEST_WISHES_KEY, counts);
  wx.setStorageSync(GUEST_WISHES_SENT_KEY, sent);
}

function createGuestWishBubbles() {
  const stamp = Date.now();
  return Array.from({ length: 5 }, (_item, index) => ({
    id: `${stamp}-${index}-${Math.round(Math.random() * 100000)}`,
    right: -28 + Math.round(Math.random() * 68),
    delay: index * 80,
    duration: 800 + Math.round(Math.random() * 800)
  }));
}

function updateNativeWishState(page, dataKey, patch) {
  const current = page.data[dataKey] || {};
  page.setData({ [dataKey]: { ...current, ...patch } });
}

function triggerNativeWishFeedback(page, dataKey) {
  const prefix = dataKey === "nativeProgram" ? "guestWish" : "wish";
  if (page.guestWishPulseTimer) clearTimeout(page.guestWishPulseTimer);
  if (page.guestWishBubbleTimer) clearTimeout(page.guestWishBubbleTimer);
  updateNativeWishState(page, dataKey, {
    [`${prefix}Animating`]: false,
    [`${prefix}Bubbles`]: []
  });
  const start = () => updateNativeWishState(page, dataKey, {
    [`${prefix}Animating`]: true,
    [`${prefix}Bubbles`]: createGuestWishBubbles()
  });
  if (wx.nextTick) wx.nextTick(start);
  else start();
  page.guestWishPulseTimer = setTimeout(() => {
    updateNativeWishState(page, dataKey, { [`${prefix}Animating`]: false });
  }, 300);
  page.guestWishBubbleTimer = setTimeout(() => {
    updateNativeWishState(page, dataKey, { [`${prefix}Bubbles`]: [] });
  }, 1700);
}

function submitNativeGuestWish(page, dataKey, guestId, programId) {
  const id = String(guestId || "").trim();
  if (!id) return;
  const current = page.data[dataKey] || {};
  const stored = readGuestWishState(id);
  const alreadySent = !!(current.wishSent || current.guestWishSent || stored.sent);
  const currentCount = Math.max(0, Number(current.wishCount || current.guestWishCount || stored.count) || 0);
  const count = alreadySent ? currentCount : currentCount + 1;
  if (!alreadySent) recordGuestWish(id, count);
  const prefix = dataKey === "nativeProgram" ? "guestWish" : "wish";
  updateNativeWishState(page, dataKey, {
    [`${prefix}Sent`]: true,
    [`${prefix}Count`]: count
  });
  triggerNativeWishFeedback(page, dataKey);
  request({
    url: `/api/guests/${encodeURIComponent(id)}/return-wish`,
    method: "POST",
    data: { programId: String(programId || id) }
  }).catch(() => {});
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch (_error) {
    return value;
  }
}

function normalizeNativeTopicSlugParam(value) {
  return safeDecode(String(value || "").trim()).trim();
}

function externalBookDetailCacheKey(id) {
  return `${EXTERNAL_BOOK_DETAIL_CACHE_PREFIX}${String(id || "").trim()}`;
}

function bookDetailCacheKey(id) {
  return `${BOOK_DETAIL_CACHE_PREFIX}${String(id || "").trim()}`;
}

function getUrlPathname(value) {
  const source = String(value || "").trim();
  if (!source) return "";
  const withoutHash = source.split("#")[0];
  const withoutOrigin = withoutHash.replace(/^https?:\/\/[^/]+/i, "");
  const pathAndSearch = withoutOrigin || "/";
  const queryIndex = pathAndSearch.indexOf("?");
  return queryIndex >= 0 ? pathAndSearch.slice(0, queryIndex) || "/" : pathAndSearch;
}

function getUrlSearch(value) {
  const source = String(value || "").trim();
  const withoutHash = source.split("#")[0];
  const queryStart = withoutHash.indexOf("?");
  if (queryStart < 0) return "";
  return withoutHash.slice(queryStart + 1);
}

function hasUrlParam(value, key) {
  const source = String(value || "");
  const queryStart = source.indexOf("?");
  if (queryStart < 0) return false;
  const hashStart = source.indexOf("#", queryStart);
  const query = source.slice(queryStart + 1, hashStart >= 0 ? hashStart : undefined);
  return query
    .split("&")
    .filter(Boolean)
    .some((pair) => safeDecode(pair.split("=")[0]) === key);
}

function getUrlParam(value, key) {
  const source = String(value || "");
  const queryStart = source.indexOf("?");
  if (queryStart < 0) return "";
  const hashStart = source.indexOf("#", queryStart);
  const query = source.slice(queryStart + 1, hashStart >= 0 ? hashStart : undefined);
  const matched = query
    .split("&")
    .filter(Boolean)
    .map((pair) => {
      const equalIndex = pair.indexOf("=");
      return {
        key: safeDecode(equalIndex >= 0 ? pair.slice(0, equalIndex) : pair),
        value: safeDecode(equalIndex >= 0 ? pair.slice(equalIndex + 1) : "")
      };
    })
    .find((pair) => pair.key === key);
  return matched ? matched.value : "";
}

function appendUrlParam(value, key, paramValue) {
  const source = String(value || "");
  const hashIndex = source.indexOf("#");
  const beforeHash = hashIndex >= 0 ? source.slice(0, hashIndex) : source;
  const hash = hashIndex >= 0 ? source.slice(hashIndex) : "";
  const separator = beforeHash.indexOf("?") >= 0 ? "&" : "?";
  return `${beforeHash}${separator}${encodeURIComponent(key)}=${encodeURIComponent(paramValue)}${hash}`;
}

function isTopicDetailWebPath(value) {
  return getUrlPathname(value).indexOf("/topics/") === 0;
}

function isProgramDetailWebPath(value) {
  return /^\/programs\/[^/?#]+$/.test(getUrlPathname(value));
}

function isWelfareWebPath(value) {
  return getUrlPathname(value) === "/welfare";
}

function isProWebPath(value) {
  const pathname = getUrlPathname(value);
  return pathname === "/pro" || pathname === "/pro/success";
}

function withNativeWebviewParams(value) {
  let source = String(value || "").trim();
  if (!source) return "";
  const params = getNativeWebviewParams();
  if (isProgramDetailWebPath(source)) params.xf_tab = "0";
  Object.keys(params).forEach((key) => {
    if (!hasUrlParam(source, key)) source = appendUrlParam(source, key, params[key]);
  });
  if (!hasUrlParam(source, "xf_mp")) source = appendUrlParam(source, "xf_mp", "1");
  if (isTopicDetailWebPath(source) && !hasUrlParam(source, "xf_mpv")) {
    source = appendUrlParam(source, "xf_mpv", TOPIC_DETAIL_WEBVIEW_VERSION);
  }
  if (isWelfareWebPath(source) && !hasUrlParam(source, "xf_wpv")) {
    source = appendUrlParam(source, "xf_wpv", WELFARE_WEBVIEW_VERSION);
  }
  return source;
}

function inferPageTitle(src, fallback) {
  return inferWebPageTitle(src, fallback || "家长先疯");
}

function resolveWebviewTitle(src, rawTitle) {
  const inferredTitle = inferPageTitle(src, "家长先疯");
  if (getUrlPathname(src) === "/welfare") return inferredTitle;
  return String(rawTitle || "").trim() || inferredTitle;
}

function normalizePublicAssetUrl(value) {
  const source = String(value || "").trim();
  if (!source) return "";
  if (source.indexOf("http://xianfeng.xinzhi.info/") === 0) {
    return `${DEFAULT_WEB_ORIGIN}${source.slice("http://xianfeng.xinzhi.info".length)}`;
  }
  try {
    const parsed = new URL(source);
    const host = parsed.hostname.toLowerCase();
    const isLocalBackend = host === "xianfeng_backend" || host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0";
    if (isLocalBackend && parsed.pathname.indexOf("/uploads/") === 0) {
      return `${DEFAULT_WEB_ORIGIN}${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
  } catch (_error) {
    // Relative assets are handled below.
  }
  if (/^https?:\/\//.test(source)) return source;
  return `${DEFAULT_WEB_ORIGIN}${source.startsWith("/") ? source : `/${source}`}`;
}

function normalizeImage(value) {
  return normalizePublicAssetUrl(value);
}

function resolveNativeGuestAvatar(value) {
  const source = String(value || "").trim();
  const isFallback = !source || GUEST_FALLBACK_AVATAR_MARKERS.some((marker) => source.indexOf(marker) >= 0);
  return {
    src: isFallback ? GUEST_FALLBACK_AVATAR : normalizeImage(source),
    isFallback
  };
}

function normalizeProgramGuests(item) {
  const source = item || {};
  const bindings = Array.isArray(source.guestBindings)
    ? source.guestBindings.slice().sort((left, right) => Number(left?.order || 0) - Number(right?.order || 0))
    : [];
  const bindingGuests = bindings
    .map((binding) => binding && binding.guest)
    .filter((guest) => {
      const value = guest || {};
      return Boolean(firstText([value._id, value.id, value.slug, value.name], ""));
    });
  const candidates = bindingGuests.length
    ? bindingGuests
    : [].concat(Array.isArray(source.guests) ? source.guests : []).concat(source.guest || []);
  const seen = new Set();
  return candidates
    .map((value) => {
      const guest = value || {};
      const id = firstText([guest._id, guest.id, guest.slug], "");
      const name = firstText([guest.name], "");
      if (!id && !name) return null;
      const key = id || name.toLowerCase().replace(/\s+/g, "");
      if (!key || seen.has(key)) return null;
      seen.add(key);
      const avatar = resolveNativeGuestAvatar(guest.avatar);
      return {
        id,
        name: name || "节目特邀嘉宾",
        title: firstText([guest.title], "教育与成长观察者"),
        bio: firstText([guest.bio], "围绕家庭关系、成长节奏与学习环境，提炼节目中的关键视角。"),
        avatar: avatar.src,
        avatarFallback: avatar.isFallback
      };
    })
    .filter(Boolean);
}

function buildNativeProgramGuestState(guests, activeGuestIndex) {
  const list = Array.isArray(guests) ? guests : [];
  const index = Number.isInteger(activeGuestIndex) && activeGuestIndex >= 0 && activeGuestIndex < list.length
    ? activeGuestIndex
    : 0;
  const guest = list[index] || {};
  const guestTitle = firstText([guest.title], "教育与成长观察者");
  return {
    activeGuestIndex: index,
    guestId: firstText([guest.id], ""),
    guestName: firstText([guest.name], "节目特邀嘉宾"),
    guestTitle,
    guestBio: firstText([guest.bio], "围绕家庭关系、成长节奏与学习环境，提炼节目中的关键视角。"),
    guestAvatar: firstText([guest.avatar], GUEST_FALLBACK_AVATAR),
    guestAvatarFallback: guest.avatarFallback !== false
  };
}

function normalizeBookImage(value) {
  const source = String(value || "").trim();
  if (!source) return "";
  if (source.indexOf("http://xianfeng.xinzhi.info/") === 0) {
    return `${DEFAULT_WEB_ORIGIN}${source.slice("http://xianfeng.xinzhi.info".length)}`;
  }
  if (source.indexOf(`${DEFAULT_WEB_ORIGIN}/api/books/proxy-image`) === 0) return source;
  if (/^https?:\/\//.test(source)) {
    if (source.indexOf(`${DEFAULT_WEB_ORIGIN}/`) === 0) return source;
    return `${DEFAULT_WEB_ORIGIN}/api/books/proxy-image?url=${encodeURIComponent(source.replace(/^http:\/\//i, "https://"))}`;
  }
  return `${DEFAULT_WEB_ORIGIN}${source.startsWith("/") ? source : `/${source}`}`;
}

function normalizeBookCoverImage(value) {
  return normalizeBookImage(value) || DEFAULT_READING_COVER_IMAGE;
}

function firstText(values, fallback) {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) return text;
  }
  return fallback;
}

function sanitizeNativeTopicSharePath(value) {
  const source = String(value || "").trim() || "/topics";
  try {
    const url = new URL(source.startsWith("http") ? source : `${DEFAULT_WEB_ORIGIN}${source.startsWith("/") ? source : `/${source}`}`);
    ["xf_token", "token", "secret", "userId"].forEach((key) => url.searchParams.delete(key));
    const query = url.searchParams.toString();
    return `${url.pathname}${query ? `?${query}` : ""}${url.hash || ""}`;
  } catch (_error) {
    return source.startsWith("/") ? source : `/${source}`;
  }
}

function createNativeTopicShare(data) {
  const topic = data && data.nativeTopic || {};
  const slug = firstText([topic.slug, data && data.nativeTopicSlug, topic.id], "");
  const title = firstText([topic.title, data && data.title], "家长先疯请教");
  const topicId = firstText([topic.id, topic.slug, slug], "");
  const topicPath = sanitizeNativeTopicSharePath(topic.path || (slug ? `/topics/${slug}` : "/topics"));
  const target = `/pages/webview/index?url=${encodeURIComponent(topicPath)}&title=${encodeURIComponent(title)}&topicId=${encodeURIComponent(topicId)}`;
  return createPageShare({
    title,
    path: "/pages/share/index",
    query: { target }
  });
}

function formatDate(value) {
  const source = String(value || "").trim();
  if (!source) return "未发布";
  const match = source.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return "未发布";
  return `${match[1]}/${Number(match[2])}/${Number(match[3])}`;
}

function extractProgramId(src) {
  try {
    const pathname = getUrlPathname(src);
    const match = pathname.match(/^\/programs\/([^/?#]+)$/);
    if (!match) return "";
    return safeDecode(match[1]);
  } catch (_error) {
    return "";
  }
}

function extractMaterialId(src) {
  try {
    const pathname = getUrlPathname(src);
    const match = pathname.match(/^\/materials\/([^/?#]+)$/);
    if (!match) return "";
    return safeDecode(match[1]);
  } catch (_error) {
    return "";
  }
}

function extractExpertId(src) {
  try {
    const pathname = getUrlPathname(src);
    const match = pathname.match(/^\/experts\/([^/?#]+)$/);
    if (!match) return "";
    return safeDecode(match[1]);
  } catch (_error) {
    return "";
  }
}

function extractWorthBuyQuery(src) {
  try {
    const pathname = getUrlPathname(src);
    const match = pathname.match(/^\/worthbuy\/([^/?#]+)$/);
    if (!match) return "";
    return safeDecode(match[1]);
  } catch (_error) {
    return "";
  }
}

function extractBookId(src) {
  try {
    const pathname = getUrlPathname(src);
    const match = pathname.match(/^\/reading\/([^/?#]+)$/);
    if (!match) return "";
    return safeDecode(match[1]);
  } catch (_error) {
    return "";
  }
}

function extractExternalBookId(src) {
  try {
    const queryId = firstText([getUrlParam(src, "xf_external_book_id")], "");
    if (queryId) return queryId;
    const pathname = getUrlPathname(src);
    const match = pathname.match(/^\/library\/([^/?#]+)$/);
    if (match) return safeDecode(match[1]);
    const payload = getUrlParam(src, "xf_external_book");
    if (!payload) return "";
    const parsed = JSON.parse(payload);
    return firstText([parsed && parsed.id], "");
  } catch (_error) {
    return "";
  }
}

function parseExternalBookPayload(src) {
  try {
    const payload = getUrlParam(src, "xf_external_book");
    if (!payload) return null;
    const parsed = JSON.parse(payload);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed;
  } catch (_error) {
    return null;
  }
}

function readBookDetailCache(bookId) {
  try {
    if (!bookId || !wx.getStorageSync) return null;
    const cached = wx.getStorageSync(bookDetailCacheKey(bookId));
    if (!cached || typeof cached !== "object" || Array.isArray(cached)) return null;
    return cached;
  } catch (_error) {
    return null;
  }
}

function readExternalBookDetailCache(bookId) {
  try {
    if (!bookId || !wx.getStorageSync) return null;
    const cached = wx.getStorageSync(externalBookDetailCacheKey(bookId));
    if (!cached || typeof cached !== "object" || Array.isArray(cached)) return null;
    return cached;
  } catch (_error) {
    return null;
  }
}

function readExternalBookLibraryRecords() {
  try {
    if (!wx.getStorageSync) return [];
    const cached = wx.getStorageSync(EXTERNAL_BOOK_LIBRARY_RECORDS_KEY);
    if (!Array.isArray(cached)) return [];
    return cached.filter((item) => item && typeof item === "object" && item.id);
  } catch (_error) {
    return [];
  }
}

function getExternalBookFallback(src, bookId) {
  const cached = readExternalBookDetailCache(bookId);
  if (cached) return cached;
  const payload = parseExternalBookPayload(src);
  if (!payload) return null;
  const payloadId = firstText([payload.id], "");
  if (payloadId && payloadId !== bookId) return null;
  return payload;
}

function inferSelectedTab(src) {
  try {
    const pathname = getUrlPathname(src);
    if (isXiaowanziSuperWebview(src)) return 2;
    if (pathname.startsWith("/reading") || pathname.startsWith("/books") || pathname.startsWith("/library")) return 1;
    if (pathname.startsWith("/materials")) return 3;
    if (pathname.startsWith("/topics")) return 4;
    return 0;
  } catch (_error) {
    return 0;
  }
}

function isXiaowanziSuperWebview(src) {
  try {
    return getUrlPathname(src) === "/index-xiaowanzi.html";
  } catch (_error) {
    return false;
  }
}

function isXiaowanziLayerWebview(src) {
  try {
    return getUrlParam(src, "xw_layer") === "1" && getUrlParam(src, "xw_return") === "xiaowanzi";
  } catch (_error) {
    return false;
  }
}

function shouldHideNativeTabbar(src) {
  try {
    const pathname = getUrlPathname(src);
    return pathname === "/planning" || isProgramDetailWebPath(src) || isXiaowanziSuperWebview(src) || isXiaowanziLayerWebview(src);
  } catch (_error) {
    return false;
  }
}

function normalizeTags(value) {
  return Array.isArray(value)
    ? value.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 4)
    : [];
}

function formatProgramTranscriptSpeaker(value) {
  const speaker = String(value || "").trim();
  const normalized = speaker.toLowerCase();
  if (!speaker) return "";
  if (normalized === "ali" || normalized === "阿力" || normalized === "all" || normalized === "主持" || normalized === "host" || normalized === "主播·阿力") return "主播·阿力";
  if (normalized === "jessie" || normalized === "主播·jessie") return "主播·Jessie";
  if (normalized === "主持人") return "主播·阿力";
  if (normalized.startsWith("主播·") || normalized.startsWith("主持人") || normalized.startsWith("嘉宾·") || normalized.startsWith("嘉宾")) return speaker;
  return `嘉宾·${speaker}`;
}

function formatProgramTranscriptTimePoint(value) {
  const source = String(value || "").trim();
  if (!source) return "";
  const time = source.replace(/\.\d+$/, "");
  const timeParts = time.split(":");
  if (timeParts.length !== 2 && timeParts.length !== 3) return "";
  const numbers = timeParts.map((item) => Number(item));
  if (numbers.some((item) => !Number.isInteger(item) || item < 0)) return "";
  const totalSeconds = timeParts.length === 3
    ? numbers[0] * 3600 + numbers[1] * 60 + numbers[2]
    : numbers[0] * 60 + numbers[1];
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function normalizeProgramTranscriptTime(value, nextValue) {
  const source = String(value || "").trim();
  if (!source) return "";
  const parts = source.split("-").map((part) => part.trim()).filter(Boolean);
  const formatted = parts.map((part) => formatProgramTranscriptTimePoint(part));
  if (formatted.length === 1 && nextValue) {
    const nextStart = formatProgramTranscriptTimePoint(String(nextValue || "").split("-")[0]);
    if (nextStart) return `${formatted[0]}-${nextStart}`;
  }
  return formatted.every(Boolean) ? formatted.join("-") : "";
}

function normalizeProgramDictionaryEntries(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => {
      const term = firstText([item && item.term, item && item.name], "");
      const definition = firstText([item && item.definition, item && item.description], "");
      if (!term || !definition) return null;
      const aliases = Array.isArray(item && item.aliases)
        ? item.aliases.map((alias) => String(alias || "").trim()).filter(Boolean)
        : [];
      const matchTerms = Array.from(new Set([term, ...aliases])).sort((a, b) => b.length - a.length);
      const normalizedAliases = matchTerms.filter((alias) => alias !== term);
      return {
        id: firstText([item && item._id, item && item.id], `dictionary-${index}`),
        term,
        definition,
        aliases: normalizedAliases,
        aliasLabel: normalizedAliases.join("、"),
        matchTerms
      };
    })
    .filter(Boolean);
}

function buildTranscriptDictionaryNodes(value, entries, seenEntryIds) {
  const text = String(value || "");
  const candidates = (Array.isArray(entries) ? entries : [])
    .flatMap((entry) => entry.matchTerms.map((matchText) => ({ entry, matchText })))
    .sort((left, right) => right.matchText.length - left.matchText.length);
  if (!text || !candidates.length) return text ? [{ type: "text", text }] : [];
  const nodes = [];
  let cursor = 0;
  while (cursor < text.length) {
    const matched = candidates.find((candidate) => text.startsWith(candidate.matchText, cursor));
    if (matched) {
      if (!seenEntryIds.has(matched.entry.id)) {
        nodes.push({
          type: "dictionary",
          text: matched.matchText,
          entryId: matched.entry.id,
          term: matched.entry.term
        });
        seenEntryIds.add(matched.entry.id);
      } else {
        const previous = nodes[nodes.length - 1];
        if (previous && previous.type === "text") previous.text += matched.matchText;
        else nodes.push({ type: "text", text: matched.matchText });
      }
      cursor += matched.matchText.length;
      continue;
    }
    const previous = nodes[nodes.length - 1];
    if (previous && previous.type === "text") previous.text += text[cursor];
    else nodes.push({ type: "text", text: text[cursor] });
    cursor += 1;
  }
  return nodes;
}

function normalizeTranscript(value, dictionaryEntries) {
  const seenEntryIds = new Set();
  return Array.isArray(value)
    ? value
      .map((item, index, items) => {
        const speaker = firstText([item && item.speaker], "");
        const text = firstText([item && item.text], "");
        const nextItem = items[index + 1];
        return {
          time: normalizeProgramTranscriptTime(item && item.time, nextItem && nextItem.time),
          speaker,
          speakerLabel: formatProgramTranscriptSpeaker(speaker),
          text,
          contentNodes: buildTranscriptDictionaryNodes(text, dictionaryEntries, seenEntryIds),
          featured: Boolean(item && item.featured)
        };
      })
      .filter((item) => item.text)
    : [];
}

function normalizeQuickView(value) {
  return Array.isArray(value)
    ? value
      .map((item) => ({
        time: firstText([item && item.timeRangeLabel, item && item.startTime], ""),
        summary: firstText([item && item.summary], "")
      }))
      .filter((item) => item.summary)
      .slice(0, 8)
    : [];
}

function normalizeProgramMindMapNode(value) {
  const item = value || {};
  const children = Array.isArray(item.children)
    ? item.children
      .map((child) => ({
        ...normalizeProgramMindMapNode(child)
      }))
      .filter((child) => child.title || child.summary)
    : [];
  return {
    title: firstText([item.title, item.label, item.name], ""),
    summary: firstText([item.summary, item.description, item.text], ""),
    emoji: firstText([item.emoji], ""),
    sourceTime: firstText([item.source && item.source.time], ""),
    children
  };
}

function normalizeProgramMindMap(deepDive, contentPack) {
  const mindMapRoot = deepDive && deepDive.mindMap && deepDive.mindMap.root;
  if (mindMapRoot) {
    const root = normalizeProgramMindMapNode(mindMapRoot);
    return root.title || root.summary || root.children.length ? { root } : null;
  }
  const value = contentPack && (contentPack.outline || contentPack.mindmap || contentPack.context || contentPack.timeline);
  if (Array.isArray(value)) return normalizeProgramMindMap({ mindMap: { root: { title: "脉络", children: value } } }, null);
  if (value && typeof value === "object") {
    if (Array.isArray(value.nodes)) return normalizeProgramMindMap({ mindMap: { root: { title: "脉络", children: value.nodes } } }, null);
    if (Array.isArray(value.items)) return normalizeProgramMindMap({ mindMap: { root: { title: "脉络", children: value.items } } }, null);
    const root = normalizeProgramMindMapNode(value);
    return root.title || root.summary || root.children.length ? { root } : null;
  }
  return null;
}

function getNativeProgramMindMapCollapsedBranchSet(value) {
  return new Set(
    (Array.isArray(value) ? value : [])
      .map((index) => Number(index))
      .filter((index) => Number.isInteger(index) && index >= 0)
  );
}

function getNativeProgramMindMapOutlineSummary(title, summary) {
  const normalizedTitle = String(title || "").trim();
  const normalizedSummary = String(summary || "").trim();
  return normalizedSummary && normalizedSummary !== normalizedTitle ? normalizedSummary : "";
}

function buildNativeProgramMindMapOutline(mindMap, collapsedBranches) {
  const root = mindMap && mindMap.root;
  const branches = root && Array.isArray(root.children) ? root.children : [];
  const collapsedSet = getNativeProgramMindMapCollapsedBranchSet(collapsedBranches);
  if (!root) return { root: { title: "", summary: "" }, branches: [] };
  return {
    root: {
      title: `${root.emoji ? `${root.emoji} ` : ""}${root.title || root.summary}`,
      summary: root.title ? getNativeProgramMindMapOutlineSummary(root.title, root.summary) : ""
    },
    branches: branches.map((branch, branchIndex) => {
      const allChildren = Array.isArray(branch.children) ? branch.children : [];
      const collapsed = allChildren.length > 0 && collapsedSet.has(branchIndex);
      return {
        id: `branch-${branchIndex}`,
        index: branchIndex,
        number: String(branchIndex + 1).padStart(2, "0"),
        title: `${branch.emoji ? `${branch.emoji} ` : ""}${branch.title || branch.summary}`,
        summary: branch.title ? getNativeProgramMindMapOutlineSummary(branch.title, branch.summary) : "",
        childCount: allChildren.length,
        collapsed,
        children: collapsed ? [] : allChildren.map((child, childIndex) => ({
          id: `child-${branchIndex}-${childIndex}`,
          title: `${child.emoji ? `${child.emoji} ` : ""}${child.title || child.summary}`,
          summary: child.title ? getNativeProgramMindMapOutlineSummary(child.title, child.summary) : ""
        }))
      };
    })
  };
}

function buildNativeCuratedReadingMeta(value, book) {
  const item = value || {};
  const matchedBook = book || {};
  const author = firstText([matchedBook.author, item.author], "");
  const translator = firstText([matchedBook.translator, item.translator], "");
  const publisher = firstText([matchedBook.publisher, item.publisher], "");
  return [
    author ? `作者：${author}` : "",
    translator ? `译者：${translator}` : "",
    publisher ? `出版社：${publisher}` : ""
  ].filter(Boolean).join(" · ");
}

function normalizeProgramCuratedReading(deepDive, verificationReport) {
  const items = Array.isArray(deepDive && deepDive.curatedReading) ? deepDive.curatedReading : [];
  const reportItems = Array.isArray(verificationReport && verificationReport.items) ? verificationReport.items : [];
  const verifiedItems = reportItems.filter(
    (item) => item?.passed === true && item?.titleMatched === true
  );
  const normalizedItems = items
    .map((value) => {
      const title = firstText([value && value.title], "");
      if (["教育相关推荐", "延伸阅读", "参考书目"].includes(title.replace(/\s+/g, ""))) return null;
      const titleKey = title.toLowerCase().replace(/\s+/g, " ");
      const url = firstText([value && value.url, value && value.link], "");
      if (!titleKey) return null;
      const verified = url
        ? verifiedItems.find((item) => {
            const verifiedTitle = firstText([item && item.title], "").toLowerCase().replace(/\s+/g, " ");
            const originalUrl = firstText([item && item.url], "");
            const finalUrl = firstText([item && item.finalUrl], "");
            return titleKey === verifiedTitle && (url === originalUrl || url === finalUrl);
          })
        : null;
      const book = value && value.book && typeof value.book === "object" ? value.book : {};
      const subtitle = firstText([value && value.reason, value && value.subtitle, value && value.description], "");
      return {
        title,
        subtitle: subtitle === "围绕节目主题延展出的实用阅读线索" ? "" : subtitle,
        meta: buildNativeCuratedReadingMeta(value, book),
        bookId: firstText([book.id, book._id, value && value.bookId], ""),
        url: verified ? firstText([verified.finalUrl, verified.url], url) : ""
      };
    })
    .filter(Boolean);
  const subtitleCounts = normalizedItems.reduce((counts, item) => {
    const key = String(item.subtitle || "").trim();
    if (key) counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
  return normalizedItems.map((item) => ({
    ...item,
    subtitle: item.subtitle && subtitleCounts[item.subtitle] > 1 ? "" : item.subtitle
  }));
}

function normalizeProgramDetail(program) {
  const item = program || {};
  const summary = item.summary || {};
  const episode = Array.isArray(item.episodes) ? item.episodes[0] : null;
  const contentPack = item.contentPack || {};
  const deepDive = item.deepDive || {};
  const mindMap = normalizeProgramMindMap(deepDive, contentPack);
  const curatedReading = normalizeProgramCuratedReading(
    deepDive,
    item.agentOutputs && item.agentOutputs.enrichment && item.agentOutputs.enrichment.readingVerificationReport
  );
  const quickView = normalizeQuickView(item.contentPack && item.contentPack.quickView);
  const dictionaryEntries = normalizeProgramDictionaryEntries(item.dictionaryEntries);
  const transcript = normalizeTranscript(item.transcript, dictionaryEntries);
  const guests = normalizeProgramGuests(item);
  const guestState = buildNativeProgramGuestState(guests, 0);
  const tags = normalizeTags(summary.tags);
  const title = firstText([item.title], "节目详情");
  const showLabel = String(item.programShow || "").trim() === "zhiji" ? "中年知己" : "家长先疯";
  const summaryBody = firstText([
    summary.body,
    item.description,
    item.contentPack && item.contentPack.minutes && item.contentPack.minutes.text
  ], "本期节目围绕家庭教育与成长展开讨论。");

  return {
    id: firstText([item._id, item.programCode, title], title),
    title,
    showLabel,
    description: firstText([item.description, summary.headline], summaryBody),
    coverImage: normalizeImage(item.coverImage),
    date: formatDate(firstText([item.publishedAt, item.createdAt], "")),
    duration: firstText([episode && episode.duration], "45 分钟"),
    audioUrl: normalizePublicAssetUrl(firstText([episode && episode.url], "")),
    summaryHeadline: firstText([summary.headline, title], title),
    summaryBody,
    summaryHighlightLabel: firstText([summary.highlightLabel], ""),
    summaryHighlightText: firstText([summary.highlightText], ""),
    tags,
    mindMap,
    deepDiveTitle: firstText([deepDive.sectionTitle], "内容延展"),
    curatedReading,
    hasExtension: curatedReading.length > 0,
    quickView,
    transcript,
    dictionaryEntries,
    hasMindMap: !!(mindMap && mindMap.root),
    hasQuickView: quickView.length > 0,
    hasTranscript: transcript.length > 0,
    guests,
    ...guestState,
    guestWishSent: false,
    guestWishCount: 0,
    guestWishAnimating: false,
    guestWishBubbles: [],
    bookmarked: false,
    contentModes: [
      quickView.length ? { key: "quickview", label: "速览" } : null,
      mindMap && mindMap.root ? { key: "mindmap", label: "脉络" } : null,
      transcript.length ? { key: "transcript", label: "逐字稿" } : null
    ].filter(Boolean)
  };
}

function formatBookRating(rating) {
  const number = Number(rating);
  if (!Number.isFinite(number) || number <= 0) return "";
  const normalized = number >= 100 ? number / 100 : number;
  return `${normalized.toFixed(1)} 分`;
}

function stripBookIntroLinkSection(value) {
  const source = String(value || "").trim();
  if (!source) return "";
  return source
    .replace(/\n*\s*点击链接进入\s*[:：][\s\S]*$/u, "")
    .trim();
}

function splitBookIntro(value) {
  const source = stripBookIntroLinkSection(value).replace(/\r\n/g, "\n").trim();
  if (!source) return [];
  const explicit = source
    .split(/\n\s*\n+/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (explicit.length > 1) return explicit.slice(0, 6);

  const normalized = source.replace(/\n+/g, " ").replace(/\s+/g, " ").trim();
  const sentences = normalized.split(/(?<=[。！？])/u).map((item) => item.trim()).filter(Boolean);
  if (sentences.length <= 2) return [normalized];
  const paragraphs = [];
  for (let index = 0; index < sentences.length; index += 2) {
    paragraphs.push(sentences.slice(index, index + 2).join(""));
  }
  return paragraphs.slice(0, 6);
}

function buildNativeBookCoverFrameStyle(width, height) {
  const imageWidth = Number(width);
  const imageHeight = Number(height);
  if (!Number.isFinite(imageWidth) || !Number.isFinite(imageHeight) || imageWidth <= 0 || imageHeight <= 0) return "";
  const ratio = imageHeight / imageWidth;
  const maxWidth = 430;
  const frameWidth = ratio < 1 ? maxWidth : 344;
  return `width: ${frameWidth}rpx;`;
}

function pushBookTag(tags, value, maxCount = 4) {
  const text = String(value || "").trim();
  if (text && tags.indexOf(text) < 0 && tags.length < maxCount) tags.push(text);
}

function splitTokens(value) {
  return String(value || "")
    .split(/[|｜,，、;；\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function pushBookTags(tags, value, maxCount = Number.POSITIVE_INFINITY) {
  for (const tag of splitTokens(value)) pushBookTag(tags, tag, maxCount);
}

function buildNativeBookDetailTags(item) {
  const book = item || {};
  const tags = [];
  pushBookTags(tags, book.grade);
  pushBookTags(tags, book.categoryLabel);
  pushBookTags(tags, book.topic);
  pushBookTags(tags, book.recommendedGuest);
  return tags;
}

function hasExternalBookValue(value) {
  const text = String(value == null ? "" : value).trim();
  if (!text) return false;
  return ["none", "null", "undefined", "n/a", "na", "-", "未标注", "作者未标注", "暂无", "未知", "无"].indexOf(text.toLowerCase()) < 0;
}

function formatExternalBookValue(value) {
  return hasExternalBookValue(value) ? String(value).trim() : "";
}

function formatExternalBookFiction(value) {
  const text = String(value || "").trim();
  const lower = text.toLowerCase();
  if (!text) return "";
  if (["1", "true", "fiction", "fictional", "yes", "y", "虚构"].indexOf(lower) >= 0) return "虚构";
  if (["0", "false", "nonfiction", "non-fiction", "no", "n", "非虚构"].indexOf(lower) >= 0) return "非虚构";
  return text;
}

function formatExternalBookLevel(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const match = text.match(/^花生\s*(\d+)\s*级$/);
  return match ? `Level ${match[1]}` : text;
}

function normalizeBookFactKey(value) {
  return String(value || "").trim().replace(/^#/, "").toLowerCase();
}

function canFilterBookFact(label) {
  return ["作者", "出版社", "来源", "推荐人", "年级", "主题", "难度", "是否虚构", "系列"].indexOf(label) >= 0;
}

function cleanBookFacts(facts, topTags) {
  const tagKeys = new Set((Array.isArray(topTags) ? topTags : []).map(normalizeBookFactKey).filter(Boolean));
  const valueKeys = new Set();
  return (Array.isArray(facts) ? facts : [])
    .filter((fact) => fact && hasExternalBookValue(fact.value))
    .map((fact) => ({
      ...fact,
      filterTag: canFilterBookFact(fact.label) ? String(fact.value || "").trim() : ""
    }))
    .filter((fact) => {
      const valueKey = normalizeBookFactKey(fact.value);
      if (!valueKey) return false;
      if (fact.label !== "作者" && tagKeys.has(valueKey)) return false;
      if (valueKeys.has(valueKey)) return false;
      valueKeys.add(valueKey);
      return true;
    });
}

function buildExternalBookFacts(book, topTags) {
  const item = book || {};
  return cleanBookFacts([
    { label: "作者", value: formatExternalBookValue(item.author) },
    { label: "出版社", value: formatExternalBookValue(item.publisher) },
    { label: "ISBN", value: formatExternalBookValue(item.isbn) },
    { label: "出版时间", value: formatExternalBookValue(item.pubDate) },
    { label: "页数", value: item.pages ? `${item.pages} 页` : "" },
    { label: "词汇量", value: formatExternalBookValue(item.words) },
    { label: "Lexile", value: formatExternalBookValue(item.lexile) },
    { label: "AR", value: formatExternalBookValue(item.ar) },
    { label: "难度", value: formatExternalBookLevel(item.levelRange) },
    { label: "是否虚构", value: formatExternalBookFiction(item.fiction) },
    { label: "系列", value: formatExternalBookValue(item.series) }
  ], topTags);
}

function normalizeNativeBookId(item) {
  return firstText([item && item._id, item && item.id, item && item.bookId], "");
}

function readNativeBookRecords() {
  try {
    if (!wx.getStorageSync) return [];
    const cached = wx.getStorageSync(NATIVE_BOOKS_CACHE_KEY);
    const firstPage = wx.getStorageSync(NATIVE_BOOKS_FIRST_PAGE_CACHE_KEY);
    const cachedRecords = Array.isArray(cached) ? cached : [];
    const firstPageRecords = Array.isArray(firstPage && firstPage.records) ? firstPage.records : [];
    return cachedRecords
      .concat(firstPageRecords)
      .filter((item) => item && typeof item === "object")
      .filter((item, index, list) => {
        const id = normalizeNativeBookId(item);
        return !id || list.findIndex((candidate) => normalizeNativeBookId(candidate) === id) === index;
      });
  } catch (_error) {
    return [];
  }
}

function extractNativeBookRecords(response) {
  const source = Array.isArray(response)
    ? response
    : Array.isArray(response && response.books)
      ? response.books
      : Array.isArray(response && response.data)
        ? response.data
        : Array.isArray(response && response.records)
          ? response.records
          : [];
  return source.filter((item) => item && typeof item === "object");
}

function writeNativeBookRecords(records) {
  try {
    if (wx.setStorageSync && Array.isArray(records) && records.length) {
      wx.setStorageSync(NATIVE_BOOKS_CACHE_KEY, records);
    }
  } catch (_error) {}
}

function buildNativeBookFacts(book, metadata, topTags) {
  const item = book || {};
  const meta = metadata || {};
  return cleanBookFacts([
    { label: "作者", value: firstText([meta.author, item.author], "") },
    { label: "出版社", value: firstText([meta.publisher, item.publisher], "") },
    { label: "ISBN", value: firstText([meta.isbn, item.isbn], "") },
    { label: "出版时间", value: firstText([item.publishedDate, meta.publishedDate, meta.pubDate], "") }
  ], topTags);
}

function getNativeBookRelationTokens(item) {
  const book = item || {};
  return [
    book.grade,
    book.categoryLabel,
    book.topic,
    book.sourceName,
    book.recommendedGuest
  ]
    .flatMap(splitTokens)
    .filter(Boolean);
}

function buildNativeBookRelatedBooks(book, candidates) {
  const source = book || {};
  const currentId = normalizeNativeBookId(source);
  const sourceTokens = new Set(getNativeBookRelationTokens(source));
  if (sourceTokens.size === 0) return [];
  const fallback = [];
  const matched = (Array.isArray(candidates) ? candidates : [])
    .filter((item) => item && normalizeNativeBookId(item) && normalizeNativeBookId(item) !== currentId)
    .map((item) => {
      const itemTokens = getNativeBookRelationTokens(item);
      let score = 0;
      if (itemTokens.some((token) => sourceTokens.has(token))) score += 3;
      if (item.sourceName && source.sourceName && item.sourceName === source.sourceName) score += 2;
      if (item.recommendedGuest && source.recommendedGuest && item.recommendedGuest === source.recommendedGuest) score += 1;
      fallback.push(item);
      return { item, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .map((entry) => entry.item);
  const related = matched.length ? matched : fallback;
  return related.slice(0, 10).map((item) => {
    const title = firstText([item.title], "未命名书籍");
    const author = firstText([item.author], "");
    const publisher = firstText([item.publisher], "");
    return {
      id: firstText([normalizeNativeBookId(item), title], title),
      title,
      meta: [author, publisher].filter(Boolean).join(" · "),
      coverImage: normalizeBookCoverImage(firstText([item.metadataCover, item.coverImage], "")),
      raw: item,
      isExternal: false
    };
  });
}

function buildExternalBookRelatedBooks(book, candidates) {
  const source = book || {};
  const currentId = String(source.id || "").trim();
  const tags = new Set(splitTokens(source.tags || source.category));
  const level = formatExternalBookLevel(source.levelRange);
  const fiction = formatExternalBookFiction(source.fiction);
  if (tags.size === 0 && !level && !fiction) return [];
  const fallback = [];
  const matched = (Array.isArray(candidates) ? candidates : [])
    .filter((item) => item && item.id && String(item.id) !== currentId)
    .map((item) => {
      const itemTags = splitTokens(item.tags || item.category);
      let score = 0;
      if (itemTags.some((tag) => tags.has(tag))) score += 3;
      if (level && formatExternalBookLevel(item.levelRange) === level) score += 2;
      if (fiction && formatExternalBookFiction(item.fiction) === fiction) score += 1;
      fallback.push(item);
      return { item, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .map((entry) => entry.item);
  const related = matched.length ? matched : fallback;
  return related.slice(0, 10).map((item) => {
    const title = firstText([item.title], "未命名书籍");
    const author = formatExternalBookValue(item.author);
    const publisher = formatExternalBookValue(item.publisher);
    return {
      id: firstText([item.id, title], title),
      title,
      meta: [author, publisher].filter(Boolean).join(" · "),
      coverImage: normalizeBookCoverImage(firstText([item.coverPic], "")),
      raw: item,
      isExternal: true
    };
  });
}

function extractLabelValue(input, label) {
  const pattern = new RegExp(`${label}\\s*[:：]\\s*([^|｜,，;；\\n]+)`, "i");
  const matched = String(input || "").match(pattern);
  return matched ? matched[1].trim() : "";
}

function normalizeStage(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text === "小学" || text === "初中" || text === "高中" || text === "通用") return text;
  if (/(幼儿|学前)/.test(text)) return "学前";
  return text;
}

function normalizeSubject(value) {
  const text = String(value || "").trim();
  if (!text || text === "期刊杂志") return "";
  if (/^语文/.test(text)) return "语文";
  if (text === "数学/逻辑") return "数学";
  return text;
}

function parseMaterialMeta(description) {
  const raw = String(description || "").trim();
  const stage = normalizeStage(extractLabelValue(raw, "阶段"));
  const grade = extractLabelValue(raw, "年级");
  const subject = normalizeSubject(extractLabelValue(raw, "学科"));
  if (stage || grade || subject) return { stage, grade, subject };

  const tokens = splitTokens(raw);
  return {
    stage: normalizeStage(tokens.find((token) => /(幼儿|小学|初中|高中|通用|学前)/.test(token)) || ""),
    grade: tokens.find((token) => /年级|级|低年级/.test(token)) || "",
    subject: normalizeSubject(tokens.find((token) => /(语文|数学|英语|物理|化学|生物|历史|地理|政治|综合|科学)/.test(token)) || "")
  };
}

function hostLabel(url) {
  const matched = String(url || "").match(/^https?:\/\/([^/]+)/i);
  return matched && matched[1] ? matched[1].replace(/^www\./, "") : "外部资料";
}

function pushMaterialTag(tags, tone, value) {
  const text = String(value || "").trim();
  if (text && tags.every((item) => item.text !== text)) tags.push({ tone, text });
}

function normalizeMaterialDescription(value) {
  const raw = String(value || "").trim();
  if (!raw) return "复制资料链接后，在浏览器、网盘或对应 App 中继续打开。";
  const parts = splitTokens(raw).filter((item) => !/^(阶段|年级|学科)\s*[:：]/.test(item));
  return parts.length ? parts.join("，") : raw;
}

function normalizeMaterialDetail(material) {
  const item = material || {};
  const fileUrl = firstText([item.fileUrl, item.url, item.link], "");
  const meta = parseMaterialMeta(item.description);
  const tags = [];
  const category = firstText([item.category], "学习资料");
  pushMaterialTag(tags, "stage", meta.stage);
  pushMaterialTag(tags, "grade", meta.grade);
  pushMaterialTag(tags, "subject", meta.subject);
  pushMaterialTag(tags, "category", category);

  return {
    id: firstText([item._id, item.id, item.title], "material"),
    title: firstText([item.title], "学习资料"),
    category,
    description: normalizeMaterialDescription(item.description),
    date: formatDate(firstText([item.publishedAt, item.createdAt], "")),
    fileUrl,
    sourceHost: hostLabel(fileUrl),
    tags,
    hasLink: !!fileUrl
  };
}

function normalizeTopicTagList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 8);
  }
  const source = String(value || "").trim();
  if (!source) return [];
  try {
    const parsed = JSON.parse(source);
    if (Array.isArray(parsed)) return normalizeTopicTagList(parsed);
  } catch (_error) {}
  return splitTokens(source).slice(0, 8);
}

function buildNativeTopicInlineParts(value) {
  const source = String(value || "");
  if (!source) return [];
  const parts = source.split(/(\*\*.*?\*\*)/g).filter((part) => part !== "");
  return parts.map((part, index) => {
    const isStrong = part.indexOf("**") === 0 && part.lastIndexOf("**") === part.length - 2;
    return {
      key: `inline-${index}`,
      type: isStrong ? "strong" : "text",
      text: isStrong ? part.slice(2, -2) : part
    };
  }).filter((part) => part.text);
}

function pushNativeTopicContentPart(parts, part) {
  parts.push({ key: `part-${parts.length}`, ...part });
}

function stripNativeTopicTerminalContent(content) {
  return String(content || "").replace(/\n*以上。$/, "");
}

function buildNativeTopicContentParts(content) {
  const lines = stripNativeTopicTerminalContent(content).split("\n");
  const parts = [];
  let prevBlank = false;
  let orderedIndex = 0;

  lines.forEach((rawLine) => {
    const line = String(rawLine || "");
    const trimmed = line.trim();

    if (!trimmed) {
      orderedIndex = 0;
      if (!prevBlank) pushNativeTopicContentPart(parts, { type: "spacer" });
      prevBlank = true;
      return;
    }

    if (trimmed === "---") {
      orderedIndex = 0;
      pushNativeTopicContentPart(parts, { type: "divider", text: "📖 深度扩展" });
      prevBlank = false;
      return;
    }

    if (trimmed.indexOf("## ") === 0) {
      orderedIndex = 0;
      pushNativeTopicContentPart(parts, {
        type: "heading2",
        inlineParts: buildNativeTopicInlineParts(trimmed.replace(/^##\s+/, ""))
      });
      prevBlank = false;
      return;
    }

    if (trimmed.indexOf("### ") === 0) {
      orderedIndex = 0;
      pushNativeTopicContentPart(parts, {
        type: "heading3",
        inlineParts: buildNativeTopicInlineParts(trimmed.replace(/^###\s+/, ""))
      });
      prevBlank = false;
      return;
    }

    const orderedMatch = trimmed.match(/^(\d+)[\.\、\)]\s*(.+)/);
    if (orderedMatch) {
      orderedIndex += 1;
      pushNativeTopicContentPart(parts, {
        type: "ordered",
        index: orderedIndex,
        inlineParts: buildNativeTopicInlineParts(orderedMatch[2])
      });
      prevBlank = false;
      return;
    }

    orderedIndex = 0;
    if (trimmed.length > 150 && trimmed.indexOf("**") < 0) {
      const sentences = trimmed.split(/。|；/).map((item) => item.trim()).filter(Boolean);
      if (sentences.length >= 3) {
        pushNativeTopicContentPart(parts, {
          type: "summary",
          summary: `${sentences[0]}。`,
          summaryParts: buildNativeTopicInlineParts(`${sentences[0]}。`),
          detail: `${sentences.slice(1).join("；")}。`,
          detailParts: buildNativeTopicInlineParts(`${sentences.slice(1).join("；")}。`)
        });
        prevBlank = false;
        return;
      }
    }

    pushNativeTopicContentPart(parts, {
      type: "paragraph",
      inlineParts: buildNativeTopicInlineParts(trimmed)
    });
    prevBlank = false;
  });

  return parts.filter((part, index, list) => part.type !== "spacer" || (index > 0 && index < list.length - 1));
}

function normalizeTopicTree(topic, tree) {
  const sourceTree = Array.isArray(tree) ? tree : [];
  if (sourceTree.length) {
    return sourceTree.map((branch, branchIndex) => ({
      id: firstText([branch && branch.id, branch && branch.nodeKey], `branch-${branchIndex}`),
      nodeKey: firstText([branch && branch.nodeKey], `branch-${branchIndex}`),
      title: firstText([branch && branch.title], `第 ${branchIndex + 1} 层`),
      children: Array.isArray(branch && branch.children)
        ? branch.children.map((node, nodeIndex) => ({
          id: firstText([node && node.id, node && node.nodeKey], `node-${branchIndex}-${nodeIndex}`),
          nodeKey: firstText([node && node.nodeKey], `node-${branchIndex}-${nodeIndex}`),
          title: firstText([node && node.title], "知识点"),
          summary: firstText([node && node.summary], ""),
          content: firstText([node && node.content], ""),
          expandedContent: firstText([node && node.expandedContent], ""),
          contentParts: buildNativeTopicContentParts(firstText([node && node.expandedContent, node && node.content], "")),
          questions: Array.isArray(node && node.questions) ? node.questions : []
        })).filter((node) => node.title)
        : []
    })).filter((branch) => branch.children.length);
  }

  const layerNames = {
    layer1: "认知篇",
    layer2: "诊断篇",
    layer3: "方法篇",
    layer4: "工具篇",
    layer5: "行动篇"
  };
  const layers = topic && topic.layers ? topic.layers : {};
  return Object.keys(layerNames).map((key, branchIndex) => ({
    id: key,
    nodeKey: key,
    title: layerNames[key],
    children: Array.isArray(layers[key])
      ? layers[key].map((node, nodeIndex) => ({
        id: firstText([node && node.key], `${key}-${nodeIndex}`),
        nodeKey: firstText([node && node.key], `${key}-${nodeIndex}`),
        title: firstText([node && node.title], "知识点"),
        summary: firstText([node && node.summary], ""),
        content: firstText([node && node.content], ""),
        expandedContent: firstText([node && node.expandedContent], ""),
        contentParts: buildNativeTopicContentParts(firstText([node && node.expandedContent, node && node.content], "")),
        questions: Array.isArray(node && node.questions) ? node.questions : []
      })).filter((node) => node.title)
      : []
  })).filter((branch) => branch.children.length);
}

function flattenTopicNodes(tree) {
  return (Array.isArray(tree) ? tree : []).flatMap((branch) =>
    (Array.isArray(branch.children) ? branch.children : []).map((node) => ({
      ...node,
      branchId: branch.id,
      branchTitle: branch.title
    }))
  );
}

function getNextTopicNode(nodes, activeKey) {
  const list = Array.isArray(nodes) ? nodes : [];
  const index = list.findIndex((node) => node.nodeKey === activeKey);
  return index >= 0 && index + 1 < list.length ? list[index + 1] : null;
}

const NATIVE_TOPIC_PULL_THRESHOLD = 72;

function normalizeRelatedTopics(value) {
  return Array.isArray(value)
    ? value.map((item) => ({
      title: firstText([item && item.title], "相关话题"),
      slug: firstText([item && item.slug, item && item._id, item && item.id], ""),
      tags: normalizeTopicTagList(item && item.tags).slice(0, 3)
    })).filter((item) => item.slug || item.title).slice(0, 3)
    : [];
}

function normalizeTopicDetail(payload) {
  const data = payload || {};
  const topic = data.topic || data.data || data;
  const tree = normalizeTopicTree(topic, data.tree || topic.tree);
  const tags = normalizeTopicTagList(topic.tags);
  const summary = firstText([
    topic.shortSummary,
    topic.description,
    topic.overview,
    topic.summary,
    topic.subtitle
  ], "");
  const nodeCount = tree.reduce((sum, branch) => sum + branch.children.length, 0);

  return {
    id: firstText([topic._id, topic.id, topic.slug], "topic"),
    slug: firstText([topic.slug, topic._id, topic.id], ""),
    title: firstText([topic.title], ""),
    subtitle: firstText([topic.subtitle], ""),
    coverEmoji: firstText([topic.coverEmoji], ""),
    summary,
    tags,
    tree,
    relatedTopics: normalizeRelatedTopics(data.relatedTopics),
    branchCount: tree.length,
    nodeCount
  };
}

function normalizeTopicNodeDetail(response, baseNode, nodeKey) {
  const rawNode = response && (response.node || response.data || response);
  const responseQuestions = Array.isArray(response && response.questions)
    ? response.questions
    : (Array.isArray(response && response.data && response.data.questions) ? response.data.questions : null);
  const responseSiblings = Array.isArray(response && response.siblings)
    ? response.siblings
    : (Array.isArray(response && response.data && response.data.siblings) ? response.data.siblings : []);
  const base = baseNode || {};
  const key = String(nodeKey || "").trim();
  return {
    ...base,
    ...(rawNode || {}),
    id: firstText([rawNode && rawNode.id, base.id, key], key),
    nodeKey: firstText([rawNode && rawNode.nodeKey, base.nodeKey, key], key),
    title: firstText([rawNode && rawNode.title, base.title], "知识点"),
    summary: firstText([rawNode && rawNode.summary, base.summary], ""),
    content: firstText([rawNode && rawNode.content, base.content], ""),
    expandedContent: firstText([rawNode && rawNode.expandedContent, base.expandedContent], ""),
    contentParts: buildNativeTopicContentParts(firstText([
      rawNode && rawNode.expandedContent,
      rawNode && rawNode.content,
      base.expandedContent,
      base.content
    ], "")),
    questions: responseQuestions || (Array.isArray(rawNode && rawNode.questions) ? rawNode.questions : (base.questions || [])),
    siblings: responseSiblings,
    keyPoints: Array.isArray(rawNode && rawNode.keyPoints) ? rawNode.keyPoints : [],
    references: Array.isArray(rawNode && rawNode.references) ? rawNode.references : []
  };
}

function normalizeExpertLinks(value) {
  return Array.isArray(value)
    ? value.map((item) => ({
      title: firstText([item && item.title, item && item.label, item && item.name, item && item.platform], "资料链接"),
      label: firstText([item && item.label, item && item.platform, item && item.source, item && item.type], ""),
      source: firstText([item && item.source, item && item.platform, item && item.type], ""),
      description: firstText([item && item.description, item && item.note, item && item.summary], ""),
      url: firstText([item && item.url, item && item.href, item && item.link], "")
    })).filter((item) => item.title || item.description || item.url).slice(0, 4)
    : [];
}

function normalizeExpertPrograms(value) {
  return Array.isArray(value)
    ? value.map((item) => {
      const id = firstText([item && item.programCode, item && item._id, item && item.id], "");
      return {
        id,
        title: firstText([item && item.title], "相关节目"),
        description: firstText([item && item.description, item && item.summary && item.summary.body], "围绕家庭教育和成长议题继续展开。"),
        coverImage: normalizeImage(item && item.coverImage),
        date: formatDate(firstText([item && item.publishedAt, item && item.createdAt], "")),
        path: id ? `/programs/${encodeURIComponent(id)}` : ""
      };
    }).filter((item) => item.id || item.title)
    : [];
}

function normalizeExpertDetail(guest) {
  const item = guest || {};
  const name = firstText([item.name, item.title], "先疯智库");
  const publications = normalizeExpertLinks(item.publications);
  const profileReferences = normalizeExpertLinks(item.profileReferences);
  const socialProfiles = normalizeExpertLinks(item.socialProfiles);
  const listenerBenefits = normalizeExpertLinks(item.listenerBenefits);
  const relatedPrograms = normalizeExpertPrograms(item.relatedPrograms);
  const contentTags = normalizeTopicTagList(item.contentTags || item.tags).slice(0, 6);
  const referenceCount = Number(item.referenceCount || 0) || publications.length + profileReferences.length;
  const programCount = Number(item.programCount || 0) || relatedPrograms.length;
  const publicItems = [...publications, ...profileReferences].slice(0, 6);

  return {
    id: firstText([item._id, item.id, name], name),
    name,
    title: firstText([item.title], "教育观察者"),
    bio: firstText([item.bio, item.description], "持续关注家庭教育、儿童成长和学习关系中的真实问题。"),
    avatar: normalizeImage(item.avatar) || `${DEFAULT_WEB_ORIGIN}/assets/wel-avatar/no-hat.png`,
    profileUrl: firstText([item.profileUrl], ""),
    wishSent: false,
    wishCount: 0,
    wishAnimating: false,
    wishBubbles: [],
    contentTags,
    programCount,
    referenceCount,
    socialCount: socialProfiles.length,
    agentEnabled: item.agentEnabled === true,
    agentLabel: item.agentEnabled === true ? "可提问" : "已收录",
    relatedPrograms,
    publications,
    profileReferences,
    socialProfiles,
    listenerBenefits,
    publicItems,
    hasRelatedPrograms: relatedPrograms.length > 0,
    hasPublications: publications.length > 0,
    hasReferences: profileReferences.length > 0,
    hasSocialProfiles: socialProfiles.length > 0,
    hasListenerBenefits: listenerBenefits.length > 0
  };
}

const NATIVE_EXPERT_SOURCE_LABELS = {
  guest_profile: "嘉宾档案",
  program_summary: "节目摘要",
  program_transcript: "逐字稿",
  program_quickview: "节目速览",
  program_shownotes: "节目笔记",
  program_deepdive: "深度资料",
  public_material: "公开资料"
};

function normalizeNativeExpertAnswer(value) {
  return String(value || "")
    .replace(/\*\*/g, "")
    .replace(/^#{1,3}\s*/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeNativeExpertCitation(value, index) {
  const item = value || {};
  const sourceType = firstText([item.sourceType], "public_material");
  const sourceId = firstText([item.sourceId], "");
  return {
    id: firstText([item.chunkId, item.id, `${sourceType}-${sourceId}-${index}`], `citation-${index}`),
    sourceType,
    sourceLabel: NATIVE_EXPERT_SOURCE_LABELS[sourceType] || "引用资料",
    sourceId,
    sourceTitle: firstText([item.sourceTitle, item.title], "未命名来源"),
    locator: firstText([item.locator], ""),
    text: normalizeNativeExpertAnswer(item.text),
    url: firstText([item.url], ""),
    isProgram: sourceType.indexOf("program") === 0 && !!sourceId
  };
}

function normalizeNativeExpertMessages(value) {
  return (Array.isArray(value) ? value : [])
    .map((message, messageIndex) => {
      const citations = (Array.isArray(message && message.citations) ? message.citations : [])
        .map(normalizeNativeExpertCitation);
      const seenPrograms = new Set();
      const recommendations = citations
        .filter((citation) => citation.isProgram)
        .filter((citation) => {
          const key = `${citation.sourceId}::${citation.sourceTitle}`;
          if (seenPrograms.has(key)) return false;
          seenPrograms.add(key);
          return true;
        })
        .map((citation, index) => ({
          id: citation.sourceId || `program-${index}`,
          title: citation.sourceTitle,
          order: index + 1
        }))
        .slice(0, 3);
      return {
        id: firstText([message && message.id], `message-${messageIndex}`),
        role: message && message.role === "user" ? "user" : "assistant",
        content: normalizeNativeExpertAnswer(message && message.content),
        citations,
        citationCount: citations.length,
        citationSummary: Array.from(new Set(citations.map((citation) => citation.sourceLabel))).join(" / "),
        citationsExpanded: !!(message && message.citationsExpanded),
        recommendations
      };
    })
    .filter((message) => message.content);
}

function normalizeNativeExpertAgentProfile(value, expert) {
  const source = value && value.agent ? value.agent : value || {};
  const fallback = expert || {};
  const suggestedQuestions = Array.isArray(source.suggestedQuestions)
    ? source.suggestedQuestions.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 3)
    : [];
  return {
    guestId: firstText([source.guestId, fallback.id], ""),
    name: firstText([source.name, fallback.name], "嘉宾"),
    title: firstText([source.title, fallback.title], "节目嘉宾 AI 分身"),
    avatar: normalizeImage(source.avatar) || fallback.avatar || `${DEFAULT_WEB_ORIGIN}/assets/wel-avatar/no-hat.png`,
    bio: firstText([source.bio, fallback.bio], ""),
    chunkCount: Math.max(0, Number(source.chunkCount) || 0),
    programCount: Math.max(0, Number(source.programCount) || fallback.programCount || 0),
    suggestedQuestions,
    privacyNote: firstText([source.privacyNote], "对话内容仅用于当前账号的嘉宾智能体会话展示。")
  };
}

function clampWorthBuyScore(value) {
  const number = Math.round(Number(value) || 0);
  if (number < 0) return 0;
  if (number > 100) return 100;
  return number;
}

function worthBuyScoreLabel(score) {
  if (score >= 85) return "强烈推荐";
  if (score >= 70) return "值得考虑";
  if (score >= 55) return "谨慎购买";
  if (score >= 40) return "不太推荐";
  return "建议避坑";
}

function normalizeWorthBuyList(value) {
  return Array.isArray(value)
    ? value.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 5)
    : [];
}

function normalizeWorthBuyDimensions(value) {
  const source = value || {};
  const definitions = [
    ["cost", "性价比"],
    ["quality", "质量"],
    ["safety", "安全性"],
    ["experience", "使用体验"],
    ["afterSales", "售后"]
  ];
  return definitions
    .map(([key, label]) => ({
      key,
      label,
      score: clampWorthBuyScore(source[key])
    }))
    .filter((item) => item.score > 0);
}

function normalizeWorthBuyDetail(item) {
  const source = item || {};
  const result = source.result || source;
  const title = firstText([result.brand, source.brand, source.query, result.title], "知物分析");
  const score = clampWorthBuyScore(result.score);
  const pros = normalizeWorthBuyList(result.pros);
  const cons = normalizeWorthBuyList(result.cons);
  const dataPoints = normalizeWorthBuyList(result.dataPoints);
  const suitableFor = normalizeWorthBuyList(result.suitableFor);
  const notSuitableFor = normalizeWorthBuyList(result.notSuitableFor);
  const dimensions = normalizeWorthBuyDimensions(result.ratingDimensions);

  return {
    id: firstText([source._id, source.id, source.query, title], title),
    title,
    brand: firstText([result.brand, source.brand], title),
    query: firstText([source.query, result.query], title),
    score,
    scoreLabel: worthBuyScoreLabel(score),
    scorePercent: `${score}%`,
    verdict: result.isIqTax ? "智商税风险" : "非智商税",
    isIqTax: !!result.isIqTax,
    priceRange: firstText([result.priceRange], ""),
    reason: firstText([result.reason, result.summary, result.recommendation], "暂无完整分析结论。"),
    recommendation: firstText([result.recommendation], ""),
    buyAdvice: firstText([result.buyAdvice], ""),
    pros,
    cons,
    dataPoints,
    suitableFor,
    notSuitableFor,
    dimensions,
    hasProsCons: pros.length > 0 || cons.length > 0,
    hasDataPoints: dataPoints.length > 0,
    hasAudience: suitableFor.length > 0 || notSuitableFor.length > 0,
    hasDimensions: dimensions.length > 0,
    hasAdvice: !!(result.recommendation || result.buyAdvice)
  };
}

function normalizeBookDetail(book, metadata) {
  const item = book || {};
  const meta = metadata || {};
  const title = firstText([item.title, meta.title], "图书详情");
  const author = formatExternalBookValue(firstText([meta.author, item.author], ""));
  const publisher = formatExternalBookValue(firstText([meta.publisher, item.publisher], ""));
  const coverImage = normalizeBookCoverImage(firstText([meta.cover, item.metadataCover, item.coverImage], ""));
  const intro = firstText([
    meta.description,
    item.description,
    item.contentIntro
  ].map(stripBookIntroLinkSection), "");
  const sourceName = firstText([item.sourceName], "");
  const recommendedGuest = firstText([item.recommendedGuest], "");
  const sourceLine = sourceName ? `来自《${sourceName}》` : recommendedGuest ? `${recommendedGuest}推荐` : "";
  const tags = buildNativeBookDetailTags(item);
  const facts = buildNativeBookFacts(item, meta, tags);
  const relatedBooks = buildNativeBookRelatedBooks(item, readNativeBookRecords());

  return {
    id: firstText([item._id, meta.bookId, title], title),
    title,
    author,
    publisher,
    isbn: formatExternalBookValue(firstText([meta.isbn, item.isbn], "")),
    coverImage,
    hasCover: !!coverImage,
    publishedDate: formatExternalBookValue(firstText([item.publishedDate], "")),
    ratingText: "",
    ratingCount: "",
    hasRating: false,
    sourceLine,
    sourceName,
    recommendedGuest,
    grade: firstText([item.grade], ""),
    topic: firstText([item.topic], ""),
    description: intro,
    translatedDescription: "",
    introParagraphs: splitBookIntro(intro),
    hasIntro: !!intro,
    tags,
    hasMoreContent: tags.length > 0,
    facts,
    hasFacts: facts.length > 0,
    relatedBooks,
    hasRelatedBooks: relatedBooks.length > 0,
    isExternal: false
  };
}

function normalizeExternalBookDetail(book) {
  const item = book || {};
  const title = firstText([item.title], "图书详情");
  const author = formatExternalBookValue(item.author);
  const description = stripBookIntroLinkSection(firstText([item.description], ""));
  const tags = [];
  splitTokens(item.tags || item.category).forEach((tag) => pushBookTag(tags, tag, Number.POSITIVE_INFINITY));
  pushBookTag(tags, formatExternalBookLevel(item.levelRange));
  pushBookTag(tags, formatExternalBookFiction(item.fiction));
  const facts = buildExternalBookFacts(item, tags);
  const relatedBooks = buildExternalBookRelatedBooks(item, readExternalBookLibraryRecords());

  return {
    id: firstText([item.id, title], title),
    title,
    author,
    publisher: formatExternalBookValue(item.publisher),
    isbn: formatExternalBookValue(item.isbn),
    coverImage: normalizeBookCoverImage(firstText([item.coverPic], "")),
    hasCover: true,
    publishedDate: formatExternalBookValue(item.pubDate),
    ratingText: "",
    ratingCount: "",
    hasRating: false,
    sourceLine: "及阅书库",
    sourceName: "及阅书库",
    recommendedGuest: "",
    grade: "",
    topic: firstText([item.category, item.tags], ""),
    description,
    translatedDescription: "",
    introParagraphs: splitBookIntro(description),
    hasIntro: !!description,
    tags,
    hasMoreContent: tags.length > 0,
    facts,
    hasFacts: facts.length > 0,
    relatedBooks,
    hasRelatedBooks: relatedBooks.length > 0,
    isExternal: true
  };
}

Page({
  data: {
    title: "家长先疯",
    eyebrowAmp: "&",
    src: "",
    selected: 0,
    topbarHeight: 88,
    chromeHeight: 88,
    logoTop: 10,
    logoHeight: 28,
    closeTop: 4,
    closeSize: 44,
    nativeProgramMode: false,
    nativeProgramLoading: false,
    nativeProgramError: "",
    nativeProgram: null,
    selectedProgramDictionaryEntry: null,
    nativeProgramMindMapCollapsedBranches: [],
    nativeProgramMindMapOutline: { root: { title: "", summary: "" }, branches: [] },
    nativeBookMode: false,
    nativeBookLoading: false,
    nativeBookError: "",
    nativeBook: null,
    nativeBookIntroTranslated: false,
    nativeBookTranslationLoading: false,
    nativeBookTranslationError: "",
    nativeBookCoverFrameStyle: "",
    nativeMaterialMode: false,
    nativeMaterialLoading: false,
    nativeMaterialError: "",
    nativeMaterial: null,
    nativeTopicMode: false,
    nativeTopicGeneration: 0,
    nativeTopicLoading: false,
    nativeTopicError: "",
    nativeTopic: null,
    nativeTopicMobileView: "tree",
    nativeTopicCollapsedBranches: [],
    nativeTopicNodes: [],
    activeTopicNodeKey: "",
    activeTopicNode: null,
    nativeTopicNodeLoading: false,
    nativeTopicNodeError: "",
    nativeTopicNodeCache: {},
    nativeTopicUserId: "",
    nativeTopicSlug: "",
    nextNativeTopicNode: null,
    nativeTopicAtBottom: false,
    nativeTopicPullStartY: null,
    nativeTopicPullDistance: 0,
    nativeTopicPullState: "idle",
    nativeTopicScrollTop: 0,
    nativeTopicScrollTarget: "",
    nativeTopicExpandLoading: false,
    nativeTopicExpandActionId: 0,
    nativeTopicQuestionText: "",
    nativeTopicQuestionLoading: false,
    nativeTopicQuestionActionId: 0,
    nativeTopicActionError: "",
    nativeExpertMode: false,
    nativeExpertLoading: false,
    nativeExpertError: "",
    nativeExpert: null,
    nativeExpertProfileTab: "programs",
    nativeExpertCompactHeaderVisible: false,
    nativeExpertAgentLoading: false,
    nativeExpertAgentError: "",
    nativeExpertAgentNeedsPro: false,
    nativeExpertAgent: null,
    nativeExpertAuthed: false,
    nativeExpertMessages: [],
    nativeExpertQuestion: "",
    nativeExpertInputFocused: false,
    nativeExpertAttachmentMenuOpen: false,
    nativeExpertSending: false,
    nativeWorthBuyMode: false,
    nativeWorthBuyLoading: false,
    nativeWorthBuyError: "",
    nativeWorthBuy: null,
    activeContentMode: "quickview",
    isAudioPlaying: false,
    audioPlaybackRate: 1,
    audioSpeedLabel: "1.0x",
    playerQuickActionsOpen: false,
    showNativePageNav: false,
    hideTabbar: true,
    showXiaowanziClose: false,
    fontSize: "standard",
    fontSizeClass: "xf-font-standard",
    settingsSections: SETTINGS_SECTIONS,
    settingsPanelOpen: false,
    accountTitle: "登录/注册",
    accountSubtitle: "登录后同步档案和个性化推荐",
    accountPage: "",
    webviewLoginRequired: false,
    bindingPhone: false,
    profilePanelMessage: ""
  },

  onLoad(options) {
    enableShareMenu();
    this.syncTopbarMetrics();
    this.syncNativeFontSizeSetting();
    const rawSrc = decodeURIComponent(options.url || "");
    const title = resolveWebviewTitle(rawSrc, decodeURIComponent(options.title || ""));
    const src = withNativeWebviewParams(rawSrc);
    if (isProWebPath(src)) {
      const openNativePro = wx.redirectTo || wx.navigateTo;
      if (openNativePro) {
        openNativePro({ url: buildNativeProUrl(getUrlSearch(src)) });
        return;
      }
    }
    const webviewLoginRequired = options.login === "1" && !getToken();
    const hideTabbar = shouldHideNativeTabbar(src);
    const showXiaowanziClose = isXiaowanziSuperWebview(src);
    const displayTitle = showXiaowanziClose ? "" : title;
    if (wx.setNavigationBarTitle) wx.setNavigationBarTitle({ title: displayTitle });
    const materialId = extractMaterialId(src);
    const programId = extractProgramId(src);
    const expertId = extractExpertId(src);
    const worthBuyQuery = extractWorthBuyQuery(src);
    if (worthBuyQuery) {
      wx.navigateTo({ url: `/pages/worthbuy-detail/index?query=${encodeURIComponent(worthBuyQuery)}` });
      return;
    }
    const bookId = extractBookId(src);
    const externalBookId = extractExternalBookId(src);
    const externalBookFallback = externalBookId ? getExternalBookFallback(src, externalBookId) : null;
    const topicSlug = normalizeNativeTopicSlugParam(options.topicSlug);
    const nativeTopicMode = options.nativeTopic === "1" && !!topicSlug;
    if (nativeTopicMode) {
      this.setData({
        title,
        src: "",
        selected: 4,
        nativeProgramMode: false,
        nativeBookMode: false,
        nativeMaterialMode: false,
        nativeTopicMode: true,
        nativeTopicLoading: true,
        nativeTopicError: "",
        nativeTopic: null,
        nativeTopicMobileView: "tree",
        nativeTopicCollapsedBranches: [],
        nativeTopicNodes: [],
        activeTopicNodeKey: "",
        activeTopicNode: null,
        nativeTopicNodeLoading: false,
        nativeTopicNodeError: "",
        nativeTopicNodeCache: {},
        nativeTopicUserId: String(options.userId || "").trim(),
        nativeTopicSlug: topicSlug,
        nativeExpertMode: false,
        nativeWorthBuyMode: false,
        isAudioPlaying: false,
        hideTabbar: false
      });
      this.hydrateNativeTopicFromCache(topicSlug);
      return this.loadNativeTopic(topicSlug);
    }
    if (programId) {
      this.setData({
        title,
        src: "",
        selected: 0,
        nativeProgramMode: true,
        nativeProgramLoading: true,
        nativeProgramError: "",
        nativeProgram: null,
        selectedProgramDictionaryEntry: null,
        nativeProgramMindMapCollapsedBranches: [],
        nativeProgramMindMapOutline: { root: { title: "", summary: "" }, branches: [] },
        activeContentMode: "mindmap",
        nativeBookMode: false,
        nativeBookLoading: false,
        nativeBookError: "",
        nativeBook: null,
        nativeBookIntroTranslated: false,
        nativeBookTranslationLoading: false,
        nativeBookTranslationError: "",
        nativeBookCoverFrameStyle: "",
        nativeMaterialMode: false,
        nativeMaterialLoading: false,
        nativeMaterialError: "",
        nativeMaterial: null,
        nativeTopicMode: false,
        nativeTopicLoading: false,
        nativeTopicError: "",
        nativeTopic: null,
        nativeTopicMobileView: "tree",
        nativeTopicCollapsedBranches: [],
        nativeExpertMode: false,
        nativeExpertLoading: false,
        nativeExpertError: "",
        nativeExpert: null,
        nativeWorthBuyMode: false,
        nativeWorthBuyLoading: false,
        nativeWorthBuyError: "",
        nativeWorthBuy: null,
        isAudioPlaying: false,
        playerQuickActionsOpen: false,
        hideTabbar: true,
        showNativePageNav: false
      });
      return this.loadNativeProgram(programId);
    }
    if (bookId) {
      const bookFallback = readBookDetailCache(bookId);
      const nativeBook = bookFallback ? normalizeBookDetail(bookFallback, bookFallback.metadataDetail || bookFallback.metadata || null) : null;
      this.setData({
        title: nativeBook ? nativeBook.title : title,
        src: "",
        selected: 1,
        nativeProgramMode: false,
        nativeProgramLoading: false,
        nativeProgramError: "",
        nativeProgram: null,
        nativeBookMode: true,
        nativeBookLoading: !nativeBook,
        nativeBookError: "",
        nativeBook,
        nativeBookIntroTranslated: false,
        nativeBookTranslationLoading: false,
        nativeBookTranslationError: "",
        nativeBookCoverFrameStyle: "",
        nativeMaterialMode: false,
        nativeMaterialLoading: false,
        nativeMaterialError: "",
        nativeMaterial: null,
        nativeTopicMode: false,
        nativeTopicLoading: false,
        nativeTopicError: "",
        nativeTopic: null,
        nativeExpertMode: false,
        nativeExpertLoading: false,
        nativeExpertError: "",
        nativeExpert: null,
        nativeWorthBuyMode: false,
        nativeWorthBuyLoading: false,
        nativeWorthBuyError: "",
        nativeWorthBuy: null,
        isAudioPlaying: false,
        hideTabbar: false
      });
      return this.loadNativeBook(bookId, !!nativeBook);
    }
    if (externalBookId) {
      const nativeBook = externalBookFallback ? normalizeExternalBookDetail(externalBookFallback) : null;
      this.setData({
        title: nativeBook ? nativeBook.title : title,
        src: "",
        selected: 1,
        nativeProgramMode: false,
        nativeProgramLoading: false,
        nativeProgramError: "",
        nativeProgram: null,
        nativeBookMode: true,
        nativeBookLoading: !nativeBook,
        nativeBookError: "",
        nativeBook,
        nativeBookIntroTranslated: false,
        nativeBookTranslationLoading: false,
        nativeBookTranslationError: "",
        nativeBookCoverFrameStyle: "",
        nativeMaterialMode: false,
        nativeMaterialLoading: false,
        nativeMaterialError: "",
        nativeMaterial: null,
        nativeTopicMode: false,
        nativeTopicLoading: false,
        nativeTopicError: "",
        nativeTopic: null,
        nativeExpertMode: false,
        nativeExpertLoading: false,
        nativeExpertError: "",
        nativeExpert: null,
        nativeWorthBuyMode: false,
        nativeWorthBuyLoading: false,
        nativeWorthBuyError: "",
        nativeWorthBuy: null,
        isAudioPlaying: false,
        hideTabbar: false
      });
      return this.loadNativeExternalBook(externalBookId, externalBookFallback, !!nativeBook);
    }
    if (materialId) {
      this.setData({
        title,
        src: "",
        selected: 3,
        nativeProgramMode: false,
        nativeProgramLoading: false,
        nativeProgramError: "",
        nativeProgram: null,
        nativeBookMode: false,
        nativeBookLoading: false,
        nativeBookError: "",
        nativeBook: null,
        nativeBookIntroTranslated: false,
        nativeBookTranslationLoading: false,
        nativeBookTranslationError: "",
        nativeMaterialMode: true,
        nativeMaterialLoading: true,
        nativeMaterialError: "",
        nativeMaterial: null,
        nativeTopicMode: false,
        nativeTopicLoading: false,
        nativeTopicError: "",
        nativeTopic: null,
        nativeExpertMode: false,
        nativeExpertLoading: false,
        nativeExpertError: "",
        nativeExpert: null,
        nativeWorthBuyMode: false,
        nativeWorthBuyLoading: false,
        nativeWorthBuyError: "",
        nativeWorthBuy: null,
        isAudioPlaying: false,
        hideTabbar: false
      });
      return this.loadNativeMaterial(materialId);
    }
    if (expertId) {
      this.setData({
        title,
        src: "",
        selected: 0,
        nativeProgramMode: false,
        nativeProgramLoading: false,
        nativeProgramError: "",
        nativeProgram: null,
        nativeBookMode: false,
        nativeBookLoading: false,
        nativeBookError: "",
        nativeBook: null,
        nativeBookIntroTranslated: false,
        nativeBookTranslationLoading: false,
        nativeBookTranslationError: "",
        nativeMaterialMode: false,
        nativeMaterialLoading: false,
        nativeMaterialError: "",
        nativeMaterial: null,
        nativeTopicMode: false,
        nativeTopicLoading: false,
        nativeTopicError: "",
        nativeTopic: null,
        nativeExpertMode: true,
        nativeExpertLoading: true,
        nativeExpertError: "",
        nativeExpert: null,
        nativeExpertProfileTab: "programs",
        nativeExpertCompactHeaderVisible: false,
        nativeExpertAgentLoading: true,
        nativeExpertAgentError: "",
        nativeExpertAgentNeedsPro: false,
        nativeExpertAgent: null,
        nativeExpertAuthed: !!getToken(),
        nativeExpertMessages: [],
        nativeExpertQuestion: "",
        nativeExpertInputFocused: false,
        nativeExpertAttachmentMenuOpen: false,
        nativeExpertSending: false,
        nativeWorthBuyMode: false,
        nativeWorthBuyLoading: false,
        nativeWorthBuyError: "",
        nativeWorthBuy: null,
        isAudioPlaying: false,
        hideTabbar: true
      });
      return this.loadNativeExpert(expertId);
    }
    if (worthBuyQuery) {
      this.setData({
        title,
        src: "",
        selected: 0,
        nativeProgramMode: false,
        nativeProgramLoading: false,
        nativeProgramError: "",
        nativeProgram: null,
        nativeBookMode: false,
        nativeBookLoading: false,
        nativeBookError: "",
        nativeBook: null,
        nativeBookIntroTranslated: false,
        nativeBookTranslationLoading: false,
        nativeBookTranslationError: "",
        nativeMaterialMode: false,
        nativeMaterialLoading: false,
        nativeMaterialError: "",
        nativeMaterial: null,
        nativeTopicMode: false,
        nativeTopicLoading: false,
        nativeTopicError: "",
        nativeTopic: null,
        nativeExpertMode: false,
        nativeExpertLoading: false,
        nativeExpertError: "",
        nativeExpert: null,
        nativeWorthBuyMode: true,
        nativeWorthBuyLoading: true,
        nativeWorthBuyError: "",
        nativeWorthBuy: null,
        isAudioPlaying: false,
        hideTabbar: false
      });
      return this.loadNativeWorthBuy(worthBuyQuery);
    }
    this.setData({
      title: displayTitle,
      src,
      selected: inferSelectedTab(src),
      hideTabbar,
      showXiaowanziClose,
      webviewLoginRequired,
      bindingPhone: false,
      profilePanelMessage: "",
      showNativePageNav: false,
      nativeProgramMode: false,
      nativeProgramLoading: false,
      nativeProgramError: "",
      nativeProgram: null,
      nativeBookMode: false,
      nativeBookLoading: false,
      nativeBookError: "",
      nativeBook: null,
      nativeBookIntroTranslated: false,
      nativeBookTranslationLoading: false,
      nativeBookTranslationError: "",
      nativeMaterialMode: false,
      nativeMaterialLoading: false,
      nativeMaterialError: "",
      nativeMaterial: null,
      nativeTopicMode: false,
      nativeTopicLoading: false,
      nativeTopicError: "",
      nativeTopic: null,
      nativeExpertMode: false,
      nativeExpertLoading: false,
      nativeExpertError: "",
      nativeExpert: null,
      nativeWorthBuyMode: false,
      nativeWorthBuyLoading: false,
      nativeWorthBuyError: "",
      nativeWorthBuy: null,
      isAudioPlaying: false
    });
  },

  onShow() {
    enableShareMenu();
    this.syncTopbarMetrics();
    this.syncNativeFontSizeSetting();
  },

  ...createNativeSettingsMethods(),

  showLoginGate() {
    this.setData({ webviewLoginRequired: true, profilePanelMessage: "" });
  },

  handleWebviewLoginSuccess() {
    const currentSrc = String(this.data.src || "").trim();
    const nextSrc = currentSrc
      ? buildWebUrl(currentSrc, { preserveXiaowanziLayer: isXiaowanziLayerWebview(currentSrc) ? "1" : "" })
      : "";
    this.setData({
      src: nextSrc || currentSrc,
      webviewLoginRequired: false,
      profilePanelMessage: "",
      nativeExpertAuthed: true
    });
    const expert = this.data.nativeExpert || {};
    if (this.data.nativeExpertMode && expert.id) this.loadNativeExpertAgentSession(expert);
  },

  syncTopbarMetrics() {
    try {
      const metrics = getNativeTopbarMetrics();
      const topbarHeight = Math.max(72, Math.round(metrics.topbarHeight || 88));
      const windowWidth = Math.max(320, Number(metrics.windowWidth || 375));
      const logoHeight = Math.round((LOGO_HEIGHT_RPX * windowWidth) / 750);
      const capsuleHeight = Math.max(28, Math.round(metrics.capsuleHeight || 32));
      const searchButtonTop = Math.max(8, Math.round(metrics.searchButtonTop || 8));
      const closeSize = Math.max(40, Math.round(capsuleHeight + 12));
      this.setData({
        topbarHeight,
        chromeHeight: topbarHeight,
        logoHeight,
        logoTop: Math.max(0, Math.round(searchButtonTop + capsuleHeight / 2 - logoHeight / 2)),
        closeSize,
        closeTop: Math.max(0, Math.round(searchButtonTop + capsuleHeight / 2 - closeSize / 2))
      });
    } catch (_error) {}
  },

  goBack() {
    const pages = typeof getCurrentPages === "function" ? getCurrentPages() : [];
    if (pages.length > 1) {
      wx.navigateBack({ delta: 1 });
      return;
    }
    wx.switchTab({ url: "/pages/programs/index" });
  },

  loadNativeMaterial(materialId) {
    const encodedId = encodeURIComponent(materialId);
    return request({ url: `/api/learning-materials/${encodedId}` })
      .then((response) => {
        const nativeMaterial = normalizeMaterialDetail(response && (response.material || response.data || response));
        this.setData({
          title: nativeMaterial.title,
          nativeMaterial,
          nativeMaterialLoading: false,
          nativeMaterialError: ""
        });
      })
      .catch((error) => {
        this.setData({
          nativeMaterialLoading: false,
          nativeMaterialError: (error && error.message) || "资料加载失败，请稍后重试"
        });
      });
  },

  normalizeTopicDetailForTest(payload) {
    return normalizeTopicDetail(payload);
  },

  hydrateNativeTopicFromCache(topicSlug) {
    const slug = normalizeNativeTopicSlugParam(topicSlug);
    const userId = String(this.data.nativeTopicUserId || "").trim();
    const cached = readNativeTopicDetailCache(slug, userId);
    if (!cached || !cached.detailResponse) return false;
    const nativeTopic = normalizeTopicDetail(cached.detailResponse);
    if (nativeTopic.slug && nativeTopic.slug !== slug) return false;
    const nativeTopicNodes = flattenTopicNodes(nativeTopic.tree);
    if (!nativeTopicNodes.length) return false;
    const firstNodeKey = String(cached.firstNodeKey || nativeTopicNodes[0].nodeKey || "").trim();
    const baseNode = nativeTopicNodes.find((node) => node.nodeKey === firstNodeKey) || nativeTopicNodes[0];
    const activeTopicNode = cached.firstNodeResponse
      ? normalizeTopicNodeDetail(cached.firstNodeResponse, baseNode, baseNode.nodeKey)
      : baseNode;
    this.setData({
      title: nativeTopic.title,
      nativeTopic,
      nativeTopicNodes,
      nativeTopicLoading: false,
      nativeTopicError: "",
      activeTopicNodeKey: baseNode.nodeKey,
      activeTopicNode,
      nextNativeTopicNode: getNextTopicNode(nativeTopicNodes, baseNode.nodeKey),
      nativeTopicNodeLoading: false,
      nativeTopicNodeError: "",
      nativeTopicNodeCache: { ...(this.data.nativeTopicNodeCache || {}), [baseNode.nodeKey]: activeTopicNode }
    });
    return true;
  },

  loadNativeTopic(topicSlug, options = {}) {
    const slug = normalizeNativeTopicSlugParam(topicSlug);
    const generation = Number(options.generation) || Number(this.data.nativeTopicGeneration || 0) + 1;
    if (!options.generation) this.setData({ nativeTopicGeneration: generation });
    const userId = String(this.data.nativeTopicUserId || "").trim();
    const query = userId ? `?userId=${encodeURIComponent(userId)}` : "";
    return request({ url: `/api/topic-hub/${encodeURIComponent(slug)}${query}` })
      .then((response) => {
        if (this.data.nativeTopicGeneration !== generation) return null;
        const nativeTopic = normalizeTopicDetail(response);
        if (nativeTopic.slug && nativeTopic.slug !== slug) return null;
        const nativeTopicNodes = flattenTopicNodes(nativeTopic.tree);
        if (!nativeTopicNodes.length) {
          this.setData({
            nativeTopicLoading: false,
            nativeTopicError: "这个话题还在生成中，请稍后从请教列表再进入",
            nativeTopic: null,
            nativeTopicNodes: [],
            activeTopicNodeKey: "",
            activeTopicNode: null,
            nativeTopicNodeCache: {},
            nativeTopicNodeLoading: false,
            nativeTopicNodeError: ""
          });
          return null;
        }
        const firstNode = nativeTopicNodes[0];
        saveNativeTopicDetailCache(slug, userId, {
          detailResponse: response,
          firstNodeKey: firstNode && firstNode.nodeKey
        });
        this.setData({
          title: nativeTopic.title,
          nativeTopic,
          nativeTopicNodes,
          nativeTopicLoading: false,
          nativeTopicError: ""
        });
        return firstNode ? this.loadNativeTopicNode(firstNode.nodeKey, { generation, slug, forceRefresh: true }) : null;
      })
      .catch((error) => {
        if (this.data.nativeTopicGeneration !== generation) return null;
        if (Number(error && error.statusCode) === 404 && slug) {
          wx.setStorageSync(INVALID_TOPIC_CACHE_KEY, slug);
          if (typeof wx.showToast === "function") {
            wx.showToast({ title: "话题已失效，已返回请教列表", icon: "none" });
          }
          this.setData({
            nativeTopicLoading: false,
            nativeTopicError: "",
            nativeTopic: null,
            nativeTopicNodes: [],
            activeTopicNodeKey: "",
            activeTopicNode: null,
            nativeTopicNodeCache: {},
            nativeTopicNodeLoading: false,
            nativeTopicNodeError: ""
          });
          if (typeof wx.switchTab === "function") {
            wx.switchTab({ url: "/pages/topics/index" });
            return null;
          }
        }
        this.setData({
          nativeTopicLoading: false,
          nativeTopicError: (error && error.message) || "话题加载失败，请稍后重试"
        });
      });
  },

  openNativeRelatedTopic(event) {
    const slug = normalizeNativeTopicSlugParam(event && event.currentTarget && event.currentTarget.dataset
      ? event.currentTarget.dataset.slug
      : "");
    if (!slug) return Promise.resolve(null);
    const generation = Number(this.data.nativeTopicGeneration || 0) + 1;
    return new Promise((resolve, reject) => {
      this.setData({
        nativeTopicMode: true,
        nativeTopicGeneration: generation,
        nativeTopicSlug: slug,
        nativeTopicLoading: true,
        nativeTopicError: "",
        nativeTopic: null,
        nativeTopicNodes: [],
        activeTopicNodeKey: "",
        activeTopicNode: null,
        nativeTopicNodeLoading: false,
        nativeTopicNodeError: "",
        nativeTopicNodeCache: {},
        nextNativeTopicNode: null,
        nativeTopicAtBottom: false,
        nativeTopicPullStartY: null,
        nativeTopicPullDistance: 0,
        nativeTopicPullState: "idle",
        nativeTopicScrollTop: -1,
        nativeTopicScrollTarget: "",
        nativeTopicExpandLoading: false,
        nativeTopicQuestionText: "",
        nativeTopicQuestionLoading: false,
        nativeTopicActionError: ""
      }, () => {
        this.setData({ nativeTopicScrollTop: 0 });
        Promise.resolve(this.loadNativeTopic(slug, { generation })).then(resolve, reject);
      });
    });
  },

  loadNativeTopicNode(nodeKey, options = {}) {
    const key = String(nodeKey || "").trim();
    if (!key) return Promise.resolve(null);
    const generation = Number(options.generation) || Number(this.data.nativeTopicGeneration || 0);
    const sourceSlug = String(options.slug || this.data.nativeTopic && this.data.nativeTopic.slug || "").trim();
    const cached = this.data.nativeTopicNodeCache && this.data.nativeTopicNodeCache[key];
    if (cached && !options.forceRefresh) {
      this.setData({
        activeTopicNodeKey: key,
        activeTopicNode: cached,
        nextNativeTopicNode: getNextTopicNode(this.data.nativeTopicNodes, key),
        nativeTopicNodeLoading: false,
        nativeTopicNodeError: "",
        nativeTopicAtBottom: false,
        nativeTopicPullState: "idle",
        nativeTopicPullDistance: 0,
        nativeTopicExpandLoading: false,
        nativeTopicQuestionText: "",
        nativeTopicQuestionLoading: false,
        nativeTopicActionError: "",
        nativeTopicScrollTarget: "",
        ...(options.resetScroll ? { nativeTopicScrollTop: 0 } : {})
      });
      return Promise.resolve(cached);
    }
    const topic = this.data.nativeTopic || {};
    const slug = String(topic.slug || "").trim();
    const userId = String(this.data.nativeTopicUserId || "").trim();
    const query = userId ? `?userId=${encodeURIComponent(userId)}` : "";
    this.setData({
      activeTopicNodeKey: key,
      activeTopicNode: options.forceRefresh && cached ? cached : null,
      nextNativeTopicNode: getNextTopicNode(this.data.nativeTopicNodes, key),
      nativeTopicNodeLoading: !(options.forceRefresh && cached),
      nativeTopicNodeError: "",
      nativeTopicAtBottom: false,
      nativeTopicPullState: "idle",
      nativeTopicPullDistance: 0,
      nativeTopicExpandLoading: false,
      nativeTopicQuestionText: "",
      nativeTopicQuestionLoading: false,
      nativeTopicActionError: "",
      nativeTopicScrollTarget: "",
      ...(options.resetScroll ? { nativeTopicScrollTop: 0 } : {})
    });
    return request({
      url: `/api/topic-hub/${encodeURIComponent(slug)}/nodes/${encodeURIComponent(key)}${query}`
    })
      .then((response) => {
        const baseNode = this.data.nativeTopicNodes.find((node) => node.nodeKey === key) || {};
        const activeTopicNode = normalizeTopicNodeDetail(response, baseNode, key);
        const firstNode = this.data.nativeTopicNodes[0] || {};
        if (key === firstNode.nodeKey) {
          saveNativeTopicDetailCache(slug, userId, {
            firstNodeKey: key,
            firstNodeResponse: response
          });
        }
        const stillCurrentTopic = this.data.nativeTopicGeneration === generation
          && String(this.data.nativeTopic && this.data.nativeTopic.slug || "").trim() === sourceSlug;
        if (!stillCurrentTopic) return activeTopicNode;
        const visible = this.data.activeTopicNodeKey === key;
        this.setData({
          ...(visible ? {
            activeTopicNode,
            nextNativeTopicNode: getNextTopicNode(this.data.nativeTopicNodes, key),
            nativeTopicNodeLoading: false,
            nativeTopicNodeError: ""
          } : {}),
          nativeTopicNodeCache: { ...(this.data.nativeTopicNodeCache || {}), [key]: activeTopicNode }
        });
        return activeTopicNode;
      })
      .catch((error) => {
        if (this.data.nativeTopicGeneration !== generation
          || String(this.data.nativeTopic && this.data.nativeTopic.slug || "").trim() !== sourceSlug
          || this.data.activeTopicNodeKey !== key) return null;
        this.setData({
          nativeTopicNodeLoading: false,
          nativeTopicNodeError: (error && error.message) || "知识点加载失败，请稍后重试"
        });
        return null;
      });
  },

  selectNativeTopicNode(event) {
    const nodeKey = event && event.currentTarget && event.currentTarget.dataset
      ? event.currentTarget.dataset.nodeKey
      : "";
    this.setData({ nativeTopicMobileView: "detail" });
    return this.loadNativeTopicNode(nodeKey, { resetScroll: true });
  },

  setNativeTopicMobileView(event) {
    const view = String(event && event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset.view || "");
    if (view !== "tree" && view !== "detail") return;
    this.setData({ nativeTopicMobileView: view });
  },

  toggleNativeTopicBranch(event) {
    const key = String(event && event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset.branchKey || "").trim();
    if (!key) return;
    const collapsed = new Set(Array.isArray(this.data.nativeTopicCollapsedBranches) ? this.data.nativeTopicCollapsedBranches : []);
    if (collapsed.has(key)) collapsed.delete(key);
    else collapsed.add(key);
    const nativeTopicCollapsedBranches = Array.from(collapsed);
    const nativeTopic = this.data.nativeTopic ? {
      ...this.data.nativeTopic,
      tree: (this.data.nativeTopic.tree || []).map((branch) => ({
        ...branch,
        collapsed: collapsed.has(branch.nodeKey)
      }))
    } : null;
    this.setData({ nativeTopicCollapsedBranches, nativeTopic });
  },

  retryNativeTopicNode() {
    const key = String(this.data.activeTopicNodeKey || "").trim();
    if (!key) return Promise.resolve(null);
    const cache = { ...(this.data.nativeTopicNodeCache || {}) };
    delete cache[key];
    this.setData({ nativeTopicNodeCache: cache });
    return this.loadNativeTopicNode(key);
  },

  updateNativeTopicQuestion(event) {
    this.setData({
      nativeTopicQuestionText: String(event && event.detail && event.detail.value || "")
    });
  },

  updateNativeTopicNodeByKey(nodeKey, patch, fallbackNode) {
    const key = String(nodeKey || "").trim();
    if (!key) return null;
    const current = this.data.nativeTopicNodeCache && this.data.nativeTopicNodeCache[key]
      || fallbackNode
      || (this.data.activeTopicNodeKey === key ? this.data.activeTopicNode : null);
    if (!current) return null;
    const updatedNode = { ...current, ...patch, nodeKey: key };
    updatedNode.contentParts = buildNativeTopicContentParts(updatedNode.expandedContent || updatedNode.content || "");
    this.setData({
      ...(this.data.activeTopicNodeKey === key ? { activeTopicNode: updatedNode } : {}),
      nativeTopicNodeCache: {
        ...(this.data.nativeTopicNodeCache || {}),
        [key]: updatedNode
      }
    });
    return updatedNode;
  },

  handleNativeTopicActionError(error) {
    const statusCode = Number(error && error.statusCode);
    const needsPro = statusCode === 402 || !!(error && error.data && error.data.code === "PRO_REQUIRED");
    this.setData({
      nativeTopicActionError: (error && error.message) || "操作失败，请稍后重试",
      ...(statusCode === 401 ? { webviewLoginRequired: true } : {})
    });
    if (needsPro) this.openNativePro();
  },

  clearNativeTopicExpandTimer() {
    if (this.nativeTopicExpandTimer) {
      clearTimeout(this.nativeTopicExpandTimer);
      this.nativeTopicExpandTimer = null;
    }
  },

  scrollNativeTopicExpandIntoView() {
    this.setData({ nativeTopicScrollTarget: "" });
    const applyTarget = () => this.setData({ nativeTopicScrollTarget: "xfTopicExpandAnchor" });
    if (typeof wx !== "undefined" && wx && typeof wx.nextTick === "function") {
      wx.nextTick(applyTarget);
    } else {
      setTimeout(applyTarget, 0);
    }
  },

  applyNativeTopicExpandedContent(nodeKey, expandedContent, fallbackNode, options = {}) {
    const key = String(nodeKey || "").trim();
    const content = stripNativeTopicTerminalContent(expandedContent);
    if (!key || !content) return null;
    const updatedNode = this.updateNativeTopicNodeByKey(key, { expandedContent: content }, fallbackNode);
    if (this.data.activeTopicNodeKey === key) {
      this.scrollNativeTopicExpandIntoView();
      if (options.done) {
        this.setData({ nativeTopicExpandLoading: false, nativeTopicActionError: "" });
      }
    }
    return updatedNode;
  },

  playNativeTopicExpandTyping(nodeKey, expandedContent, fallbackNode, actionId, generation, slug) {
    const key = String(nodeKey || "").trim();
    const fullContent = stripNativeTopicTerminalContent(expandedContent);
    const separatorIndex = fullContent.indexOf("\n\n---\n\n");
    if (separatorIndex < 0 || fullContent.slice(separatorIndex).length <= 8) {
      this.applyNativeTopicExpandedContent(key, fullContent, fallbackNode, { done: true });
      return;
    }

    const prefix = fullContent.slice(0, separatorIndex);
    const suffix = fullContent.slice(separatorIndex);
    let offset = 0;
    this.applyNativeTopicExpandedContent(key, prefix, fallbackNode, { done: false });

    const typeNext = () => {
      if (
        this.data.nativeTopicExpandActionId !== actionId
        || this.data.nativeTopicGeneration !== generation
        || String(this.data.nativeTopic && this.data.nativeTopic.slug || "").trim() !== slug
      ) return;

      if (this.data.activeTopicNodeKey !== key) {
        this.applyNativeTopicExpandedContent(key, fullContent, fallbackNode, { done: false });
        return;
      }

      offset += 2;
      if (offset >= suffix.length) {
        this.applyNativeTopicExpandedContent(key, `${prefix}${suffix}\n\n以上。`, fallbackNode, { done: true });
        return;
      }

      this.applyNativeTopicExpandedContent(key, prefix + suffix.slice(0, offset), fallbackNode, { done: false });
      this.nativeTopicExpandTimer = setTimeout(typeNext, 45);
    };

    typeNext();
  },

  expandNativeTopicNode() {
    const topic = this.data.nativeTopic || {};
    const node = this.data.activeTopicNode;
    const slug = String(topic.slug || "").trim();
    const nodeKey = String(node && node.nodeKey || this.data.activeTopicNodeKey || "").trim();
    const nodeTitle = String(node && node.title || "").trim();
    const generation = Number(this.data.nativeTopicGeneration || 0);
    if (!slug || !nodeKey || !nodeTitle || this.data.nativeTopicExpandLoading) return Promise.resolve(null);
    const actionId = Number(this.data.nativeTopicExpandActionId || 0) + 1;
    this.clearNativeTopicExpandTimer();
    const existingContent = stripNativeTopicTerminalContent(node && (node.expandedContent || node.content) || "");
    this.setData({ nativeTopicExpandActionId: actionId, nativeTopicExpandLoading: true, nativeTopicActionError: "", nativeTopicScrollTarget: "" });
    return request({
      url: `/api/topic-hub/${encodeURIComponent(slug)}/expand`,
      method: "POST",
      data: {
        nodeKey,
        nodeTitle,
        topicTitle: String(topic.title || "").trim(),
        deep: true,
        existingContent
      }
    })
      .then((response) => {
        if (this.data.nativeTopicExpandActionId !== actionId || this.data.nativeTopicGeneration !== generation || String(this.data.nativeTopic && this.data.nativeTopic.slug || "").trim() !== slug) return response;
        const expandedContent = String(response && response.expanded || "").trim();
        if (expandedContent) {
          if (this.data.activeTopicNodeKey === nodeKey) {
            this.playNativeTopicExpandTyping(nodeKey, expandedContent, node, actionId, generation, slug);
          } else {
            this.updateNativeTopicNodeByKey(nodeKey, { expandedContent }, node);
          }
        } else if (this.data.activeTopicNodeKey === nodeKey) {
          this.setData({ nativeTopicExpandLoading: false, nativeTopicActionError: "暂时没有生成更多内容，请稍后再试" });
        }
        return response;
      })
      .catch((error) => {
        if (this.data.nativeTopicExpandActionId !== actionId || this.data.nativeTopicGeneration !== generation || String(this.data.nativeTopic && this.data.nativeTopic.slug || "").trim() !== slug) return null;
        if (this.data.activeTopicNodeKey === nodeKey) {
          this.setData({ nativeTopicExpandLoading: false });
          this.handleNativeTopicActionError(error);
        }
        return null;
      });
  },

  submitNativeTopicQuestion() {
    const question = String(this.data.nativeTopicQuestionText || "").trim();
    const topic = this.data.nativeTopic || {};
    const node = this.data.activeTopicNode;
    const slug = String(topic.slug || "").trim();
    const nodeKey = String(node && node.nodeKey || this.data.activeTopicNodeKey || "").trim();
    const generation = Number(this.data.nativeTopicGeneration || 0);
    if (!question || !slug || !nodeKey || this.data.nativeTopicQuestionLoading) return Promise.resolve(null);
    const actionId = Number(this.data.nativeTopicQuestionActionId || 0) + 1;
    this.setData({ nativeTopicQuestionActionId: actionId, nativeTopicQuestionLoading: true, nativeTopicActionError: "" });
    return request({
      url: `/api/topic-hub/${encodeURIComponent(slug)}/ask`,
      method: "POST",
      data: {
        question,
        userId: String(this.data.nativeTopicUserId || "").trim(),
        nodeKey
      }
    })
      .then((response) => {
        if (this.data.nativeTopicQuestionActionId !== actionId || this.data.nativeTopicGeneration !== generation || String(this.data.nativeTopic && this.data.nativeTopic.slug || "").trim() !== slug) return response;
        const questions = Array.isArray(node.questions) ? node.questions : [];
        this.updateNativeTopicNodeByKey(nodeKey, {
          questions: [...questions, {
            content: String(response && response.question || question),
            answer: String(response && response.answer || ""),
            statusText: String(response && response.message || "")
          }]
        }, node);
        if (this.data.activeTopicNodeKey === nodeKey) {
          this.setData({ nativeTopicQuestionText: "", nativeTopicQuestionLoading: false, nativeTopicActionError: "" });
        }
        return response;
      })
      .catch((error) => {
        if (this.data.nativeTopicQuestionActionId !== actionId || this.data.nativeTopicGeneration !== generation || String(this.data.nativeTopic && this.data.nativeTopic.slug || "").trim() !== slug) return null;
        if (this.data.activeTopicNodeKey === nodeKey) {
          this.setData({ nativeTopicQuestionLoading: false });
          this.handleNativeTopicActionError(error);
        }
        return null;
      });
  },

  enterNextNativeTopicNode() {
    const next = this.data.nextNativeTopicNode
      || getNextTopicNode(this.data.nativeTopicNodes, this.data.activeTopicNodeKey);
    if (!this.data.nativeTopicAtBottom || !next || this.data.nativeTopicNodeLoading) return Promise.resolve(null);
    this.setData({ nativeTopicPullState: "loading" });
    return this.loadNativeTopicNode(next.nodeKey, { resetScroll: true });
  },

  onNativeTopicScrollToLower() {
    this.setData({ nativeTopicAtBottom: true });
  },

  onNativeTopicPullStart(event) {
    if (!this.data.nativeTopicAtBottom || !this.data.nextNativeTopicNode && !getNextTopicNode(this.data.nativeTopicNodes, this.data.activeTopicNodeKey)) return;
    const touch = event && event.touches && event.touches[0];
    if (!touch) return;
    this.setData({ nativeTopicPullStartY: touch.clientY, nativeTopicPullDistance: 0, nativeTopicPullState: "pulling" });
  },

  onNativeTopicPullMove(event) {
    if (!this.data.nativeTopicAtBottom || this.data.nativeTopicPullStartY === null) return;
    const touch = event && event.touches && event.touches[0];
    if (!touch) return;
    const distance = Math.max(0, this.data.nativeTopicPullStartY - touch.clientY);
    this.setData({
      nativeTopicPullDistance: distance,
      nativeTopicPullState: distance >= NATIVE_TOPIC_PULL_THRESHOLD ? "ready" : "pulling"
    });
  },

  onNativeTopicPullEnd() {
    if (this.data.nativeTopicPullState === "ready") return this.enterNextNativeTopicNode();
    this.setData({ nativeTopicPullStartY: null, nativeTopicPullDistance: 0, nativeTopicPullState: "idle" });
    return Promise.resolve(null);
  },

  retryNativeTopic() {
    const slug = String(this.data.nativeTopic && this.data.nativeTopic.slug || this.data.nativeTopicSlug || "").trim();
    if (!slug) return Promise.resolve(null);
    this.setData({ nativeTopicLoading: true, nativeTopicError: "" });
    return this.loadNativeTopic(slug);
  },

  loadNativeProgram(programId) {
    const encodedId = encodeURIComponent(programId);
    return request({ url: `/api/programs/${encodedId}` })
      .then((response) => {
        const nativeProgram = normalizeProgramDetail(response && (response.program || response.data || response));
        const wishState = readGuestWishState(nativeProgram.guestId);
        nativeProgram.guestWishSent = wishState.sent;
        nativeProgram.guestWishCount = wishState.count;
        const firstMode = nativeProgram.contentModes[0] && nativeProgram.contentModes[0].key;
        const mindMapOutline = buildNativeProgramMindMapOutline(nativeProgram.mindMap, []);
        this.setData({
          title: nativeProgram.title,
          nativeProgram,
          selectedProgramDictionaryEntry: null,
          nativeProgramMindMapCollapsedBranches: [],
          nativeProgramMindMapOutline: mindMapOutline,
          activeContentMode: firstMode || "quickview",
          nativeProgramLoading: false,
          nativeProgramError: ""
        });
      })
      .catch((error) => {
        this.setData({
          nativeProgramLoading: false,
          nativeProgramError: (error && error.message) || "节目加载失败，请稍后重试"
        });
      });
  },

  loadNativeExpert(expertId) {
    const encodedId = encodeURIComponent(expertId);
    return request({ url: `/api/guests/${encodedId}` })
      .then((response) => {
        const nativeExpert = normalizeExpertDetail(response && (response.guest || response.data || response));
        const wishState = readGuestWishState(nativeExpert.id);
        nativeExpert.wishSent = wishState.sent;
        nativeExpert.wishCount = wishState.count;
        this.setData({
          title: nativeExpert.name,
          nativeExpert,
          nativeExpertLoading: false,
          nativeExpertError: "",
          nativeExpertAgentLoading: nativeExpert.agentEnabled,
          nativeExpertAgentError: "",
          nativeExpertAgentNeedsPro: false,
          nativeExpertAuthed: !!getToken()
        });
        return this.loadNativeExpertAgentSession(nativeExpert);
      })
      .catch((error) => {
        this.setData({
          nativeExpertLoading: false,
          nativeExpertAgentLoading: false,
          nativeExpertError: (error && error.message) || "智库详情加载失败，请稍后重试"
        });
      });
  },

  loadNativeExpertAgentSession(expert) {
    const nativeExpert = expert || this.data.nativeExpert || {};
    if (!nativeExpert.id || !nativeExpert.agentEnabled) {
      this.setData({
        nativeExpertAgentLoading: false,
        nativeExpertAgent: null,
        nativeExpertMessages: []
      });
      return Promise.resolve();
    }
    const encodedId = encodeURIComponent(nativeExpert.id);
    const authed = !!getToken();
    const profileRequest = request({ url: `/api/guests/${encodedId}/agent` });
    const historyRequest = authed
      ? request({ url: `/api/guests/${encodedId}/agent/history` })
      : Promise.resolve({ messages: [] });
    return Promise.allSettled([profileRequest, historyRequest]).then(([profileResult, historyResult]) => {
      const agent = profileResult.status === "fulfilled"
        ? normalizeNativeExpertAgentProfile(profileResult.value, nativeExpert)
        : normalizeNativeExpertAgentProfile({}, nativeExpert);
      const history = historyResult.status === "fulfilled" ? historyResult.value : {};
      this.setData({
        nativeExpertAgentLoading: false,
        nativeExpertAgentError: profileResult.status === "rejected"
          ? ((profileResult.reason && profileResult.reason.message) || "嘉宾 AI 分身暂时无法加载")
          : "",
        nativeExpertAgent: agent,
        nativeExpertAuthed: authed,
        nativeExpertMessages: normalizeNativeExpertMessages(history && history.messages)
      });
    });
  },

  loadNativeWorthBuy(query) {
    const encodedQuery = encodeURIComponent(query);
    return request({ url: `/api/worthbuy/${encodedQuery}` })
      .then((response) => {
        const nativeWorthBuy = normalizeWorthBuyDetail(response && (response.item || response.data || response));
        this.setData({
          title: nativeWorthBuy.title,
          nativeWorthBuy,
          nativeWorthBuyLoading: false,
          nativeWorthBuyError: ""
        });
      })
      .catch((error) => {
        this.setData({
          nativeWorthBuyLoading: false,
          nativeWorthBuyError: (error && error.message) || "知物详情加载失败，请稍后重试"
        });
      });
  },

  loadNativeBook(bookId, keepRendered) {
    const encodedId = encodeURIComponent(bookId);
    return Promise.allSettled([
      request({ url: `/api/books/${encodedId}` }),
      request({ url: `/api/books/${encodedId}/metadata` })
    ])
      .then((results) => {
        const bookResult = results[0];
        const metadataResult = results[1];
        const rawBook = bookResult.status === "fulfilled"
          ? (bookResult.value && (bookResult.value.book || bookResult.value.data || bookResult.value))
          : null;
        const metadata = metadataResult.status === "fulfilled"
          ? (metadataResult.value && (metadataResult.value.metadata || metadataResult.value.data || metadataResult.value))
          : null;
        if (!rawBook) {
          if (keepRendered) return null;
          throw (bookResult.status === "rejected" ? bookResult.reason : new Error("图书详情加载失败"));
        }
        const nativeBook = normalizeBookDetail(rawBook, metadata);
        try {
          if (wx.setStorageSync) wx.setStorageSync(bookDetailCacheKey(bookId), { ...rawBook, metadataDetail: metadata });
        } catch (_error) {}
        this.setData({
          title: nativeBook.title,
          nativeBook,
          nativeBookLoading: false,
          nativeBookError: "",
          nativeBookIntroTranslated: false,
          nativeBookTranslationLoading: false,
          nativeBookTranslationError: "",
          nativeBookCoverFrameStyle: ""
        });
        return this.refreshNativeBookRelatedBooks(nativeBook).then(() => nativeBook);
      })
      .catch((error) => {
        if (keepRendered) return null;
        this.setData({
          nativeBookLoading: false,
          nativeBookError: (error && error.message) || "图书详情加载失败，请稍后重试"
        });
        return null;
      });
  },

  refreshNativeBookRelatedBooks(nativeBook) {
    const book = nativeBook || this.data.nativeBook || {};
    if (!book || book.isExternal || book.hasRelatedBooks) return Promise.resolve(book);
    if (!getNativeBookRelationTokens(book).length) return Promise.resolve(book);
    return preloadNativeReadingBooks()
      .then((response) => {
        const loadedRecords = extractNativeBookRecords(response);
        if (loadedRecords.length) writeNativeBookRecords(loadedRecords);
        const candidates = loadedRecords.length ? loadedRecords : readNativeBookRecords();
        const relatedBooks = buildNativeBookRelatedBooks(book, candidates);
        if (!relatedBooks.length) return book;
        const currentBook = this.data.nativeBook || {};
        if (String(currentBook.id || "") !== String(book.id || "")) return book;
        const nextBook = {
          ...currentBook,
          relatedBooks,
          hasRelatedBooks: true
        };
        this.setData({ nativeBook: nextBook });
        return nextBook;
      })
      .catch(() => book);
  },

  loadNativeExternalBook(bookId, fallbackBook, keepRendered) {
    if (fallbackBook) {
      const nativeBook = normalizeExternalBookDetail(fallbackBook);
      this.setData({
        title: nativeBook.title,
        nativeBook,
        nativeBookLoading: false,
        nativeBookError: "",
        nativeBookIntroTranslated: false,
        nativeBookTranslationLoading: false,
        nativeBookTranslationError: "",
        nativeBookCoverFrameStyle: ""
      });
      return Promise.resolve(nativeBook);
    }
    const encodedId = encodeURIComponent(bookId);
    return request({ url: `/api/books/external/${encodedId}` })
      .then((response) => {
        const nativeBook = normalizeExternalBookDetail(response && (response.book || response.data || response));
        this.setData({
          title: nativeBook.title,
          nativeBook,
          nativeBookLoading: false,
          nativeBookError: "",
          nativeBookIntroTranslated: false,
          nativeBookTranslationLoading: false,
          nativeBookTranslationError: "",
          nativeBookCoverFrameStyle: ""
        });
      })
      .catch((error) => {
        if (keepRendered) return null;
        this.setData({
          nativeBookLoading: false,
          nativeBookError: (error && error.message) || "图书详情加载失败，请稍后重试"
        });
        return null;
      });
  },

  onNativeBookCoverLoad(event) {
    const detail = event && event.detail ? event.detail : {};
    const frameStyle = buildNativeBookCoverFrameStyle(detail.width, detail.height);
    if (!frameStyle || frameStyle === this.data.nativeBookCoverFrameStyle) return;
    this.setData({ nativeBookCoverFrameStyle: frameStyle });
  },

  openNativeRelatedBook(event) {
    const index = Number(event && event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset.index);
    const relatedBooks = this.data.nativeBook && Array.isArray(this.data.nativeBook.relatedBooks)
      ? this.data.nativeBook.relatedBooks
      : [];
    const related = relatedBooks[index];
    const raw = related && related.raw;
    const isExternal = !!(related && related.isExternal);
    const bookId = firstText([related && related.id, raw && raw.id, raw && raw._id], "");
    if (!bookId || !raw) return;
    try {
      if (wx.setStorageSync) {
        wx.setStorageSync(isExternal ? externalBookDetailCacheKey(bookId) : bookDetailCacheKey(bookId), raw);
      }
    } catch (_error) {}
    this.setData({ nativeBookLoading: true, nativeBookError: "" });
    return isExternal ? this.loadNativeExternalBook(bookId, raw) : this.loadNativeBook(bookId);
  },

  openNativeExternalRelatedBook(event) {
    return this.openNativeRelatedBook(event);
  },

  toggleNativeBookIntroTranslation() {
    const book = this.data.nativeBook || {};
    const description = firstText([book.description], "");
    const bookId = firstText([book.id], "");
    if (!bookId || !description || !book.isExternal || this.data.nativeBookTranslationLoading) return Promise.resolve();
    if (this.data.nativeBookIntroTranslated) {
      this.setData({
        nativeBook: {
          ...book,
          introParagraphs: splitBookIntro(description)
        },
        nativeBookIntroTranslated: false,
        nativeBookTranslationError: ""
      });
      return Promise.resolve();
    }
    if (book.translatedDescription) {
      this.setData({
        nativeBook: {
          ...book,
          introParagraphs: splitBookIntro(book.translatedDescription)
        },
        nativeBookIntroTranslated: true,
        nativeBookTranslationError: ""
      });
      return Promise.resolve();
    }

    this.setData({
      nativeBookTranslationLoading: true,
      nativeBookTranslationError: ""
    });

    const encodedId = encodeURIComponent(bookId);
    return request({
      url: `/api/books/external/${encodedId}/description-translation`,
      method: "POST",
      data: {
        title: firstText([book.title], ""),
        description
      }
    })
      .then((response) => {
        const translatedDescription = firstText([
          response && response.translatedDescription,
          response && response.data && response.data.translatedDescription
        ], "");
        if (!translatedDescription) {
          this.setData({
            nativeBookTranslationLoading: false,
            nativeBookTranslationError: "翻译失败，请稍后重试"
          });
          return;
        }
        this.setData({
          nativeBook: {
            ...book,
            translatedDescription,
            introParagraphs: splitBookIntro(translatedDescription)
          },
          nativeBookIntroTranslated: true,
          nativeBookTranslationLoading: false,
          nativeBookTranslationError: ""
        });
      })
      .catch((error) => {
        this.setData({
          nativeBookTranslationLoading: false,
          nativeBookTranslationError: (error && error.message) || "翻译失败，请稍后重试"
        });
      });
  },

  setContentMode(event) {
    const mode = String(event && event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset.mode || "");
    if (!mode) return;
    this.setData({ activeContentMode: mode });
  },

  openProgramDictionaryEntry(event) {
    const entryId = String(event && event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset.entryId || "");
    const entries = this.data.nativeProgram && Array.isArray(this.data.nativeProgram.dictionaryEntries)
      ? this.data.nativeProgram.dictionaryEntries
      : [];
    const entry = entries.find((item) => item.id === entryId);
    if (!entry) return;
    this.setData({ selectedProgramDictionaryEntry: entry });
  },

  closeProgramDictionaryEntry() {
    this.setData({ selectedProgramDictionaryEntry: null });
  },

  stopNativeEvent() {
    return false;
  },

  toggleNativeProgramMindMapBranch(event) {
    const branchIndex = Number(event && event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset.index);
    const program = this.data.nativeProgram || {};
    const branches = program.mindMap && program.mindMap.root && Array.isArray(program.mindMap.root.children)
      ? program.mindMap.root.children
      : [];
    const branch = branches[branchIndex];
    if (!Number.isInteger(branchIndex) || branchIndex < 0 || !branch || !Array.isArray(branch.children) || !branch.children.length) return;
    const collapsedSet = getNativeProgramMindMapCollapsedBranchSet(this.data.nativeProgramMindMapCollapsedBranches);
    if (collapsedSet.has(branchIndex)) collapsedSet.delete(branchIndex);
    else collapsedSet.add(branchIndex);
    const collapsedBranches = Array.from(collapsedSet).sort((left, right) => left - right);
    const outline = buildNativeProgramMindMapOutline(program.mindMap, collapsedBranches);
    this.setData({
      nativeProgramMindMapCollapsedBranches: collapsedBranches,
      nativeProgramMindMapOutline: outline
    });
  },

  useNativeProgramGuestAvatarFallback() {
    const program = this.data.nativeProgram || {};
    if (program.guestAvatarFallback && program.guestAvatar === GUEST_FALLBACK_AVATAR) return;
    const guests = Array.isArray(program.guests) ? program.guests.slice() : [];
    if (guests[program.activeGuestIndex]) {
      guests[program.activeGuestIndex] = {
        ...guests[program.activeGuestIndex],
        avatar: GUEST_FALLBACK_AVATAR,
        avatarFallback: true
      };
    }
    this.setData({
      nativeProgram: {
        ...program,
        guests,
        guestAvatar: GUEST_FALLBACK_AVATAR,
        guestAvatarFallback: true
      }
    });
  },

  useNativeProgramGuestPillAvatarFallback(event) {
    const program = this.data.nativeProgram || {};
    const index = Number(event && event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset.index);
    const guests = Array.isArray(program.guests) ? program.guests.slice() : [];
    if (!Number.isInteger(index) || index < 0 || !guests[index]) return;
    guests[index] = { ...guests[index], avatar: GUEST_FALLBACK_AVATAR, avatarFallback: true };
    const activePatch = index === program.activeGuestIndex
      ? { guestAvatar: GUEST_FALLBACK_AVATAR, guestAvatarFallback: true }
      : {};
    this.setData({ nativeProgram: { ...program, guests, ...activePatch } });
  },

  toggleNativeAudio() {
    const program = this.data.nativeProgram || {};
    if (!program.audioUrl) {
      wx.showToast({ title: "暂无音频", icon: "none" });
      return;
    }
    this.showNativePlayerQuickActions();
    if (!this.audioContext) {
      this.audioContext = wx.createInnerAudioContext();
      this.audioContext.onPlay(() => this.setData({ isAudioPlaying: true }));
      this.audioContext.onPause(() => this.setData({ isAudioPlaying: false }));
      this.audioContext.onStop(() => this.setData({ isAudioPlaying: false }));
      this.audioContext.onEnded(() => this.setData({ isAudioPlaying: false }));
    }
    if (this.data.isAudioPlaying) {
      this.audioContext.pause();
      return;
    }
    this.audioContext.src = program.audioUrl;
    this.audioContext.playbackRate = this.data.audioPlaybackRate || 1;
    this.audioContext.play();
  },

  seekNativeAudio(event) {
    this.showNativePlayerQuickActions();
    if (!this.audioContext || typeof this.audioContext.seek !== "function") return;
    const seconds = Number(event && event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset.seconds) || 0;
    const currentTime = Number(this.audioContext.currentTime || 0);
    this.audioContext.seek(Math.max(0, currentTime + seconds));
  },

  toggleNativeAudioSpeed() {
    this.showNativePlayerQuickActions();
    const rates = [1, 1.25, 1.5, 2];
    const current = Number(this.data.audioPlaybackRate || 1);
    const next = rates[(rates.indexOf(current) + 1) % rates.length] || 1;
    if (this.audioContext) this.audioContext.playbackRate = next;
    this.setData({
      audioPlaybackRate: next,
      audioSpeedLabel: `${next.toFixed(next % 1 === 0 ? 0 : 2)}x`
    });
  },

  openNativeProgramTranscript() {
    this.showNativePlayerQuickActions();
    const program = this.data.nativeProgram || {};
    if (program.hasTranscript) this.setData({ activeContentMode: "transcript" });
  },

  showNativePlayerQuickActions() {
    if (this.nativePlayerQuickActionsTimer) clearTimeout(this.nativePlayerQuickActionsTimer);
    this.setData({ playerQuickActionsOpen: true });
    this.nativePlayerQuickActionsTimer = setTimeout(() => {
      this.setData({ playerQuickActionsOpen: false });
      this.nativePlayerQuickActionsTimer = null;
    }, 5000);
  },

  goProgramList() {
    wx.switchTab({ url: "/pages/programs/index" });
  },

  openNativeProgramCuratedBook(event) {
    const index = Number(event && event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset.index);
    const program = this.data.nativeProgram || {};
    const items = Array.isArray(program.curatedReading) ? program.curatedReading : [];
    const item = items[index];
    const bookId = firstText([item && item.bookId], "");
    if (!item || !bookId) return;
    const targetUrl = `${DEFAULT_WEB_ORIGIN}/reading/${encodeURIComponent(bookId)}`;
    wx.navigateTo({
      url: `/pages/webview/index?title=${encodeURIComponent(item.title || "图书详情")}&url=${encodeURIComponent(targetUrl)}`
    });
  },

  toggleNativeProgramBookmark() {
    const program = this.data.nativeProgram || {};
    this.setData({
      nativeProgram: {
        ...program,
        bookmarked: !program.bookmarked
      }
    });
    wx.showToast({ title: program.bookmarked ? "已取消收藏" : "已收藏", icon: "none" });
  },

  toggleNativeProgramGuestWish() {
    const program = this.data.nativeProgram || {};
    submitNativeGuestWish(this, "nativeProgram", program.guestId, program.id);
  },

  switchNativeProgramGuest(event) {
    const program = this.data.nativeProgram || {};
    const index = Number(event && event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset.index);
    const guests = Array.isArray(program.guests) ? program.guests : [];
    if (!Number.isInteger(index) || index < 0 || index >= guests.length || index === program.activeGuestIndex) return;
    const guestState = buildNativeProgramGuestState(guests, index);
    const wishState = readGuestWishState(guestState.guestId);
    this.setData({
      nativeProgram: {
        ...program,
        ...guestState,
        guestWishSent: wishState.sent,
        guestWishCount: wishState.count,
        guestWishAnimating: false,
        guestWishBubbles: []
      }
    });
  },

  openNativeProgramGuest() {
    const program = this.data.nativeProgram || {};
    if (!program.guestId) return;
    wx.navigateTo({
      url: `/pages/webview/index?title=${encodeURIComponent(program.guestName || "智库详情")}&url=${encodeURIComponent(`${DEFAULT_WEB_ORIGIN}/experts/${encodeURIComponent(program.guestId)}`)}`
    });
  },

  toggleNativeExpertWish() {
    const expert = this.data.nativeExpert || {};
    submitNativeGuestWish(this, "nativeExpert", expert.id, expert.id);
  },

  useNativeExpertAvatarFallback() {
    const expert = this.data.nativeExpert || {};
    this.setData({
      nativeExpert: {
        ...expert,
        avatar: `${DEFAULT_WEB_ORIGIN}/assets/wel-avatar/no-hat.png`
      }
    });
  },

  setNativeExpertProfileTab(event) {
    const tab = String(event && event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset.tab || "");
    if (tab !== "programs" && tab !== "publications") return;
    this.setData({ nativeExpertProfileTab: tab });
  },

  onNativeExpertScroll(event) {
    const scrollTop = Number(event && event.detail && event.detail.scrollTop) || 0;
    const visible = scrollTop > 180;
    if (visible === this.data.nativeExpertCompactHeaderVisible) return;
    this.setData({ nativeExpertCompactHeaderVisible: visible });
  },

  onNativeExpertQuestionInput(event) {
    this.setData({
      nativeExpertQuestion: String(event && event.detail && event.detail.value || "")
    });
  },

  onNativeExpertQuestionFocus() {
    this.setData({ nativeExpertInputFocused: true });
  },

  onNativeExpertQuestionBlur() {
    this.setData({ nativeExpertInputFocused: false });
  },

  toggleNativeExpertVoiceInput() {
    wx.showToast({ title: "语音输入正在开发中", icon: "none" });
  },

  toggleNativeExpertAttachmentMenu() {
    this.setData({
      nativeExpertAttachmentMenuOpen: !this.data.nativeExpertAttachmentMenuOpen
    });
  },

  chooseNativeExpertAttachment(event) {
    const type = String(event && event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset.type || "").trim();
    this.setData({ nativeExpertAttachmentMenuOpen: false });
    wx.showToast({
      title: type ? "嘉宾分身暂不支持附件提问" : "暂不支持附件提问",
      icon: "none"
    });
  },

  submitNativeExpertSuggestedQuestion(event) {
    const question = String(event && event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset.question || "").trim();
    if (!question) return Promise.resolve();
    this.setData({ nativeExpertQuestion: question });
    return this.submitNativeExpertQuestion();
  },

  submitNativeExpertQuestion() {
    if (this.data.nativeExpertSending) return Promise.resolve();
    const question = String(this.data.nativeExpertQuestion || "").trim();
    if (question.length < 2) {
      wx.showToast({ title: "请输入要提问的问题", icon: "none" });
      return Promise.resolve();
    }
    if (!getToken()) {
      this.setData({ nativeExpertAuthed: false });
      this.showLoginGate();
      return Promise.resolve();
    }
    const expert = this.data.nativeExpert || {};
    if (!expert.id) return Promise.resolve();
    const previousMessages = Array.isArray(this.data.nativeExpertMessages)
      ? this.data.nativeExpertMessages
      : [];
    const userMessage = normalizeNativeExpertMessages([
      { id: `user-${Date.now()}`, role: "user", content: question }
    ])[0];
    this.setData({
      nativeExpertSending: true,
      nativeExpertAgentError: "",
      nativeExpertAgentNeedsPro: false,
      nativeExpertQuestion: "",
      nativeExpertInputFocused: false,
      nativeExpertAttachmentMenuOpen: false,
      nativeExpertMessages: [...previousMessages, userMessage]
    });
    return request({
      method: "POST",
      url: `/api/guests/${encodeURIComponent(expert.id)}/agent/chat`,
      data: { question }
    })
      .then((payload) => {
        const assistantMessage = normalizeNativeExpertMessages([
          {
            id: `assistant-${Date.now()}`,
            role: "assistant",
            content: payload && payload.answer,
            citations: payload && payload.citations
          }
        ])[0];
        const agent = this.data.nativeExpertAgent || normalizeNativeExpertAgentProfile({}, expert);
        this.setData({
          nativeExpertSending: false,
          nativeExpertAgent: {
            ...agent,
            suggestedQuestions: Array.isArray(payload && payload.suggestedQuestions)
              ? payload.suggestedQuestions.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 3)
              : agent.suggestedQuestions
          },
          nativeExpertMessages: [...this.data.nativeExpertMessages, assistantMessage]
        });
      })
      .catch((error) => {
        const statusCode = Number(error && error.statusCode);
        this.setData({
          nativeExpertSending: false,
          nativeExpertAuthed: statusCode === 401 ? false : this.data.nativeExpertAuthed,
          nativeExpertAgentNeedsPro: statusCode === 402 || !!(error && error.data && error.data.code === "PRO_REQUIRED"),
          nativeExpertAgentError: (error && error.message) || "嘉宾 AI 分身回答失败",
          nativeExpertMessages: previousMessages
        });
      });
  },

  toggleNativeExpertCitations(event) {
    const index = Number(event && event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset.index);
    if (!Number.isInteger(index) || index < 0) return;
    const messages = (Array.isArray(this.data.nativeExpertMessages) ? this.data.nativeExpertMessages : [])
      .map((message, messageIndex) => messageIndex === index
        ? { ...message, citationsExpanded: !message.citationsExpanded }
        : message);
    this.setData({ nativeExpertMessages: messages });
  },

  openNativeExpertProgram(event) {
    const id = String(event && event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset.id || "").trim();
    if (!id) return;
    wx.navigateTo({
      url: `/pages/webview/index?title=${encodeURIComponent("节目详情")}&url=${encodeURIComponent(`${DEFAULT_WEB_ORIGIN}/programs/${encodeURIComponent(id)}`)}`
    });
  },

  openNativePro() {
    wx.navigateTo({ url: "/pages/pro/index" });
  },

  goReadingList() {
    wx.switchTab({ url: "/pages/reading/index" });
  },

  onNativeBookTagTap(event) {
    const tag = String(event && event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset.tag || "").trim().replace(/^#/, "");
    if (!tag) return;
    const book = this.data.nativeBook || {};
    try {
      wx.setStorageSync(READING_PENDING_FILTER_KEY, {
        source: book.isExternal ? "external" : "native",
        tag
      });
    } catch (_error) {}
    wx.switchTab({ url: "/pages/reading/index" });
  },

  onNativeBookFactTap(event) {
    return this.onNativeBookTagTap(event);
  },

  goMaterialsList() {
    wx.switchTab({ url: "/pages/materials/index" });
  },

  goTopicsList() {
    wx.switchTab({ url: "/pages/topics/index" });
  },

  handleNativeNavRoute(event) {
    const item = (event && event.detail) || {};
    const page = String(item.page || "").trim();
    const path = String(item.path || "").trim();
    const title = String(item.text || "家长先疯").trim();
    if (page) {
      wx.switchTab({ url: page });
      return;
    }
    if (!path) return;
    const src = withNativeWebviewParams(`${DEFAULT_WEB_ORIGIN}${path}`);
    this.setData({
      title,
      src,
      selected: inferSelectedTab(src),
      hideTabbar: shouldHideNativeTabbar(src),
      showXiaowanziClose: false,
      showNativePageNav: false,
      nativeProgramMode: false,
      nativeProgramLoading: false,
      nativeProgramError: "",
      nativeProgram: null,
      nativeBookMode: false,
      nativeBookLoading: false,
      nativeBookError: "",
      nativeBook: null,
      nativeMaterialMode: false,
      nativeMaterialLoading: false,
      nativeMaterialError: "",
      nativeMaterial: null,
      nativeTopicMode: false,
      nativeTopicLoading: false,
      nativeTopicError: "",
      nativeTopic: null,
      nativeExpertMode: false,
      nativeExpertLoading: false,
      nativeExpertError: "",
      nativeExpert: null,
      nativeWorthBuyMode: false,
      nativeWorthBuyLoading: false,
      nativeWorthBuyError: "",
      nativeWorthBuy: null,
      isAudioPlaying: false
    });
  },

  goExpertsList() {
    wx.navigateTo({ url: "/pages/experts/index" });
  },

  goWorthBuyList() {
    this.setData({
      title: "知物",
      src: withNativeWebviewParams(`${DEFAULT_WEB_ORIGIN}/worthbuy`),
      selected: 0,
      showNativePageNav: false,
      nativeWorthBuyMode: false,
      nativeWorthBuyLoading: false,
      nativeWorthBuyError: "",
      nativeWorthBuy: null
    });
  },

  copyNativeMaterialLink() {
    const material = this.data.nativeMaterial || {};
    const url = String(material.fileUrl || "").trim();
    if (!url) {
      wx.showToast({ title: "暂无资料链接", icon: "none" });
      return;
    }
    wx.setClipboardData({
      data: url,
      success() {
        wx.showToast({ title: "链接已复制", icon: "success" });
      },
      fail() {
        wx.showToast({ title: "复制失败", icon: "none" });
      }
    });
  },

  onUnload() {
    if (this.nativePlayerQuickActionsTimer) clearTimeout(this.nativePlayerQuickActionsTimer);
    if (this.guestWishPulseTimer) clearTimeout(this.guestWishPulseTimer);
    if (this.guestWishBubbleTimer) clearTimeout(this.guestWishBubbleTimer);
    this.clearNativeTopicExpandTimer();
    if (this.audioContext) {
      this.audioContext.destroy();
      this.audioContext = null;
    }
  },

  onShareAppMessage() {
    if (this.data.nativeTopicMode) return createNativeTopicShare(this.data).onShareAppMessage();
    return createWebviewShare({
      title: this.data.title,
      src: this.data.src
    }).onShareAppMessage();
  },

  onShareTimeline() {
    if (this.data.nativeTopicMode) return createNativeTopicShare(this.data).onShareTimeline();
    return createWebviewShare({
      title: this.data.title,
      src: this.data.src
    }).onShareTimeline();
  }
});

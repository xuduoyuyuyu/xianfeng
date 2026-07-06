const { DEFAULT_WEB_ORIGIN } = require("../../utils/config");
const { getNativeTopbarMetrics, getNativeWebviewParams } = require("../../utils/nativeChrome");
const { SETTINGS_SECTIONS, createNativeSettingsMethods } = require("../../utils/nativeSettings");
const { request } = require("../../utils/request");
const { getToken, getUser, setSession } = require("../../utils/session");
const { createWebviewShare, enableShareMenu } = require("../../utils/share");
const { TOPIC_DETAIL_WEBVIEW_VERSION, WELFARE_WEBVIEW_VERSION, inferWebPageTitle, webUrl: buildWebUrl } = require("../../utils/webview");

const LOGO_HEIGHT_RPX = 56;

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch (_error) {
    return value;
  }
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

function normalizeImage(value) {
  const source = String(value || "").trim();
  if (!source) return "";
  if (source.indexOf("http://xianfeng.xinzhi.info/") === 0) {
    return `${DEFAULT_WEB_ORIGIN}${source.slice("http://xianfeng.xinzhi.info".length)}`;
  }
  if (/^https?:\/\//.test(source)) return source;
  return `${DEFAULT_WEB_ORIGIN}${source.startsWith("/") ? source : `/${source}`}`;
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

function firstText(values, fallback) {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) return text;
  }
  return fallback;
}

function formatDate(value) {
  const source = String(value || "").trim();
  if (!source) return "未发布";
  const match = source.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return "未发布";
  return `${match[1]}/${Number(match[2])}/${Number(match[3])}`;
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

function normalizeTranscript(value) {
  return Array.isArray(value)
    ? value
      .map((item) => ({
        time: firstText([item && item.time], ""),
        speaker: firstText([item && item.speaker], ""),
        text: firstText([item && item.text], "")
      }))
      .filter((item) => item.text)
      .slice(0, 8)
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

function normalizeProgramDetail(program) {
  const item = program || {};
  const summary = item.summary || {};
  const episode = Array.isArray(item.episodes) ? item.episodes[0] : null;
  const quickView = normalizeQuickView(item.contentPack && item.contentPack.quickView);
  const transcript = normalizeTranscript(item.transcript);
  const guest = item.guest || (Array.isArray(item.guestBindings) && item.guestBindings[0] && item.guestBindings[0].guest) || {};
  const tags = normalizeTags(summary.tags);
  const title = firstText([item.title], "节目详情");
  const summaryBody = firstText([
    summary.body,
    item.description,
    item.contentPack && item.contentPack.minutes && item.contentPack.minutes.text
  ], "本期节目围绕家庭教育与成长展开讨论。");

  return {
    id: firstText([item._id, item.programCode, title], title),
    title,
    description: firstText([item.description, summary.headline], summaryBody),
    coverImage: normalizeImage(item.coverImage),
    date: formatDate(firstText([item.publishedAt, item.createdAt], "")),
    duration: firstText([episode && episode.duration], "45 分钟"),
    audioUrl: firstText([episode && episode.url], ""),
    summaryHeadline: firstText([summary.headline, title], title),
    summaryBody,
    summaryHighlightLabel: firstText([summary.highlightLabel], ""),
    summaryHighlightText: firstText([summary.highlightText], ""),
    tags,
    quickView,
    transcript,
    hasQuickView: quickView.length > 0,
    hasTranscript: transcript.length > 0,
    guestName: firstText([guest.name], "节目特邀嘉宾"),
    guestTitle: firstText([guest.title], "教育与成长观察者"),
    guestBio: firstText([guest.bio], "围绕家庭关系、成长节奏与学习环境，提炼节目中的关键视角。"),
    guestAvatar: normalizeImage(guest.avatar),
    contentModes: [
      quickView.length ? { key: "quickview", label: "速览" } : null,
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

function splitBookIntro(value) {
  const source = String(value || "").replace(/\r\n/g, "\n").trim();
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

function pushBookTag(tags, value) {
  const text = String(value || "").trim();
  if (text && tags.indexOf(text) < 0 && tags.length < 4) tags.push(text);
}

function splitTokens(value) {
  return String(value || "")
    .split(/[|｜,，;；\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
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
          summary: firstText([node && node.summary], "")
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
        summary: firstText([node && node.summary], "")
      })).filter((node) => node.title)
      : []
  })).filter((branch) => branch.children.length);
}

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
  ], "围绕这个教育问题，系统梳理关键概念、常见误区和可执行方法。");
  const nodeCount = tree.reduce((sum, branch) => sum + branch.children.length, 0);

  return {
    id: firstText([topic._id, topic.id, topic.slug], "topic"),
    slug: firstText([topic.slug, topic._id, topic.id], ""),
    title: firstText([topic.title], "请教一下"),
    subtitle: firstText([topic.subtitle], ""),
    coverEmoji: firstText([topic.coverEmoji], "🙏"),
    summary,
    tags,
    tree,
    relatedTopics: normalizeRelatedTopics(data.relatedTopics),
    branchCount: tree.length,
    nodeCount
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
    }).filter((item) => item.id || item.title).slice(0, 4)
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

  return {
    id: firstText([item._id, item.id, name], name),
    name,
    title: firstText([item.title], "教育观察者"),
    bio: firstText([item.bio, item.description], "持续关注家庭教育、儿童成长和学习关系中的真实问题。"),
    avatar: normalizeImage(item.avatar) || `${DEFAULT_WEB_ORIGIN}/assets/wel-avatar/no-hat.png`,
    profileUrl: firstText([item.profileUrl], ""),
    contentTags,
    programCount,
    referenceCount,
    agentLabel: item.agentEnabled === true ? "可提问" : "已收录",
    relatedPrograms,
    publications,
    profileReferences,
    socialProfiles,
    listenerBenefits,
    hasRelatedPrograms: relatedPrograms.length > 0,
    hasPublications: publications.length > 0,
    hasReferences: profileReferences.length > 0,
    hasSocialProfiles: socialProfiles.length > 0,
    hasListenerBenefits: listenerBenefits.length > 0
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
  const title = firstText([meta.title, item.title], "图书详情");
  const author = firstText([meta.author, item.author], "作者未标注");
  const publisher = firstText([meta.publisher, item.publisher], "");
  const coverImage = normalizeBookImage(firstText([meta.cover, item.metadataCover, item.coverImage], ""));
  const intro = firstText([
    meta.description,
    item.description,
    item.contentIntro,
    item.sourceName ? `来自《${item.sourceName}》的推荐书目。` : ""
  ], "暂无简介");
  const ratingText = firstText([meta.ratingLabel, formatBookRating(meta.rating)], "");
  const ratingCount = meta.ratingCount ? `${meta.ratingCount} 人评价` : "";
  const sourceName = firstText([item.sourceName], "");
  const recommendedGuest = firstText([item.recommendedGuest], "");
  const sourceLine = sourceName ? `来自《${sourceName}》` : recommendedGuest ? `${recommendedGuest}推荐` : "";
  const tags = [];
  pushBookTag(tags, item.grade);
  pushBookTag(tags, item.categoryLabel);
  pushBookTag(tags, item.topic);
  pushBookTag(tags, recommendedGuest);

  return {
    id: firstText([item._id, meta.bookId, title], title),
    title,
    author,
    publisher,
    isbn: firstText([meta.isbn, item.isbn], ""),
    coverImage,
    hasCover: !!coverImage,
    publishedDate: firstText([item.publishedDate], ""),
    ratingText,
    ratingCount,
    hasRating: !!(ratingText || ratingCount),
    sourceLine,
    sourceName,
    recommendedGuest,
    grade: firstText([item.grade], ""),
    topic: firstText([item.topic], ""),
    introParagraphs: splitBookIntro(intro),
    tags
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
    activeContentMode: "quickview",
    isAudioPlaying: false,
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
    const webviewLoginRequired = options.login === "1" && !getToken();
    const hideTabbar = shouldHideNativeTabbar(src);
    const showXiaowanziClose = isXiaowanziSuperWebview(src);
    const displayTitle = showXiaowanziClose ? "" : title;
    if (wx.setNavigationBarTitle) wx.setNavigationBarTitle({ title: displayTitle });
    const materialId = extractMaterialId(src);
    const expertId = extractExpertId(src);
    const worthBuyQuery = extractWorthBuyQuery(src);
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
        nativeWorthBuyMode: false,
        nativeWorthBuyLoading: false,
        nativeWorthBuyError: "",
        nativeWorthBuy: null,
        isAudioPlaying: false,
        hideTabbar: false
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

  loginWithPhone(event) {
    if (this.data.bindingPhone) return;
    const phoneCode = String(event && event.detail && event.detail.code || "");
    if (!phoneCode) {
      this.setData({ profilePanelMessage: "需要授权手机号后登录" });
      wx.showToast({ title: "需要授权手机号后登录", icon: "none" });
      return;
    }
    this.setData({ bindingPhone: true, profilePanelMessage: "" });
    wx.login({
      success: ({ code }) => {
        if (!code) {
          this.setData({ bindingPhone: false, profilePanelMessage: "微信登录失败，请重试" });
          wx.showToast({ title: "微信登录失败，请重试", icon: "none" });
          return;
        }
        request({
          method: "POST",
          url: "/api/wechat-mini/login",
          data: { code, phoneCode }
        })
          .then((payload) => {
            setSession(payload);
            const app = typeof getApp === "function" ? getApp() : null;
            if (app) {
              if (typeof app.setLoginSession === "function") {
                app.setLoginSession(payload);
              } else {
                app.globalData = app.globalData || {};
                app.globalData.token = getToken();
                app.globalData.user = getUser();
              }
            }
            const currentSrc = String(this.data.src || "").trim();
            const nextSrc = currentSrc
              ? buildWebUrl(currentSrc, { preserveXiaowanziLayer: isXiaowanziLayerWebview(currentSrc) ? "1" : "" })
              : "";
            this.setData({
              src: nextSrc || currentSrc,
              webviewLoginRequired: false,
              bindingPhone: false,
              profilePanelMessage: "登录成功"
            });
          })
          .catch((error) => {
            this.setData({ bindingPhone: false, profilePanelMessage: error.message || "登录失败" });
            wx.showToast({ title: error.message || "登录失败", icon: "none" });
          });
      },
      fail: () => {
        this.setData({ bindingPhone: false, profilePanelMessage: "无法调用微信登录" });
        wx.showToast({ title: "无法调用微信登录", icon: "none" });
      }
    });
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

  loadNativeExpert(expertId) {
    const encodedId = encodeURIComponent(expertId);
    return request({ url: `/api/guests/${encodedId}` })
      .then((response) => {
        const nativeExpert = normalizeExpertDetail(response && (response.guest || response.data || response));
        this.setData({
          title: nativeExpert.name,
          nativeExpert,
          nativeExpertLoading: false,
          nativeExpertError: ""
        });
      })
      .catch((error) => {
        this.setData({
          nativeExpertLoading: false,
          nativeExpertError: (error && error.message) || "智库详情加载失败，请稍后重试"
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

  setContentMode(event) {
    const mode = String(event && event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset.mode || "");
    if (!mode) return;
    this.setData({ activeContentMode: mode });
  },

  toggleNativeAudio() {
    const program = this.data.nativeProgram || {};
    if (!program.audioUrl) {
      wx.showToast({ title: "暂无音频", icon: "none" });
      return;
    }
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
    this.audioContext.play();
  },

  goProgramList() {
    wx.switchTab({ url: "/pages/programs/index" });
  },

  goReadingList() {
    wx.switchTab({ url: "/pages/reading/index" });
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
    this.setData({
      title: "先疯智库",
      src: withNativeWebviewParams(`${DEFAULT_WEB_ORIGIN}/experts`),
      selected: 0,
      showNativePageNav: false,
      nativeExpertMode: false,
      nativeExpertLoading: false,
      nativeExpertError: "",
      nativeExpert: null
    });
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
    if (this.audioContext) {
      this.audioContext.destroy();
      this.audioContext = null;
    }
  },

  onShareAppMessage() {
    return createWebviewShare({
      title: this.data.title,
      src: this.data.src
    }).onShareAppMessage();
  },

  onShareTimeline() {
    return createWebviewShare({
      title: this.data.title,
      src: this.data.src
    }).onShareTimeline();
  }
});

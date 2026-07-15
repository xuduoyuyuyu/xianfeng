const { DEFAULT_WEB_ORIGIN } = require("../../utils/config");
const { request } = require("../../utils/request");
const { getNativeTopbarMetrics } = require("../../utils/nativeChrome");
const { createPageShare, enableShareMenu } = require("../../utils/share");

const EXPERTS_PAGE_SIZE = 10;
const GUEST_FALLBACK_AVATAR = "/assets/wel-avatar/no-hat.png";

function firstText(values, fallback = "") {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) return text;
  }
  return fallback;
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

function isGuestFallbackAvatar(value) {
  const source = String(value || "").trim();
  if (!source) return true;
  return source.indexOf("no-hat") >= 0 || source.indexOf("wel-avatar") >= 0;
}

function safeTags(values, limit = 3) {
  const source = Array.isArray(values) ? values : [];
  const seen = new Set();
  const tags = [];
  for (const value of source) {
    const tag = String(value || "").trim().replace(/^#/, "");
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    tags.push(tag);
    if (tags.length >= limit) break;
  }
  return tags;
}

function buildGuestSuggestedQuestions(guest) {
  const name = firstText([guest && guest.name], "这位嘉宾");
  const keyword = firstText([
    Array.isArray(guest && guest.contentTags) ? guest.contentTags.find((tag) => String(tag || "").trim()) : "",
    guest && guest.referenceCount ? "公开内容" : "",
    guest && guest.programCount ? "参与节目" : ""
  ], "家庭教育");
  return [
    `${name}的核心观点是什么？`,
    `关于${keyword}，${name}有哪些具体建议？`,
    "如果我想马上行动，可以先做哪三件事？"
  ];
}

function normalizeGuest(guest) {
  const item = guest || {};
  const id = String(item._id || item.id || "").trim();
  const avatarFallback = isGuestFallbackAvatar(item.avatar);
  return {
    id,
    name: firstText([item.name], "未命名嘉宾"),
    title: firstText([item.title], "嘉宾"),
    bio: firstText([item.bio], "基于嘉宾档案、节目内容和公开资料，整理可追溯的观点与方法。"),
    avatar: avatarFallback ? GUEST_FALLBACK_AVATAR : normalizeImage(item.avatar),
    avatarMode: avatarFallback ? "aspectFit" : "aspectFill",
    avatarFallback,
    programCount: Number(item.programCount || 0),
    socialCount: Number(item.socialCount || 0) || (Array.isArray(item.socialProfiles) ? item.socialProfiles.length : 0),
    authoredBookCount: Number(item.authoredBookCount || 0),
    bookListCount: Number(item.bookListCount || 0),
    referenceCount: Number(item.referenceCount || 0),
    contentTags: safeTags(item.contentTags, 3),
    agentEnabled: item.agentEnabled === true,
    suggestedQuestions: buildGuestSuggestedQuestions(item),
    showQuestionCard: false,
    activeQuestion: ""
  };
}

function normalizeGuests(response) {
  const data = response || {};
  const rawItems = Array.isArray(data.guests)
    ? data.guests
    : Array.isArray(data.data)
      ? data.data
      : [];
  return rawItems.map(normalizeGuest).filter((item) => item.id);
}

function mergeById(previous, next) {
  const seen = new Set();
  const merged = [];
  for (const item of (Array.isArray(previous) ? previous : []).concat(Array.isArray(next) ? next : [])) {
    const id = String(item && item.id || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    merged.push(item);
  }
  return merged;
}

function decorateGuests(guests, questionIndex) {
  const source = Array.isArray(guests) ? guests : [];
  const firstAgentGuestId = (source.find((guest) => guest.agentEnabled === true) || {}).id || "";
  return source.map((guest) => {
    const showQuestionCard = guest.agentEnabled === true && guest.id === firstAgentGuestId;
    const questions = Array.isArray(guest.suggestedQuestions) ? guest.suggestedQuestions : [];
    return {
      ...guest,
      showQuestionCard,
      activeQuestion: showQuestionCard && questions.length ? questions[questionIndex % questions.length] : ""
    };
  });
}

function buildGuestsUrl(page, search, tag) {
  let url = `/api/guests?page=${page}&pageSize=${EXPERTS_PAGE_SIZE}`;
  const q = String(search || "").trim();
  const filterTag = String(tag || "").trim();
  if (q) url += `&search=${encodeURIComponent(q)}`;
  if (filterTag) url += `&tag=${encodeURIComponent(filterTag)}`;
  return url;
}

Page({
  data: {
    chromeHeight: 88,
    topbarHeight: 88,
    fromXiaowanzi: false,
    search: "",
    activeTag: "",
    filterTags: [],
    guests: [],
    loading: true,
    loadingMore: false,
    error: "",
    page: 1,
    totalPages: 1,
    hasMore: false,
    questionIndex: 0
  },

  onLoad(options) {
    enableShareMenu();
    this.syncTopbarMetrics();
    this.setData({
      fromXiaowanzi: String(options && options.from || "") === "xiaowanzi"
    });
    this.startQuestionRotation();
    return this.loadGuests({ page: 1, reset: true });
  },

  onShow() {
    if (wx.setNavigationBarTitle) wx.setNavigationBarTitle({ title: "先疯智库" });
  },

  onUnload() {
    if (this.questionTimer) clearInterval(this.questionTimer);
    if (this.searchTimer) clearTimeout(this.searchTimer);
  },

  onShareAppMessage: createPageShare({
    title: "先疯智库",
    path: "/pages/experts/index"
  }),

  onShareTimeline: createPageShare({
    title: "先疯智库",
    path: "/pages/experts/index"
  }).onShareAppMessage,

  syncTopbarMetrics() {
    const metrics = getNativeTopbarMetrics();
    this.setData({
      topbarHeight: metrics.topbarHeight,
      chromeHeight: metrics.topbarHeight
    });
  },

  startQuestionRotation() {
    if (this.questionTimer) clearInterval(this.questionTimer);
    this.questionTimer = setInterval(() => {
      const questionIndex = (Number(this.data.questionIndex || 0) + 1) % 9999;
      this.setData({
        questionIndex,
        guests: decorateGuests(this.data.guests, questionIndex)
      });
    }, 3200);
  },

  loadGuests(options = {}) {
    const page = Number(options.page || 1);
    const reset = options.reset !== false;
    const search = this.data.search;
    const activeTag = this.data.activeTag;
    const url = buildGuestsUrl(page, search, activeTag);
    this.setData({
      loading: reset,
      loadingMore: !reset,
      error: reset ? "" : this.data.error
    });
    return request({ url })
      .then((response) => {
        const nextGuests = normalizeGuests(response);
        const mergedGuests = reset ? nextGuests : mergeById(this.data.guests, nextGuests);
        const filterTags = Array.isArray(response && response.filterTags)
          ? response.filterTags.map((tag) => String(tag || "").trim()).filter(Boolean)
          : this.data.filterTags;
        const totalPages = Math.max(1, Number(response && response.totalPages) || 1);
        this.setData({
          guests: decorateGuests(mergedGuests, this.data.questionIndex),
          filterTags,
          page,
          totalPages,
          hasMore: page < totalPages,
          loading: false,
          loadingMore: false,
          error: ""
        });
      })
      .catch((error) => {
        this.setData({
          loading: false,
          loadingMore: false,
          error: (error && error.message) || "加载先疯智库失败"
        });
      });
  },

  onSearchInput(event) {
    const search = String(event && event.detail && event.detail.value || "");
    this.setData({ search });
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.loadGuests({ page: 1, reset: true });
    }, 220);
  },

  clearSearch() {
    if (!this.data.search) return;
    this.setData({ search: "" });
    return this.loadGuests({ page: 1, reset: true });
  },

  onTagTap(event) {
    const tag = String(event && event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset.tag || "").trim();
    this.setData({ activeTag: tag === this.data.activeTag ? "" : tag });
    return this.loadGuests({ page: 1, reset: true });
  },

  resetTag() {
    if (!this.data.activeTag) return;
    this.setData({ activeTag: "" });
    return this.loadGuests({ page: 1, reset: true });
  },

  onReachBottom() {
    if (this.data.loading || this.data.loadingMore || !this.data.hasMore) return;
    return this.loadGuests({ page: this.data.page + 1, reset: false });
  },

  retryLoad() {
    return this.loadGuests({ page: 1, reset: true });
  },

  openExpert(event) {
    const index = Number(event && event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset.index);
    const guest = this.data.guests[index];
    if (!guest || !guest.id) return;
    wx.navigateTo({
      url: `/pages/webview/index?title=${encodeURIComponent("智库详情")}&url=${encodeURIComponent(`${DEFAULT_WEB_ORIGIN}/experts/${encodeURIComponent(guest.id)}`)}`
    });
  },

  useGuestAvatarFallback(event) {
    const index = Number(event && event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset.index);
    const guests = Array.isArray(this.data.guests) ? this.data.guests.slice() : [];
    if (!Number.isInteger(index) || index < 0 || !guests[index]) return;
    guests[index] = {
      ...guests[index],
      avatar: GUEST_FALLBACK_AVATAR,
      avatarMode: "aspectFit",
      avatarFallback: true
    };
    this.setData({ guests });
  },

  goBack() {
    if (wx.navigateBack) {
      wx.navigateBack({ delta: 1 });
    }
  }
});

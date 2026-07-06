const DEFAULT_SEARCH_PROMPTS = [
  "中考作文",
  "亲子关系",
  "教育焦虑",
  "小学写作",
  "阅读指南",
  "家庭教育",
  "高考志愿",
  "儿童视角"
];

const SEARCH_PROMPT_INTERVAL_MS = 2800;

function getInitialSearchPrompt() {
  return DEFAULT_SEARCH_PROMPTS[0];
}

function getNextSearchPrompt(current) {
  const currentIndex = DEFAULT_SEARCH_PROMPTS.indexOf(String(current || "").trim());
  const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % DEFAULT_SEARCH_PROMPTS.length : 0;
  return DEFAULT_SEARCH_PROMPTS[nextIndex];
}

function stopSearchPromptRotation(page) {
  if (!page || !page.searchPromptTimer) return;
  clearInterval(page.searchPromptTimer);
  page.searchPromptTimer = null;
}

function startSearchPromptRotation(page) {
  if (!page || typeof page.setData !== "function") return;
  stopSearchPromptRotation(page);
  page.searchPromptTimer = setInterval(() => {
    page.setData({ searchPrompt: getNextSearchPrompt(page.data && page.data.searchPrompt) });
  }, SEARCH_PROMPT_INTERVAL_MS);
  if (page.searchPromptTimer && typeof page.searchPromptTimer.unref === "function") {
    page.searchPromptTimer.unref();
  }
}

module.exports = {
  DEFAULT_SEARCH_PROMPTS,
  getInitialSearchPrompt,
  startSearchPromptRotation,
  stopSearchPromptRotation
};

export const XIAOWANZI_AVATARS = [
  "/assets/wel-avatar/optimized/no-hat.webp",
  "/assets/wel-avatar/optimized/IMG_0640.webp",
  "/assets/wel-avatar/optimized/小玩子-巫师.webp",
  "/assets/wel-avatar/optimized/image_20260319153410_b887983024608ab90c0da59061374081.webp",
  "/assets/wel-avatar/optimized/image_20260319153421_e614f88a4edf43cc2860c5df6d066877.webp",
  "/assets/wel-avatar/optimized/image_20260320082808_ff0c0d1c25422e4dbdc000e4caee5634.webp",
  "/assets/wel-avatar/optimized/image_20260320082829_e686bfb5b113ab8244756a0abf68bd80.webp",
  "/assets/wel-avatar/optimized/image_20260320082902_a1994868c0566a4334bb2d677cc8b715.webp",
  "/assets/wel-avatar/optimized/image_20260320082917_b46b50e457169796d937557c1d3986a9.webp",
  "/assets/wel-avatar/optimized/image_20260320083958_3b451452b1e48a9f004fe6d752f56730.webp",
  "/assets/wel-avatar/optimized/image_20260320091309_3a25356faa55e01bee83ca8729af9e4e.webp",
  "/assets/wel-avatar/optimized/image_20260320091826_97cbbdadb598fa6110f53acf058f8927.webp",
  "/assets/wel-avatar/optimized/image_20260320091829_0e6348609a981cdeb2e2db355a1ae602.webp",
  "/assets/wel-avatar/optimized/image_20260320103520_4713665d1090084b4c7ac5d44c6a325f.webp",
  "/assets/wel-avatar/optimized/image_20260326194617_0e741ab7740b6d95a9775570b91d1e53.webp",
  "/assets/wel-avatar/optimized/image_20260326194629_f48d3b2a6334555e9d0d0c280e0d28fc.webp",
  "/assets/wel-avatar/optimized/image_20260326195256_8d9a36411c02e77558dfc85050cfbeae.webp",
  "/assets/wel-avatar/optimized/image_20260326195304_cb4661cb9ed8a1a486ea1fe389fa2b04.webp",
  "/assets/wel-avatar/optimized/image_20260326195307_30e9a34ba02cab4d019697018e844038.webp",
  "/assets/wel-avatar/optimized/image_20260326200218_0b7cef10e5f487c19578d533a5c75c43.webp",
  "/assets/wel-avatar/optimized/image_20260326200731_97b6e2af5eef15dc941f60dd2de266d7.webp",
  "/assets/wel-avatar/optimized/image_20260327000818_79c1cacdc9ceb0cf646a139d3f1045b9.webp",
] as const;

export const FAB_SIZE = 48;
export const FAB_MARGIN = 28;
const FAB_BOUNDS_PADDING = 12;
const AVATAR_SWITCH_CLICKS = 5;

export type FabPosition = { left: number; top: number };
export type AvatarState = { avatarIndex: number; clickCount: number };
export type XiaowanziPromptPayloadInput = {
  profileSummary: string;
  memorySummary?: string;
  pageSummary?: string;
  userContent: string;
};
export type XiaowanziChildProfileSummaryInput = {
  displayName?: string;
  relation?: string;
  birthDate?: string;
  grade?: string;
  concernTags?: string[];
};
export type XiaowanziChildProfileSummaryOptions = {
  now?: Date;
};
export type XiaowanziSuperModeAuthInput = {
  token?: string | null;
  welToken?: string | null;
};

export const AI_RESPONSE_RULES = [
  "你是小玩子,一个可爱活泼的助手,风格软萌、热情、会撒娇。你的性格关键词:好奇心旺盛、话多但不啰嗦、偶尔打岔但很可爱、喜欢用 emoji 和网络用语。",
  "回答开头可以用'好嘞~''来咯!''哎呀这个我熟!'等拟声词。结尾偶尔用'嘿嘿''懂的都懂~'。",
  "优先使用[站内相关内容]、孩子档案、孩子记忆和当前页面上下文回答；当前页面只是线索，不是唯一资料来源。",
  "当站内相关内容不足时，可以使用你自身的通用育儿、学习和沟通知识给出可执行建议，但要说明这是通用建议而非站内资料结论。",
  "不要因为当前页面没有展示某段内容就拒绝回答；可以先给通用开口、步骤、话术或下一步搜索建议。",
  "涉及具体节目、嘉宾事实或资料出处时，优先引用已提供的站内内容；没有站内依据时不要编造具体来源。",
  "孩子档案里的「关系」只表示孩子称谓,不代表提问者是爸爸或妈妈。除非个人资料明确提供家长身份,否则统一称呼用户为「你」或「家长」,不要说妈妈、爸爸。",
  "孩子档案如提供「准确年龄」,必须以该年龄为准,不要根据出生年份自行猜测或改写年龄。",
  "优先给出确定内容、已确认事实、可执行下一步。",
  "语气要软萌、亲切、简洁,像朋友聊天一样自然。",
].join("\n");

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function getDefaultFabPosition(viewportWidth: number, viewportHeight: number): FabPosition {
  return {
    left: Math.max(FAB_MARGIN, viewportWidth - FAB_SIZE - FAB_MARGIN),
    top: Math.max(FAB_MARGIN, viewportHeight - FAB_SIZE - FAB_MARGIN),
  };
}

export function clampFabPosition(position: FabPosition, viewportWidth: number, viewportHeight: number): FabPosition {
  return {
    left: clamp(position.left, FAB_BOUNDS_PADDING, Math.max(FAB_BOUNDS_PADDING, viewportWidth - FAB_SIZE - FAB_BOUNDS_PADDING)),
    top: clamp(position.top, FAB_BOUNDS_PADDING, Math.max(FAB_BOUNDS_PADDING, viewportHeight - FAB_SIZE - FAB_BOUNDS_PADDING)),
  };
}

export function getAvatarSrc(index: number) {
  return XIAOWANZI_AVATARS[index] || XIAOWANZI_AVATARS[0];
}

export function advanceAvatarState(state: AvatarState): AvatarState {
  const nextClickCount = state.clickCount + 1;
  if (nextClickCount < AVATAR_SWITCH_CLICKS) {
    return { avatarIndex: state.avatarIndex, clickCount: nextClickCount };
  }
  return {
    avatarIndex: (state.avatarIndex + 1) % XIAOWANZI_AVATARS.length,
    clickCount: 0,
  };
}

function parseLocalDate(value?: string): Date | null {
  const match = String(value || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatChildAgeFromBirthDate(birthDate?: string, options: XiaowanziChildProfileSummaryOptions = {}): string {
  const date = parseLocalDate(birthDate);
  if (!date) return "";
  const now = options.now || new Date();
  let years = now.getFullYear() - date.getFullYear();
  let months = now.getMonth() - date.getMonth();
  if (now.getDate() < date.getDate()) months -= 1;
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  if (years < 0) return "";
  if (years === 0) return months > 0 ? `${months}个月` : "未满1个月";
  return months > 0 ? `${years}岁${months}个月` : `${years}岁`;
}

export function buildChildProfileSummary(
  profile: XiaowanziChildProfileSummaryInput,
  options: XiaowanziChildProfileSummaryOptions = {},
): string {
  const currentDate = formatLocalDate(options.now || new Date());
  const exactAge = formatChildAgeFromBirthDate(profile.birthDate, options);
  return [
    `咨询人:${String(profile.displayName || "孩子").trim() || "孩子"}`,
    profile.relation ? `关系:${String(profile.relation).trim()}` : "",
    profile.birthDate ? `出生日期:${String(profile.birthDate).trim()}` : "",
    `当前日期:${currentDate}`,
    exactAge ? `准确年龄:${exactAge}（按出生日期和当前日期计算,请以该准确年龄为准）` : "",
    profile.grade ? `年级:${String(profile.grade).trim()}` : "",
    `关注标签:${Array.isArray(profile.concernTags) && profile.concernTags.length ? profile.concernTags.join("、") : "无"}`,
  ].filter(Boolean).join("。");
}

export function buildXiaowanziPromptPayload(input: XiaowanziPromptPayloadInput): string {
  const profileSummary = String(input.profileSummary || "").trim();
  const memorySummary = String(input.memorySummary || "").trim();
  const pageSummary = String(input.pageSummary || "").trim();
  const userContent = String(input.userContent || "").trim();
  const profileBlock = memorySummary
    ? `[孩子档案]\n${profileSummary}\n\n[孩子记忆]\n${memorySummary}`
    : `[孩子档案]\n${profileSummary}`;

  return pageSummary
    ? `[回答规则]\n${AI_RESPONSE_RULES}\n\n${profileBlock}\n\n[当前页面上下文]\n${pageSummary}\n\n[用户问题]\n${userContent}`
    : `[回答规则]\n${AI_RESPONSE_RULES}\n\n${profileBlock}\n\n[用户问题]\n${userContent}`;
}

export function shouldPersistChildMemory(input: { childId?: string | null; enabled?: boolean }): boolean {
  return Boolean(String(input.childId || "").trim()) && input.enabled !== false;
}

export function canEnterXiaowanziSuperMode(input: XiaowanziSuperModeAuthInput): boolean {
  return Boolean(String(input.token || "").trim() || String(input.welToken || "").trim());
}

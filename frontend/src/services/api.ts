import axios, { AxiosInstance, AxiosError } from 'axios';
import { showProUpgradeFromPayload } from '../utils/proGate';

// In production the Nginx gateway proxies `/api` on the same origin.
// Falling back to a relative path keeps deployed domains working even when
// no explicit VITE_API_URL is injected at build time.
const API_BASE_URL = (import.meta.env.VITE_API_URL || '').trim();

// 创建 axios 实例
const api: AxiosInstance = axios.create({
  baseURL: `${API_BASE_URL}/api`,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 请求拦截器 - 添加 token
api.interceptors.request.use(
  (config) => {
    // 后台接口才优先使用 admin_token；普通页面必须使用当前用户 token。
    const requestPath = String(config.url || "");
    const isAdminRequest = requestPath.startsWith("/admin") || window.location.pathname.startsWith("/admin");
    const adminToken = localStorage.getItem('admin_token');
    const userToken = localStorage.getItem('token');
    const token = isAdminRequest ? (adminToken || userToken) : (userToken || adminToken);
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
      (config as any).xfAuthSource = token === adminToken ? 'admin' : 'user';
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// 响应拦截器 - 处理 401 错误
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      const authSource = (error.config as any)?.xfAuthSource;
      const isAdminRoute = window.location.pathname.startsWith('/admin');
      if (authSource === 'admin') {
        localStorage.removeItem('admin_token');
        localStorage.removeItem('admin_user');
      }
      if (authSource === 'user') {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.removeItem('wel_tok');
      }
      if (isAdminRoute) {
        window.location.href = '/admin/login';
      } else {
        // 非 admin 路径：弹窗引导登录，不跳页面
        document.dispatchEvent(new CustomEvent('xf-show-login-modal', {
          detail: {
            title: '登录态已过期',
            description: '请重新登录后继续操作，登录后可解锁完整功能。',
          },
        }));
      }
    }
    if (error.response?.status === 402) {
      showProUpgradeFromPayload(error.response.data);
    }
    return Promise.reject(error);
  }
);

// 类型定义
export interface Episode {
  title: string;
  duration: string;
  url: string;
}

export interface ProgramSummary {
  headline: string;
  body: string;
  highlightLabel: string;
  highlightText: string;
  tags: string[];
}

export interface TranscriptSegment {
  time: string;
  speaker: string;
  text: string;
  featured?: boolean;
}

export interface ProgramGuest {
  name: string;
  title: string;
  bio: string;
  avatar: string;
  profileUrl?: string;
}

export interface Guest {
  _id: string;
  name: string;
  normalizedName: string;
  title: string;
  bio: string;
  avatar: string;
  profileUrl?: string;
  profileMarkdown?: string;
  profileReferences?: Array<{ title?: string; url: string; note?: string }>;
  socialProfiles?: GuestSocialProfile[];
  publications?: GuestPublication[];
  listenerBenefits?: ListenerBenefit[];
  agentEnabled?: boolean;
  profileAvatarCandidates?: Array<{ url: string; label?: string; sourceUrl?: string }>;
  profileGeneratedAt?: string | null;
  status: "active" | "inactive";
  programCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface GuestSocialProfile {
  platform: string;
  label: string;
  url: string;
  note?: string;
  order?: number;
  status?: "active" | "inactive";
}

export interface GuestPublication {
  type: "paper" | "book" | "interview" | "media" | "other";
  title: string;
  url: string;
  source?: string;
  publishedAt?: string;
  summary?: string;
  note?: string;
  order?: number;
  status?: "active" | "inactive";
}

export interface ListenerBenefit {
  title: string;
  description?: string;
  url?: string;
  image?: string;
  note?: string;
  order?: number;
  status?: "active" | "inactive";
}

export interface PublicGuest {
  _id: string;
  name: string;
  title: string;
  bio: string;
  avatar: string;
  profileUrl?: string;
  profileReferences?: Array<{ title?: string; url: string; note?: string }>;
  socialProfiles?: GuestSocialProfile[];
  publications?: GuestPublication[];
  listenerBenefits?: ListenerBenefit[];
  agentEnabled?: boolean;
  programCount?: number;
  contentTags?: string[];
  referenceCount?: number;
  agentStats?: {
    chunkCount: number;
    sourceCounts: Record<string, number>;
  };
}

export interface PublicGuestDetail extends PublicGuest {
  listenerBenefits?: ListenerBenefit[];
  relatedPrograms: Array<{
    _id: string;
    programCode?: string;
    title: string;
    coverImage?: string;
    publishedAt?: string | null;
    summary?: string;
  }>;
}

export interface GuestAgentCitation {
  chunkId: string;
  sourceType: "guest_profile" | "program_summary" | "program_transcript" | "program_quickview" | "program_shownotes" | "program_deepdive" | "public_material";
  sourceId: string;
  sourceTitle: string;
  locator: string;
  text: string;
  url?: string;
}

export interface GuestAgentProfile {
  agent: {
    guestId: string;
    name: string;
    title: string;
    avatar: string;
    bio: string;
    chunkCount: number;
    programCount: number;
    sourceCounts: Record<string, number>;
    suggestedQuestions: string[];
    privacyNote: string;
    syncStatus?: string;
  };
  recentConversation?: {
    _id: string;
    updatedAt?: string;
    messageCount: number;
  } | null;
}

export interface GuestAgentMessage {
  role: "user" | "assistant";
  content: string;
  citations?: GuestAgentCitation[];
  model?: string;
  provider?: string;
  createdAt?: string;
}

export interface GuestAgentHistory {
  conversationId: string;
  messages: GuestAgentMessage[];
  updatedAt?: string | null;
}

export interface GuestAgentChatResponse {
  conversationId: string;
  answer: string;
  citations: GuestAgentCitation[];
  suggestedQuestions: string[];
  retrievalProvider?: "weknora" | "local";
  syncStatus?: string;
}

export interface GuestBoundProgram {
  _id: string;
  title: string;
  programCode?: string;
  status: "draft" | "published" | "group-only";
  updatedAt?: string | null;
}

export interface ProgramGuestBinding {
  guestId: string;
  order: number;
  role: string;
  guest?: Guest | null;
}

export interface ProgramTermGlossaryItem {
  term: string;
  definition: string;
  sourceUrl?: string;
  aliases?: string[];
}

export interface EducationDictionaryEntry {
  _id: string;
  term: string;
  normalizedTerm: string;
  definition: string;
  sourceUrl?: string;
  aliases: string[];
  relatedEntryIds: string[];
  programIds: string[];
  createdFrom: "ai_program" | "migration";
  status: "active" | "hidden";
  createdAt?: string;
  updatedAt?: string;
}

export interface AdminEducationDictionaryEntry extends EducationDictionaryEntry {
  programCount?: number;
  relatedEntries?: Array<{
    _id: string;
    term: string;
    status: "active" | "hidden";
  }>;
}

export interface DictionaryRelatedProgram {
  _id: string;
  title: string;
  status: "draft" | "published" | "group-only";
  coverImage?: string;
  publishedAt?: string | null;
  updatedAt?: string | null;
}

export interface CuratedReadingItem {
  title: string;
  subtitle?: string;
  url?: string;
}

export interface MindMapNode {
  title: string;
  summary: string;
  emoji?: string;
  source?: { type: string; time?: string; term?: string };
  children?: MindMapNode[];
}

export interface StructureNode {
  title: string;
  summary?: string;
  emoji?: string;
  source?: { type: string; time?: string; term?: string };
  children?: StructureNode[];
}

export interface ProgramStructure {
  root?: StructureNode;
  layers?: Record<string, StructureNode>;
}

export interface MindMapData {
  root: MindMapNode;
  generatedAt?: string;
}

export interface ProgramDeepDive {
  sectionTitle?: string;
  curatedReading?: CuratedReadingItem[];
  mindMap?: MindMapData;
}

export interface CuratedReadingVerificationItem {
  title?: string;
  subtitle?: string;
  url?: string;
  finalUrl?: string;
  landingTitle?: string;
  landingDescription?: string;
  landingSite?: string;
  landingContributors?: string[];
  titleMatched?: boolean;
  contributorMatched?: boolean;
  passed?: boolean;
  issues?: string[];
}

export interface CuratedReadingVerificationReport {
  checkedAt?: string | null;
  total?: number;
  passedCount?: number;
  failedCount?: number;
  summary?: string;
  items?: CuratedReadingVerificationItem[];
}

export interface ProgramQuickViewItem {
  startTime: string;
  endTime: string;
  timeRangeLabel: string;
  summary: string;
  parent?: ProgramQuickViewItem;
}

export interface ProgramMinutes {
  text: string;
}

export interface ProgramShowNotesKeyMoment {
  time: string;
  point: string;
}

export interface ProgramShowNotes {
  guide: string;
  guestIntro: string;
  keyMoments: ProgramShowNotesKeyMoment[];
  renderedText?: string;
  templateOverride?: string;
}

export interface ProgramContentPack {
  quickView?: ProgramQuickViewItem[];
  minutes?: ProgramMinutes;
  showNotes?: ProgramShowNotes;
  structure?: ProgramStructure;
}

export interface Program {
  _id: string;
  programCode?: string;
  programShow?: "xianfeng" | "zhiji";
  title: string;
  description: string;
  coverImage: string;
  episodes: Episode[];
  summary?: ProgramSummary;
  transcript?: TranscriptSegment[];
  termGlossary?: ProgramTermGlossaryItem[];
  dictionaryEntryIds?: string[];
  dictionaryEntries?: EducationDictionaryEntry[];
  guest?: ProgramGuest;
  guests?: ProgramGuest[];
  guestBindings?: ProgramGuestBinding[];
  deepDive?: ProgramDeepDive;
  contentPack?: ProgramContentPack;
  agentOutputs?: {
    proofread?: {
      taskId?: string;
      generatedAt?: string | null;
      correctedTranscript?: TranscriptSegment[];
      report?: {
        typoCount?: number;
        punctuationChanges?: number;
        terminologyWarnings?: number;
        summary?: string;
      };
      acceptedAt?: string | null;
      acceptedBy?: string;
    };
    enrichment?: {
      taskId?: string;
      generatedAt?: string | null;
      forceOverwrite?: boolean;
      suggestedGlossary?: ProgramTermGlossaryItem[];
      suggestedReadings?: CuratedReadingItem[];
      readingVerificationReport?: CuratedReadingVerificationReport;
    };
  };
  status: 'draft' | 'published' | 'group-only';
  mindMapStatus?: "idle" | "generating" | "done" | "error";
  parseStatus?: 'idle' | 'parsing' | 'success' | 'failed';
  parseStage?: string;
  parseProgress?: number;
  parseError?: string;
  parseStartedAt?: string;
  parseFinishedAt?: string;
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Book {
  _id: string;
  categoryLabel: string;
  topic: string;
  title: string;
  author: string;
  translator: string;
  publisher: string;
  isbn?: string;
  publishedDate?: string;
  grade: string;
  coverImage: string;
  recommendedGuest: string;
  sourceName?: string;
  sourceGuestId?: string | { _id: string; name?: string; title?: string } | null;
  status: 'draft' | 'published' | 'group-only';
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
  // 微信小店扩展字段
  wxShopName?: string;
  wxShopScore?: number;
  wxSalePrice?: number;
  wxMonthlySales?: number;
  wxHeadImgs?: string[];
  wxProductId?: string;
  wxShopAppid?: string;
  wxQrcodeUrl?: string;
  wxPurchaseLink?: string;
  wxSyncAt?: string;
  hasMetadataDetail?: boolean;
  metadataCover?: string;
  metadataStatus?: 'auto_approved' | 'needs_review' | 'rejected' | '';
  metadataId?: string;
  metadataDetail?: AdminBookMetadata | null;
}

export interface BookMetadataDetail {
  bookId: string;
  title: string;
  author: string;
  publisher: string;
  isbn?: string;
  cover?: string;
  description?: string;
  source?: string;
  sourceTitle?: string;
  sourceId?: string;
  rating?: number | null;
  ratingCount?: number | null;
  ratingLabel?: string;
  matchScore?: number;
}

export interface ExternalBookLibraryRecord {
  id: string;
  title: string;
  coverPic: string;
  author: string;
  publisher: string;
  isbn: string;
  pubDate: string;
  pages: number | null;
  words: string;
  lexile: string;
  ar: string;
  tags: string;
  category: string;
  series: string;
  fiction: string;
  levelRange: string;
  description: string;
}

export interface ExternalBookLibraryResponse {
  records: ExternalBookLibraryRecord[];
  total: number;
  size: number;
  current: number;
  pages: number;
}

export interface ExternalBookDescriptionTranslationResponse {
  translatedDescription: string;
  model: string;
  cached: boolean;
}

export interface AdminBookMetadata extends Omit<BookMetadataDetail, 'bookId'> {
  _id: string;
  bookId: string | {
    _id: string;
    title?: string;
    author?: string;
    publisher?: string;
    coverImage?: string;
  };
  status: 'auto_approved' | 'needs_review' | 'rejected';
  matchReason?: string[];
  reviewNote?: string;
  reviewedAt?: string | null;
  updatedAt?: string;
  createdAt?: string;
}

export interface LearningMaterial {
  _id: string;
  title: string;
  description: string;
  fileUrl: string;
  category: string;
  status: 'draft' | 'published';
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type MamaResourceStatus = 'pending' | 'approved' | 'needs_info' | 'rejected';
export type MamaResourceCaptureStatus = 'pending' | 'captured' | 'failed' | 'manual_required';
export type MamaResourceTaskStatus = 'listed' | 'paused' | 'archived';
export type MamaResourceTaskAssignmentStatus = 'assigned' | 'submitted' | 'collected' | 'rejected';

export interface MamaResourceContentCase {
  url: string;
  title?: string;
  publishedAt?: string | null;
  likeCount?: number | null;
  favoriteCount?: number | null;
  commentCount?: number | null;
  screenshotUrl?: string;
  captureStatus: MamaResourceCaptureStatus;
  lastCapturedAt?: string | null;
}

export interface MamaResourceProfile {
  _id: string;
  displayName: string;
  contactPhone?: string;
  contactWechat: string;
  city?: string;
  childStage?: string;
  childGender?: string;
  categories: string[];
  status: MamaResourceStatus;
  accountPositioning?: string;
  consentAccepted: boolean;
  socialAccount: {
    platform: 'xiaohongshu';
    profileUrl: string;
    normalizedProfileUrl: string;
    nickname?: string;
    followerCount?: number | null;
    screenshotUrl?: string;
    realNameVerified?: boolean | null;
    dataSource: 'pending' | 'auto' | 'manual' | 'screenshot';
    lastCapturedAt?: string | null;
  };
  contentCases: MamaResourceContentCase[];
  rateCard: {
    rateRange?: string;
    availability?: string;
    acceptsGiftExchange?: boolean;
    blockedCategories: string[];
  };
  reviewNote: {
    note?: string;
    suitableCategories: string[];
    riskTags: string[];
    nextFollowUpAt?: string | null;
    reviewedAt?: string | null;
  };
  createdAt: string;
  updatedAt: string;
}

export interface MamaResourceApplicationInput {
  displayName: string;
  contactPhone?: string;
  contactWechat: string;
  city?: string;
  childStage?: string;
  childGender?: string;
  xiaohongshuProfileUrl: string;
  xiaohongshuScreenshotUrl?: string;
  followerCount?: number | string;
  realNameVerified?: boolean | null;
  accountPositioning?: string;
  categories?: string[] | string;
  acceptsGiftExchange?: boolean;
  blockedCategories?: string[] | string;
  consentAccepted: boolean;
}

export interface MamaResourceQuery {
  status?: MamaResourceStatus | 'all';
  category?: string;
  minFollowers?: number | string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface MamaResourceListResponse {
  items: MamaResourceProfile[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface MamaResourceReviewInput {
  status: MamaResourceStatus;
  note?: string;
  suitableCategories?: string[] | string;
  riskTags?: string[] | string;
  nextFollowUpAt?: string | null;
}

export interface MamaResourceTask {
  _id: string;
  taskId?: string;
  profileId?: string;
  title: string;
  platform: 'xiaohongshu';
  category?: string;
  matchCategories?: string[];
  matchRiskTags?: string[];
  minFollowerCount?: number | null;
  difficulty?: string;
  phase?: string;
  unitPriceCents: number;
  trafficFeeCents?: number | null;
  dataCycle?: string;
  settlementCycle?: string;
  promotionCount?: number | null;
  latestDataDate?: string | null;
  announcement?: string;
  settlementStandard?: string;
  requirement?: string;
  externalUrl?: string;
  exampleImageUrls?: string[];
  status: MamaResourceTaskStatus | MamaResourceTaskAssignmentStatus;
  proofLink?: string;
  proofScreenshotUrl?: string;
  submittedAt?: string | null;
  reviewedAt?: string | null;
  reviewNote?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MamaResourceTaskAssignment {
  _id: string;
  taskId: string;
  profileId: string;
  task?: MamaResourceTask;
  profile?: MamaResourceProfile;
  status: MamaResourceTaskAssignmentStatus;
  proofLink?: string;
  proofScreenshotUrl?: string;
  submittedAt?: string | null;
  reviewedAt?: string | null;
  reviewNote?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MamaResourceTaskCandidate extends MamaResourceProfile {
  assignmentId?: string;
  assignmentStatus?: MamaResourceTaskAssignmentStatus | '';
}

export interface MamaResourceTaskInput {
  title: string;
  category?: string;
  matchCategories?: string[] | string;
  matchRiskTags?: string[] | string;
  minFollowerCount?: number | string | null;
  difficulty?: string;
  phase?: string;
  unitPriceCents?: number;
  trafficFeeCents?: number | null;
  dataCycle?: string;
  settlementCycle?: string;
  promotionCount?: number | null;
  latestDataDate?: string | null;
  announcement?: string;
  settlementStandard?: string;
  requirement?: string;
  externalUrl?: string;
  exampleImageUrls?: string[];
  autoAssign?: boolean;
}

export type WelfareAvailability = "draft" | "hidden" | "archived" | "upcoming" | "active" | "expired" | "sold_out";
export type WelfareCampaignStatus = "draft" | "published" | "hidden" | "archived";

export interface WelfareCampaign {
  _id: string;
  title: string;
  subtitle?: string;
  description?: string;
  coverImageUrl?: string;
  claimInstructions?: string;
  externalUrl?: string;
  claimButtonText?: string;
  totalStock: number;
  claimedCount: number;
  remainingStock: number;
  activationCodeCount?: number;
  activationCodeClaimedCount?: number;
  activationCodeRemainingCount?: number;
  startsAt?: string | null;
  endsAt?: string | null;
  status: WelfareCampaignStatus;
  availability: WelfareAvailability;
  sortOrder?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface WelfareClaim {
  _id: string;
  campaignId: string;
  userId: string;
  activationCodeId?: string;
  activationCode?: string;
  user?: {
    _id: string;
    username?: string;
    nickname?: string;
    mobile?: string;
    avatarInitial?: string;
    avatarImage?: string;
    childGrade?: string;
    city?: string;
    region?: string;
  } | null;
  children?: Array<{
    id?: string;
    name?: string;
    age?: string;
    grade?: string;
  }>;
  status: "claimed" | "cancelled";
  claimedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface WelfareCampaignInput {
  title: string;
  subtitle?: string;
  description?: string;
  coverImageUrl?: string;
  claimInstructions?: string;
  externalUrl?: string;
  claimButtonText?: string;
  totalStock?: number | string;
  startsAt?: string | null;
  endsAt?: string | null;
  status?: WelfareCampaignStatus;
  sortOrder?: number | string;
}

export interface KnowledgeSource {
  _id: string;
  guestId?: string;
  ownerType: "guest" | "program" | "material";
  ownerId: string;
  sourceKind: "manual_note" | "uploaded_file" | "learning_material" | "external_url" | "guest_profile" | "program_content";
  title: string;
  summary?: string;
  rawText?: string;
  fileUrl?: string;
  originalFileName?: string;
  mimeType?: string;
  status: "active" | "draft" | "archived";
  parseStatus: "pending" | "ready" | "failed";
  syncStatus: "pending" | "synced" | "failed";
  syncError?: string;
  weknoraKnowledgeId?: string;
  lastSyncedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface KnowledgeSourceListResponse {
  sources: KnowledgeSource[];
  counts: Record<string, number>;
}

export interface GuestKnowledgeSyncResponse {
  ok: boolean;
  guestId: string;
  chunkCount: number;
  sourceCounts: Record<string, number>;
  weknoraSync?: {
    enabled?: boolean;
    status?: string;
    message?: string;
    uploaded?: number;
    skipped?: number;
    failed?: number;
  };
}

export interface User {
  _id: string;
  username: string;
  mobile?: string;
  role: 'admin' | 'user';
  proStatus?: 'none' | 'active' | 'expired' | 'refunded';
  proPlan?: 'plus' | 'pro' | 'monthly' | 'yearly' | '';
  membershipTier?: 'free' | 'plus' | 'pro';
  membershipLabel?: string;
  proExpiresAt?: string | null;
  proPurchasedAt?: string | null;
  proRefundEligibleUntil?: string | null;
  proLatestOrderId?: string;
  proPointBalance?: number;
  city?: string;
  region?: string;
  childGrade?: string;
  avatar_image?: string;
  avatar_initial?: string;
  gender?: string;
  parentRole?: string;
  grade?: string;
  name?: string;
  changeHistory?: Array<{
    changedAt?: string;
    changedBy?: string;
    field: string;
    oldValue?: string;
    newValue?: string;
  }>;
  childMemories?: Array<{
    childId: string;
    enabled: boolean;
    itemCount: number;
    summary: string;
    preview: string;
    updatedAt?: string;
  }>;
  memoryItemCount?: number;
  memoryPreview?: string;
  latestMemoryAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface BillingPlan {
  id: 'free' | 'plus' | 'pro';
  name: string;
  amountCents: number;
  amountYuan: string;
  durationMonths: number;
  description: string;
  pointsPerCycle: number;
}

export interface BillingMembership {
  proStatus: 'none' | 'active' | 'expired' | 'refunded';
  proPlan: 'plus' | 'pro' | 'monthly' | 'yearly' | '';
  membershipTier?: 'free' | 'plus' | 'pro';
  membershipLabel?: string;
  proPointBalance: number;
  proExpiresAt: string | null;
  proPurchasedAt: string | null;
  proRefundEligibleUntil: string | null;
  proLatestOrderId: string;
  isProActive: boolean;
  canRefundLatestOrder: boolean;
}

export interface PointUsagePolicyItem {
  featureKey: string;
  name: string;
  cost: number;
  description: string;
}

export interface BillingOrder {
  id: string;
  plan: 'plus' | 'pro' | 'monthly' | 'yearly';
  provider: 'alipay' | 'wechat';
  amountCents: number;
  currency: 'CNY';
  subject: string;
  outTradeNo: string;
  providerTradeNo?: string;
  status: 'pending' | 'paid' | 'closed' | 'refunded' | 'failed';
  paidAt?: string | null;
  refundedAt?: string | null;
  createdAt?: string | null;
}

export interface UserPageStat {
  pagePath: string;
  pageTitle: string;
  pv: number;
  uv: number;
  pc: number;
  mobile: number;
}

export interface UserPortraitResponse {
  stats: {
    total: number;
    admins: number;
    users: number;
    completed: number;
    completionRate: number;
    totalPageViews: number;
    totalUv: number;
    totalPcViews: number;
  };
  roleBreakdown: Array<{ label: string; count: number }>;
  cityTop: Array<{ label: string; count: number }>;
  gradeTop: Array<{ label: string; count: number }>;
  regionTop: Array<{ label: string; count: number }>;
  monthlyTrend: Array<{ month: string; count: number }>;
  deviceBreakdown: Array<{ label: string; count: number }>;
  pageStats: UserPageStat[];
}

export interface SystemInfo {
  serverTime: string;
  uptimeSec: number;
  nodeVersion: string;
  env: {
    allowPublicRegister: boolean;
    corsOrigin?: string;
    showNotesDefaultTemplate?: string;
    ai?: {
      provider: string;
      modelRegistrySummary?: {
        total: number;
        enabled: number;
        byProvider: Record<string, number>;
      };
      volcengine?: {
        appIdSet: boolean;
        accessTokenSet: boolean;
        apiKeySet: boolean;
        secretKeySet: boolean;
        activeAuth: "apiKey" | "appAccessToken";
        resourceId: string;
        mode: string;
        publicBaseUrl: string;
        apiKeyPreview: string;
        secretKeyPreview: string;
      };
    };
  };
  mongo: {
    readyState: number;
    name?: string;
    host?: string;
    port?: string;
  };
  stats: {
    programs: number;
    books: number;
    materials: number;
    users: number;
  };
}

export interface ModelRegistryItem {
  id: string;
  name: string;
  provider: string;
  model_name: string;
  api_key_preview?: string;
  base_url: string;
  enabled: boolean;
  capabilities: Array<"chat" | "reasoning" | "asr" | "extract" | string>;
  meta: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface ShowNotesTemplateConfig {
  template: string;
  fallbackTemplate: string;
}

export interface LoginInviteConfig {
  enabled: boolean;
  code: string;
  activationLimit: number | null;
  usedActivations: number;
  remainingActivations: number | null;
  expiresAt: string | null;
  isExpired: boolean;
  isActive: boolean;
  source: "setting" | "env";
}

export interface ProgramParseTask {
  programId: string;
  parseStatus: "idle" | "parsing" | "success" | "failed";
  parseStage?: string;
  parseProgress?: number;
  parseError?: string;
  parseStartedAt?: string | null;
  parseFinishedAt?: string | null;
}

export interface ProgramPreviewLinkResponse {
  path: string;
  idOrCode: string;
  exp: number;
  ttlHours: number;
}

export interface AgentTask {
  _id: string;
  taskType: "proofread_transcript" | "enrich_program_content" | "enrich_guest_profile" | "generate_program_artwork";
  targetType: "program" | "guest";
  targetId: string;
  status: "queued" | "running" | "succeeded" | "failed" | "canceled";
  options?: Record<string, any>;
  retries: number;
  maxRetries: number;
  progress: number;
  stage?: string;
  createdBy?: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  lastError?: string;
  outputSummary?: string;
  output?: Record<string, any>;
  createdAt?: string;
  updatedAt?: string;
}

export interface InboxMessage {
  _id: string;
  sourceType: "agent_task" | "program_parse_task";
  sourceId: string;
  taskType: "proofread_transcript" | "enrich_program_content" | "enrich_guest_profile" | "generate_program_artwork" | "program_parse";
  taskStatus: "succeeded" | "failed" | "canceled";
  targetType: "program" | "guest";
  targetId: string;
  targetTitle?: string;
  title: string;
  summary?: string;
  payload?: Record<string, any>;
  isRead: boolean;
  readAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface InboxQueryParams {
  page?: number;
  pageSize?: number;
  task_type?: InboxMessage["taskType"];
  status?: InboxMessage["taskStatus"];
  source_type?: InboxMessage["sourceType"];
  target_type?: InboxMessage["targetType"];
  is_read?: boolean;
  date_from?: string;
  date_to?: string;
}

export interface AdminProgramListResponse {
  items: Program[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface DictionaryImportResult {
  importedPrograms: number;
}

export interface UploadProgramAudioOptions {
  onProgress?: (percent: number) => void;
  sourceFileName?: string;
  uploadSource?: "passthrough";
}

export interface LoginResponse {
  token: string;
  welToken?: string;
  user: User;
}

export interface MobileCodeSendResponse {
  ok: boolean;
  expireSeconds?: number;
}

export const billingApi = {
  getPlans: () => api.get<{
    plans: Record<'free' | 'plus' | 'pro', BillingPlan>;
    refundPolicy: { fullRefundDays: number; mode?: string; description: string };
    providers: Record<string, { enabled: boolean; note?: string }>;
    usagePolicy: PointUsagePolicyItem[];
  }>('/billing/plans'),
  getMe: () => api.get<{ membership: BillingMembership; latestOrder: BillingOrder | null }>('/billing/me'),
  createOrder: (plan: 'plus' | 'pro', provider: 'alipay' | 'wechat' = 'wechat') =>
    api.post<{ order: BillingOrder; checkout: { provider: 'alipay' | 'wechat'; mode?: 'alipay_page' | 'wechat_native' | 'wechat_jsapi' | 'mock'; paymentUrl?: string; paymentForm?: string; codeUrl?: string; paymentParams?: Record<string, string>; mockPayUrl?: string; message?: string } }>('/billing/orders', { plan, provider }),
  getOrder: (id: string) => api.get<{ order: BillingOrder }>(`/billing/orders/${id}`),
  completeMockPayment: (id: string) => api.post<{ order: BillingOrder; membership: BillingMembership }>(`/billing/orders/${id}/mock-pay`),
  requestRefund: (orderId?: string, reason = '按未使用点数折算退款') =>
    api.post<{ refund: { id: string; status: string; amountCents: number; refundablePoints?: number; usedPoints?: number; refundedAt?: string | null }; membership: BillingMembership }>('/billing/refunds', { orderId, reason }),
};

// 公开 API
export const publicApi = {
  // 节目
  getPrograms: (params?: { page?: number; pageSize?: number }) => api.get<{ programs: Program[]; total: number; page: number; pageSize: number; totalPages: number }>('/programs', { params }),
  getProgram: (id: string) => api.get<Program>(`/programs/${id}`),

  // 嘉宾智库
  getGuests: (params?: { search?: string; tag?: string; page?: number; pageSize?: number }) => api.get<{ guests: PublicGuest[]; filterTags?: string[]; total: number; page: number; pageSize: number; totalPages: number }>('/guests', { params }),
  getGuest: (id: string) => api.get<PublicGuestDetail>(`/guests/${id}`),
  getGuestAgent: (id: string) => api.get<GuestAgentProfile>(`/guests/${id}/agent`),
  getGuestAgentHistory: (id: string) => api.get<GuestAgentHistory>(`/guests/${id}/agent/history`),
  chatWithGuestAgent: (id: string, question: string) => api.post<GuestAgentChatResponse>(`/guests/${id}/agent/chat`, { question }),
  
  // 书单
  getBooks: () => api.get<Book[]>('/books'),
  getExternalBooks: (params: { current: number; size: number }) => api.get<ExternalBookLibraryResponse>('/books/external', { params }),
  translateExternalBookDescription: (id: string, data: { title: string; description: string }) =>
    api.post<ExternalBookDescriptionTranslationResponse>(`/books/external/${encodeURIComponent(id)}/description-translation`, data),
  getBook: (id: string) => api.get<Book>(`/books/${id}`),
  getBookMetadata: (id: string) => api.get<BookMetadataDetail>(`/books/${id}/metadata`),
  
  // 学习资料
  getMaterials: () => api.get<LearningMaterial[]>('/learning-materials'),
  getMaterial: (id: string) => api.get<LearningMaterial>(`/learning-materials/${id}`),
  uploadMamaResourceScreenshot: (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return api.post<{ url: string; filename: string }>('/mama-resources/uploads', formData, {
      timeout: 60 * 1000,
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
  submitMamaResourceApplication: (data: MamaResourceApplicationInput) =>
    api.post<{ profile: MamaResourceProfile }>('/mama-resources/applications', data),
  getMyMamaResourceTasks: () =>
    api.get<{ profile: MamaResourceProfile | null; tasks: MamaResourceTask[] }>('/mama-resources/me/tasks'),
  getMyMamaResourceTask: (id: string) =>
    api.get<{ profile: MamaResourceProfile; task: MamaResourceTask }>(`/mama-resources/me/tasks/${id}`),
  submitMamaResourceTaskProof: (id: string, data: { proofLink: string; proofScreenshotUrl: string }) =>
    api.post<{ task: MamaResourceTask }>(`/mama-resources/me/tasks/${id}/submissions`, data),
  getWelfareCampaigns: () =>
    api.get<{ active: WelfareCampaign[]; history: WelfareCampaign[]; upcoming: WelfareCampaign[] }>('/welfare/campaigns'),
  claimWelfareCampaign: (id: string) =>
    api.post<{ claim: WelfareClaim; campaign: WelfareCampaign }>(`/welfare/campaigns/${id}/claims`, {}),
};

// 管理员 API
export const adminApi = {
  // 节目管理
  getPrograms: (status?: string) => api.get<Program[]>('/admin/programs', { params: { status } }),
  getProgramsPaged: (params?: { status?: string; search?: string; page?: number; pageSize?: number }) =>
    api.get<AdminProgramListResponse>('/admin/programs', { params }),
  getProgram: (id: string) => api.get<Program>(`/admin/programs/${id}`),
  createProgram: (data: Partial<Program>) => api.post<Program>('/admin/programs', data),
  updateProgram: (id: string, data: Partial<Program>) => api.put<Program>(`/admin/programs/${id}`, data),
  deleteProgram: (id: string) => api.delete(`/admin/programs/${id}`),
  updateProgramStatus: (id: string, status: 'draft' | 'published') => 
    api.patch<Program>(`/admin/programs/${id}/status`, { status }),
  uploadProgramAudio: (audioFile: File, options?: UploadProgramAudioOptions) => {
    const { onProgress, sourceFileName, uploadSource = "passthrough" } = options || {};
    const formData = new FormData();
    formData.append("audio", audioFile);
    formData.append("uploadSource", uploadSource);
    if (sourceFileName) {
      formData.append("sourceFileName", sourceFileName);
    }
    return api.post<{ url: string; filename: string; originalName: string; mimeType: string; size: number }>(
      "/admin/programs/upload-audio",
      formData,
      {
        // Large audio uploads can easily exceed the global 10s timeout.
        timeout: 10 * 60 * 1000,
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (event) => {
          if (!onProgress || !event.total) return;
          const percent = Math.max(0, Math.min(100, Math.round((event.loaded / event.total) * 100)));
          onProgress(percent);
        },
      }
    );
  },
  uploadProgramImage: (imageFile: File, onProgress?: (percent: number) => void) => {
    const formData = new FormData();
    formData.append("image", imageFile);
    return api.post<{ url: string; filename: string; originalName: string; mimeType: string; size: number }>(
      "/admin/programs/upload-image",
      formData,
      {
        timeout: 60 * 1000,
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (event) => {
          if (!onProgress || !event.total) return;
          const percent = Math.max(0, Math.min(100, Math.round((event.loaded / event.total) * 100)));
          onProgress(percent);
        },
      }
    );
  },
  uploadAdminImage: (imageFile: File) => {
    const formData = new FormData();
    formData.append("file", imageFile);
    return api.post<{ url: string; filename: string }>("/admin/upload", formData, {
      timeout: 60 * 1000,
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
  createProgramFromAudio: (uploadedAudioUrl: string, sourceFileName?: string) =>
    api.post<ProgramParseTask>("/admin/programs/create-from-audio", { uploadedAudioUrl, sourceFileName }),
  triggerProgramParse: (id: string) => api.post<ProgramParseTask>(`/admin/programs/${id}/parse`),
  createProgramPreviewLink: (id: string, ttlHours = 72) =>
    api.post<ProgramPreviewLinkResponse>(`/admin/programs/${id}/preview-link`, { ttlHours }),
  getProgramParseStatus: (id: string) => api.get<ProgramParseTask>(`/admin/programs/${id}/parse-status`),
  acceptProgramProofread: (id: string) => api.post<Program>(`/admin/programs/${id}/proofread/accept`),
  generateProgramMindMap: (id: string) => api.post<{ programId: string; mindMap: MindMapData }>(`/admin/programs/${id}/generate-mindmap`),

  createAgentTask: (data: {
    taskType: AgentTask["taskType"];
    targetType: AgentTask["targetType"];
    targetId: string;
    options?: Record<string, any>;
    maxRetries?: number;
  }) => api.post<AgentTask>("/admin/agent-tasks", data),
  getAgentTask: (id: string) => api.get<AgentTask>(`/admin/agent-tasks/${id}`),
  listAgentTasks: (params?: {
    taskType?: AgentTask["taskType"];
    targetType?: AgentTask["targetType"];
    targetId?: string;
    status?: AgentTask["status"];
    limit?: number;
  }) => api.get<{ items: AgentTask[] }>("/admin/agent-tasks", { params }),
  retryAgentTask: (id: string) => api.post<AgentTask>(`/admin/agent-tasks/${id}/retry`),
  listInboxMessages: (params?: InboxQueryParams) =>
    api.get<{ items: InboxMessage[]; page: number; pageSize: number; total: number; unreadCount: number }>("/admin/inbox", { params }),
  getInboxMessage: (id: string) => api.get<InboxMessage>(`/admin/inbox/${id}`),
  markInboxMessageRead: (id: string) => api.patch<{ ok: boolean; item: InboxMessage }>(`/admin/inbox/${id}/read`, {}),
  markAllInboxRead: () => api.patch<{ ok: boolean }>("/admin/inbox/read-all", {}),

  getDictionaryEntries: (params?: { search?: string; status?: string }) =>
    api.get<AdminEducationDictionaryEntry[]>("/admin/dictionary", { params }),
  getDictionaryEntry: (id: string) => api.get<AdminEducationDictionaryEntry>(`/admin/dictionary/${id}`),
  createDictionaryEntry: (data: Partial<AdminEducationDictionaryEntry>) =>
    api.post<AdminEducationDictionaryEntry>("/admin/dictionary", data),
  updateDictionaryEntry: (id: string, data: Partial<AdminEducationDictionaryEntry>) =>
    api.put<AdminEducationDictionaryEntry>(`/admin/dictionary/${id}`, data),
  updateDictionaryEntryStatus: (id: string, status: "active" | "hidden") =>
    api.patch<AdminEducationDictionaryEntry>(`/admin/dictionary/${id}/status`, { status }),
  importDictionaryFromPrograms: (programIds: string[]) =>
    api.post<DictionaryImportResult>("/admin/dictionary/import-from-programs", { programIds }),
  getDictionaryEntryPrograms: (id: string) => api.get<DictionaryRelatedProgram[]>(`/admin/dictionary/${id}/programs`),
  deleteDictionaryEntry: (id: string) => api.delete(`/admin/dictionary/${id}`),
  bulkDeleteDictionaryEntries: (ids: string[]) => api.post(`/admin/dictionary/bulk-delete`, { ids }),
  getGuests: (params?: { search?: string; status?: "active" | "inactive" }) => api.get<Guest[]>("/admin/guests", { params }),
  getGuest: (id: string) => api.get<Guest>(`/admin/guests/${id}`),
  getGuestProgramBindings: (id: string, params?: { search?: string }) =>
    api.get<{ items: GuestBoundProgram[] }>(`/admin/guests/${id}/program-bindings`, { params }),
  updateGuestProgramBindings: (id: string, programIds: string[]) =>
    api.put<{ ok: boolean; guest?: Guest; programIds: string[] }>(`/admin/guests/${id}/program-bindings`, { programIds }),
  createGuest: (data: Partial<Guest>) => api.post<Guest>("/admin/guests", data),
  updateGuest: (id: string, data: Partial<Guest>) => api.put<Guest>(`/admin/guests/${id}`, data),
  updateGuestStatus: (id: string, status: "active" | "inactive") =>
    api.patch<Guest>(`/admin/guests/${id}/status`, { status }),
  deleteGuest: (id: string) => api.delete(`/admin/guests/${id}`),
  getKnowledgeSources: (params?: { guestId?: string }) =>
    api.get<KnowledgeSourceListResponse>("/admin/knowledge-sources", { params }),
  createKnowledgeSource: (data: {
    guestId: string;
    title: string;
    summary?: string;
    rawText?: string;
    sourceKind?: KnowledgeSource["sourceKind"];
    status?: KnowledgeSource["status"];
  }) => api.post<KnowledgeSource>("/admin/knowledge-sources", data),
  uploadKnowledgeSource: (data: {
    guestId: string;
    file: File;
    title?: string;
    summary?: string;
    rawText?: string;
  }) => {
    const formData = new FormData();
    formData.append("file", data.file);
    formData.append("guestId", data.guestId);
    if (data.title) formData.append("title", data.title);
    if (data.summary) formData.append("summary", data.summary);
    if (data.rawText) formData.append("rawText", data.rawText);
    return api.post<KnowledgeSource>("/admin/knowledge-sources/upload", formData, {
      timeout: 120000,
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
  syncGuestKnowledgeSources: (guestId: string) =>
    api.post<GuestKnowledgeSyncResponse>(`/admin/knowledge-sources/guests/${guestId}/sync`),
  
  // 书单管理
  getBooks: (status?: string) => api.get<Book[]>('/admin/books', { params: { status } }),
  getBook: (id: string) => api.get<Book>(`/admin/books/${id}`),
  createBook: (data: Partial<Book>) => api.post<Book>('/admin/books', data),
  updateBook: (id: string, data: Partial<Book>) => api.put<Book>(`/admin/books/${id}`, data),
  deleteBook: (id: string) => api.delete(`/admin/books/${id}`),
  updateBookStatus: (id: string, status: 'draft' | 'published') => 
    api.patch<Book>(`/admin/books/${id}/status`, { status }),
  importBooks: (data: {
    rows: Array<Record<string, any>>;
    sourceName?: string;
    sourceGuestId?: string;
    overwrite?: boolean;
  }) => api.post<{ created: number; updated: number; skipped: number; total: number; skippedDetails?: Array<{ index: number; reason: string; title?: string; author?: string }> }>(
    '/admin/books/import',
    data,
    { timeout: 120000 }
  ),
  batchPublishBooks: (data: { filter?: string; ids?: string[] }) =>
    api.post<{ matched: number; modified: number }>('/admin/books/batch-publish', data),
  getBookMetadataReview: (status?: string) =>
    api.get<AdminBookMetadata[]>('/admin/books/metadata', { params: { status } }),
  reviewBookMetadata: (id: string, data: Partial<AdminBookMetadata>) =>
    api.patch<AdminBookMetadata>(`/admin/books/metadata/${id}`, data),
  
  // 学习资料管理
  getMaterials: (params?: { status?: string; search?: string }) => api.get<LearningMaterial[]>('/admin/learning-materials', { params }),
  getMaterial: (id: string) => api.get<LearningMaterial>(`/admin/learning-materials/${id}`),
  createMaterial: (data: Partial<LearningMaterial>) => api.post<LearningMaterial>('/admin/learning-materials', data),
  updateMaterial: (id: string, data: Partial<LearningMaterial>) => api.put<LearningMaterial>(`/admin/learning-materials/${id}`, data),
  deleteMaterial: (id: string) => api.delete(`/admin/learning-materials/${id}`),
  updateMaterialStatus: (id: string, status: 'draft' | 'published') => 
    api.patch<LearningMaterial>(`/admin/learning-materials/${id}/status`, { status }),

  getMamaResources: (params?: MamaResourceQuery) =>
    api.get<MamaResourceListResponse>('/admin/mama-resources', { params }),
  getMamaResource: (id: string) =>
    api.get<{ profile: MamaResourceProfile }>(`/admin/mama-resources/${id}`),
  updateMamaResource: (id: string, data: Partial<MamaResourceProfile>) =>
    api.put<{ profile: MamaResourceProfile }>(`/admin/mama-resources/${id}`, data),
  reviewMamaResource: (id: string, data: MamaResourceReviewInput) =>
    api.patch<{ profile: MamaResourceProfile }>(`/admin/mama-resources/${id}/review`, data),
  getMamaResourceTasks: () =>
    api.get<{ tasks: MamaResourceTask[] }>('/admin/mama-resources/tasks'),
  createMamaResourceTask: (data: MamaResourceTaskInput) =>
    api.post<{ task: MamaResourceTask; assignments?: MamaResourceTaskAssignment[] }>('/admin/mama-resources/tasks', data),
  updateMamaResourceTask: (id: string, data: MamaResourceTaskInput) =>
    api.patch<{ task: MamaResourceTask }>(`/admin/mama-resources/tasks/${id}`, data),
  getMamaResourceTaskCandidates: (id: string, params?: MamaResourceQuery & { riskTag?: string }) =>
    api.get<{ items: MamaResourceTaskCandidate[] }>(`/admin/mama-resources/tasks/${id}/candidates`, { params }),
  getMamaResourceTaskAssignments: (id: string) =>
    api.get<{ assignments: MamaResourceTaskAssignment[] }>(`/admin/mama-resources/tasks/${id}/assignments`),
  assignMamaResourceTaskProfiles: (id: string, profileIds: string[]) =>
    api.post<{ assignments: MamaResourceTaskAssignment[] }>(`/admin/mama-resources/tasks/${id}/assignments`, { profileIds }),
  reviewMamaResourceTaskAssignment: (id: string, data: { status: MamaResourceTaskAssignmentStatus; reviewNote?: string }) =>
    api.patch<{ task: MamaResourceTaskAssignment; assignment: MamaResourceTaskAssignment }>(`/admin/mama-resources/tasks/assignments/${id}/review`, data),
  getAdminWelfareCampaigns: () =>
    api.get<{ items: WelfareCampaign[] }>('/admin/welfare'),
  createWelfareCampaign: (data: WelfareCampaignInput) =>
    api.post<{ campaign: WelfareCampaign }>('/admin/welfare', data),
  updateWelfareCampaign: (id: string, data: WelfareCampaignInput) =>
    api.put<{ campaign: WelfareCampaign }>(`/admin/welfare/${id}`, data),
  importWelfareActivationCodes: (id: string, data: { codesText?: string; codes?: string[] }) =>
    api.post<{ importedCount: number; skippedCount: number; campaign: WelfareCampaign }>(`/admin/welfare/${id}/activation-codes`, data),
  getAdminWelfareClaims: (id: string) =>
    api.get<{ claims: WelfareClaim[] }>(`/admin/welfare/${id}/claims`),
  exportAdminWelfareClaims: (id: string) =>
    api.get<Blob>(`/admin/welfare/${id}/claims/export`, { responseType: "blob" }),

  getUsers: () => api.get<User[]>('/users'),
  getUserPortrait: (params?: { role?: string; city?: string; grade?: string }) =>
    api.get<UserPortraitResponse>("/users/portrait", { params }),
  createUser: (data: Partial<User> & { password: string }) => api.post<{ message: string; user: User }>('/users/register', data),
  updateUser: (id: string, data: Partial<User> & { password?: string }) => api.put<User>(`/users/${id}`, data),
  deleteUser: (id: string) => api.delete(`/users/${id}`),

  getSystemInfo: () => api.get<SystemInfo>('/admin/system-info'),
  getModelRegistry: () => api.get<{ items: ModelRegistryItem[] }>("/admin/mgmt/model-registry"),
  createModelRegistryItem: (data: Partial<ModelRegistryItem> & { api_key?: string }) =>
    api.post<{ ok: boolean; item: ModelRegistryItem }>("/admin/mgmt/model-registry", data),
  updateModelRegistryItem: (id: string, data: Partial<ModelRegistryItem> & { api_key?: string }) =>
    api.put<{ ok: boolean; item: ModelRegistryItem }>(`/admin/mgmt/model-registry/${encodeURIComponent(id)}`, data),
  deleteModelRegistryItem: (id: string) => api.delete<{ ok: boolean }>(`/admin/mgmt/model-registry/${encodeURIComponent(id)}`),
  getShowNotesTemplate: () => api.get<ShowNotesTemplateConfig>("/admin/show-notes-template"),
  updateShowNotesTemplate: (template: string) =>
    api.put<ShowNotesTemplateConfig>("/admin/show-notes-template", { template }),
  getLoginInviteConfig: () => api.get<LoginInviteConfig>("/admin/login-invite"),
  updateLoginInviteConfig: (data: {
    enabled: boolean;
    code: string;
    activationLimit: number | null;
    expiresAt: string | null;
  }) => api.put<LoginInviteConfig>("/admin/login-invite", data),
  resetLoginInviteUsage: () => api.put<LoginInviteConfig>("/admin/login-invite", { resetUsage: true }),
};

// 用户 API
export const userApi = {
  login: (username: string, password: string) => 
    api.post<LoginResponse>('/users/login', { username, password }),
  verifyInviteCode: (inviteCode: string) =>
    api.post<{ ok: boolean }>("/users/invite/verify", { inviteCode }),
  sendMobileCode: (mobile: string, inviteCode?: string) =>
    api.post<MobileCodeSendResponse>("/users/sms/send-code", { mobile, inviteCode }),
  mobileAuth: (mobile: string, code: string, inviteCode?: string) =>
    api.post<LoginResponse>("/users/auth/mobile", { mobile, code, inviteCode }),
  getMe: () => api.get<User>('/users/me'),
  deleteMe: (confirmation: string) => api.delete<{ message: string; restoreDeadline?: string }>("/users/me", { data: { confirmation } }),
  trackPageView: (data: { pagePath: string; pageTitle: string; sessionId: string; deviceType: string }) =>
    api.post<{ ok: boolean; deduped?: boolean }>("/users/page-view", data),
  register: (username: string, password: string, role?: string) => 
    api.post('/users/register', { username, password, role }),
};

export default api;

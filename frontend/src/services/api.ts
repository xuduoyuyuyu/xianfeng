import axios, { AxiosInstance, AxiosError } from 'axios';

// In production the Nginx gateway proxies `/api` on the same origin.
// Falling back to a relative path keeps deployed domains working even when
// no explicit VITE_API_URL is injected at build time.
const API_BASE_URL = (import.meta.env.VITE_API_URL || '').trim();

// 创建 axios 实例
const api: AxiosInstance = axios.create({
  baseURL: `${API_BASE_URL}/api`,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 请求拦截器 - 添加 token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// 响应拦截器 - 处理错误
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      // 未授权，清除 token 并跳转到登录页
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/admin/login';
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
  profileAvatarCandidates?: Array<{ url: string; label?: string; sourceUrl?: string }>;
  profileGeneratedAt?: string | null;
  status: "active" | "inactive";
  programCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface GuestBoundProgram {
  _id: string;
  title: string;
  programCode?: string;
  status: "draft" | "published";
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
  status: "draft" | "published";
  coverImage?: string;
  publishedAt?: string | null;
  updatedAt?: string | null;
}

export interface CuratedReadingItem {
  title: string;
  subtitle?: string;
  url?: string;
}

export interface ProgramDeepDive {
  sectionTitle?: string;
  curatedReading?: CuratedReadingItem[];
}

export interface ProgramQuickViewItem {
  startTime: string;
  endTime: string;
  timeRangeLabel: string;
  summary: string;
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
}

export interface Program {
  _id: string;
  programCode?: string;
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
    };
  };
  status: 'draft' | 'published';
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
  title: string;
  author: string;
  description: string;
  coverImage: string;
  category: string;
  status: 'draft' | 'published';
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
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

export interface User {
  _id: string;
  username: string;
  role: 'admin' | 'user';
  city?: string;
  region?: string;
  childGrade?: string;
  createdAt?: string;
  updatedAt?: string;
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

export interface ProgramParseTask {
  programId: string;
  parseStatus: "idle" | "parsing" | "success" | "failed";
  parseStage?: string;
  parseProgress?: number;
  parseError?: string;
  parseStartedAt?: string | null;
  parseFinishedAt?: string | null;
}

export interface AgentTask {
  _id: string;
  taskType: "proofread_transcript" | "enrich_program_content" | "enrich_guest_profile";
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
  user: User;
}

// 公开 API
export const publicApi = {
  // 节目
  getPrograms: () => api.get<Program[]>('/programs'),
  getProgram: (id: string) => api.get<Program>(`/programs/${id}`),
  
  // 书单
  getBooks: () => api.get<Book[]>('/books'),
  getBook: (id: string) => api.get<Book>(`/books/${id}`),
  
  // 学习资料
  getMaterials: () => api.get<LearningMaterial[]>('/learning-materials'),
  getMaterial: (id: string) => api.get<LearningMaterial>(`/learning-materials/${id}`),
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
  createProgramFromAudio: (uploadedAudioUrl: string, sourceFileName?: string) =>
    api.post<ProgramParseTask>("/admin/programs/create-from-audio", { uploadedAudioUrl, sourceFileName }),
  triggerProgramParse: (id: string) => api.post<ProgramParseTask>(`/admin/programs/${id}/parse`),
  getProgramParseStatus: (id: string) => api.get<ProgramParseTask>(`/admin/programs/${id}/parse-status`),
  acceptProgramProofread: (id: string) => api.post<Program>(`/admin/programs/${id}/proofread/accept`),

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
  
  // 书单管理
  getBooks: (status?: string) => api.get<Book[]>('/admin/books', { params: { status } }),
  getBook: (id: string) => api.get<Book>(`/admin/books/${id}`),
  createBook: (data: Partial<Book>) => api.post<Book>('/admin/books', data),
  updateBook: (id: string, data: Partial<Book>) => api.put<Book>(`/admin/books/${id}`, data),
  deleteBook: (id: string) => api.delete(`/admin/books/${id}`),
  updateBookStatus: (id: string, status: 'draft' | 'published') => 
    api.patch<Book>(`/admin/books/${id}/status`, { status }),
  
  // 学习资料管理
  getMaterials: (status?: string) => api.get<LearningMaterial[]>('/admin/learning-materials', { params: { status } }),
  getMaterial: (id: string) => api.get<LearningMaterial>(`/admin/learning-materials/${id}`),
  createMaterial: (data: Partial<LearningMaterial>) => api.post<LearningMaterial>('/admin/learning-materials', data),
  updateMaterial: (id: string, data: Partial<LearningMaterial>) => api.put<LearningMaterial>(`/admin/learning-materials/${id}`, data),
  deleteMaterial: (id: string) => api.delete(`/admin/learning-materials/${id}`),
  updateMaterialStatus: (id: string, status: 'draft' | 'published') => 
    api.patch<LearningMaterial>(`/admin/learning-materials/${id}/status`, { status }),

  getUsers: () => api.get<User[]>('/users'),
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
};

// 用户 API
export const userApi = {
  login: (username: string, password: string) => 
    api.post<LoginResponse>('/users/login', { username, password }),
  getMe: () => api.get<User>('/users/me'),
  register: (username: string, password: string, role?: string) => 
    api.post('/users/register', { username, password, role }),
};

export default api;

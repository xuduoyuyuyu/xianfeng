import axios, { AxiosInstance, AxiosError } from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

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

export interface ProgramTermGlossaryItem {
  term: string;
  definition: string;
  sourceUrl?: string;
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

export interface Program {
  _id: string;
  title: string;
  description: string;
  coverImage: string;
  episodes: Episode[];
  summary?: ProgramSummary;
  transcript?: TranscriptSegment[];
  termGlossary?: ProgramTermGlossaryItem[];
  guest?: ProgramGuest;
  deepDive?: ProgramDeepDive;
  status: 'draft' | 'published';
  parseStatus?: 'idle' | 'parsing' | 'success' | 'failed';
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

export interface ProgramParseTask {
  programId: string;
  parseStatus: "idle" | "parsing" | "success" | "failed";
  parseError?: string;
  parseStartedAt?: string | null;
  parseFinishedAt?: string | null;
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
  getProgram: (id: string) => api.get<Program>(`/admin/programs/${id}`),
  createProgram: (data: Partial<Program>) => api.post<Program>('/admin/programs', data),
  updateProgram: (id: string, data: Partial<Program>) => api.put<Program>(`/admin/programs/${id}`, data),
  deleteProgram: (id: string) => api.delete(`/admin/programs/${id}`),
  updateProgramStatus: (id: string, status: 'draft' | 'published') => 
    api.patch<Program>(`/admin/programs/${id}/status`, { status }),
  uploadProgramAudio: (file: File) => {
    const formData = new FormData();
    formData.append("audio", file);
    return api.post<{ url: string; filename: string; originalName: string; mimeType: string; size: number }>(
      "/admin/programs/upload-audio",
      formData,
      { headers: { "Content-Type": "multipart/form-data" } }
    );
  },
  createProgramFromAudio: (uploadedAudioUrl: string) =>
    api.post<ProgramParseTask>("/admin/programs/create-from-audio", { uploadedAudioUrl }),
  triggerProgramParse: (id: string) => api.post<ProgramParseTask>(`/admin/programs/${id}/parse`),
  getProgramParseStatus: (id: string) => api.get<ProgramParseTask>(`/admin/programs/${id}/parse-status`),
  
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
  updateUser: (id: string, data: Partial<User> & { password?: string }) => api.put<User>(`/users/${id}`, data),
  deleteUser: (id: string) => api.delete(`/users/${id}`),

  getSystemInfo: () => api.get<SystemInfo>('/admin/system-info'),
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

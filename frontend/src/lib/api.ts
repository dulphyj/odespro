import axios, { AxiosError } from "axios";
import type {
  User,
  UserCreate,
  UserUpdate,
  Role,
  RoleCreate,
  Permission,
  Folder,
  FolderCreate,
  FolderUpdate,
  Document,
  DocumentCreate,
  DocumentUpdate,
  DocumentPage,
  DocumentVersion,
  OcrResult,
  Scanner,
  ScanRequest,
  SearchRequest,
  SearchResponse,
  AuditLog,
  ReportData,
  ApiResponse,
  PaginatedResponse,
} from "@/types";

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1",
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("auth-token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401 && typeof window !== "undefined") {
      localStorage.removeItem("auth-token");
      localStorage.removeItem("auth-storage");
      if (!window.location.pathname.includes("/login")) {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

export async function uploadDocument(
  file: File,
  title: string,
  onProgress?: (percent: number) => void
): Promise<Document> {
  const formData = new FormData();
  formData.append("title", title);
  formData.append("file", file);
  const response = await api.post<Document>("/documents", formData, {
    headers: { "Content-Type": "multipart/form-data" },
    onUploadProgress: (e) => {
      if (onProgress && e.total) {
        onProgress(Math.round((e.loaded * 100) / e.total));
      }
    },
  });
  return response.data;
}

export const auth = {
  login: (username: string, password: string) =>
    api.post<ApiResponse<{ user: User; token: string }>>("/auth/login", {
      username,
      password,
    }),
  getMe: () => api.get<ApiResponse<User>>("/auth/me"),
  changePassword: (current_password: string, new_password: string) =>
    api.put("/auth/change-password", { current_password, new_password }),
};

export const users = {
  getUsers: (params?: { page?: number; page_size?: number; search?: string }) =>
    api.get<User[]>("/users", { params }),
  getUser: (id: number) => api.get<User>(`/users/${id}`),
  createUser: (data: UserCreate) =>
    api.post<User>("/users", data),
  updateUser: (id: number, data: UserUpdate) =>
    api.put<User>(`/users/${id}`, data),
  deleteUser: (id: number) => api.delete(`/users/${id}`),
};

export const roles = {
  getRoles: () => api.get<Role[]>("/roles"),
  getRole: (id: number) => api.get<Role>(`/roles/${id}`),
  createRole: (data: RoleCreate) =>
    api.post<Role>("/roles", data),
  updateRole: (id: number, data: RoleCreate) =>
    api.put<Role>(`/roles/${id}`, data),
  deleteRole: (id: number) => api.delete(`/roles/${id}`),
  getPermissions: () =>
    api.get<Permission[]>("/roles/permissions"),
};

export const folders = {
  getFolders: () => api.get<Folder[]>("/folders"),
  getFolder: (id: number) => api.get<Folder>(`/folders/${id}`),
  createFolder: (data: FolderCreate) =>
    api.post<Folder>("/folders", data),
  updateFolder: (id: number, data: FolderUpdate) =>
    api.put<Folder>(`/folders/${id}`, data),
  deleteFolder: (id: number) => api.delete(`/folders/${id}`),
  getFolderTree: () => api.get<Folder[]>("/folders/tree"),
};

export const documents = {
  getDocuments: (params?: {
    page?: number;
    page_size?: number;
    folder_id?: number;
    search?: string;
    file_type?: string;
    tags?: string;
    sort_by?: string;
    sort_order?: string;
  }) => api.get<PaginatedResponse<Document>>("/documents", { params }),
  getDocument: (id: number) =>
    api.get<Document>(`/documents/${id}`),
  createDocument: (data: DocumentCreate) =>
    api.post<Document>("/documents", data),
  updateDocument: (id: number, data: DocumentUpdate) =>
    api.put<Document>(`/documents/${id}`, data),
  deleteDocument: (id: number) => api.delete(`/documents/${id}`),
  downloadDocument: (id: number) =>
    api.get(`/documents/${id}/download`, { responseType: "blob" }),
  getDocumentPreview: (id: number) =>
    api.get(`/documents/${id}/preview`, { responseType: "blob" }),
  getDocumentPages: (id: number) =>
    api.get<DocumentPage[]>(`/documents/${id}/pages`),
  getDocumentVersions: (id: number) =>
    api.get<DocumentVersion[]>(`/documents/${id}/versions`),
  createVersion: (id: number, file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return api.post<DocumentVersion>(
      `/documents/${id}/versions`,
      formData,
      { headers: { "Content-Type": "multipart/form-data" } }
    );
  },
  rotatePage: (documentId: number, pageId: number, degrees: number) =>
    api.put<DocumentPage>(`/documents/${documentId}/pages/${pageId}/rotate`, { degrees }),
  deletePage: (documentId: number, pageId: number) =>
    api.delete(`/documents/${documentId}/pages/${pageId}`),
  reorderPages: (documentId: number, pageIds: number[]) =>
    api.put<DocumentPage[]>(`/documents/${documentId}/pages/reorder`, { page_ids: pageIds }),
};

export const ocr = {
  processOcr: (document_id: number) =>
    api.post<OcrResult[]>("/ocr/process", {
      document_id,
    }),
  getOcrResults: (document_id: number) =>
    api.get<OcrResult[]>(`/ocr/${document_id}`),
  getOcrByPage: (page_id: number) =>
    api.get<OcrResult>(`/ocr/page/${page_id}`),
};

export const scanner = {
  getDevices: () => api.get<Scanner[]>("/scanner/devices"),
  scan: (data: ScanRequest) =>
    api.post<{ task_id: string }>("/scanner/scan", data),
  scanPdf: (data: ScanRequest) =>
    api.post<{ task_id: string }>("/scanner/scan/pdf", data),
  scanImages: (data: ScanRequest) =>
    api.post<{ task_id: string }>("/scanner/scan/images", data),
  getStatus: (task_id: string) =>
    api.get<{ status: string; progress: number; result?: Document }>(
      `/scanner/status/${task_id}`
    ),
};

export const search = {
  search: (params: SearchRequest) =>
    api.get<SearchResponse>("/search", { params }),
  advancedSearch: (data: SearchRequest) =>
    api.post<SearchResponse>("/search/advanced", data),
  reindex: () => api.post("/search/reindex"),
  getSimilar: (document_id: number) =>
    api.get<Document[]>(`/search/similar/${document_id}`),
};

export const audit = {
  getAuditLogs: (params?: {
    page?: number;
    page_size?: number;
    action?: string;
    entity_type?: string;
    user_id?: number;
    date_from?: string;
    date_to?: string;
  }) => api.get<PaginatedResponse<AuditLog>>("/audit", { params }),
  getUserActivity: (user_id: number) =>
    api.get<AuditLog[]>(`/audit/user/${user_id}`),
  getEntityHistory: (entity_type: string, entity_id: number) =>
    api.get<AuditLog[]>(
      `/audit/entity/${entity_type}/${entity_id}`
    ),
};

export const reports = {
  getDailyReport: (date?: string) =>
    api.get<ReportData>("/reports/daily", {
      params: { date },
    }),
  getMonthlyReport: (year?: number, month?: number) =>
    api.get<ReportData>("/reports/monthly", {
      params: { year, month },
    }),
  getByUserReport: (user_id: number) =>
    api.get<ReportData>(`/reports/user/${user_id}`),
  getOcrStats: () => api.get<{ total: number; processed: number; pending: number }>("/reports/ocr-stats"),
  getPendingDocuments: () =>
    api.get<Document[]>("/reports/pending-documents"),
  exportReport: (type: string, format: "pdf" | "csv" | "xlsx") =>
    api.get(`/reports/export/${type}`, {
      params: { format },
      responseType: "blob",
    }),
};

export default api;

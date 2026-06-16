export interface User {
  id: number;
  username: string;
  email: string;
  full_name: string;
  is_active: boolean;
  is_superuser: boolean;
  role_id: number | null;
  role?: Role;
  created_at: string;
  updated_at: string;
}

export interface UserCreate {
  username: string;
  email: string;
  password: string;
  full_name: string;
  role_id?: number | null;
  is_active?: boolean;
}

export interface UserUpdate {
  email?: string;
  full_name?: string;
  is_active?: boolean;
  role_id?: number | null;
}

export interface Role {
  id: number;
  name: string;
  description: string | null;
  permissions: Permission[];
  created_at: string;
  updated_at: string;
}

export interface Permission {
  id: number;
  codename: string;
  name: string;
  description: string | null;
  group: string;
}

export interface RoleCreate {
  name: string;
  description?: string;
  permission_ids: number[];
}

export interface Folder {
  id: number;
  name: string;
  description: string | null;
  parent_id: number | null;
  children?: Folder[];
  document_count?: number;
  created_by: number;
  created_at: string;
  updated_at: string;
}

export interface FolderCreate {
  name: string;
  description?: string;
  parent_id?: number | null;
}

export interface FolderUpdate {
  name?: string;
  description?: string;
  parent_id?: number | null;
}

export type DocumentType = "pdf" | "image" | "word" | "excel" | "text" | "other";

export interface Document {
  id: number;
  title: string;
  description: string | null;
  file: string;
  file_name: string;
  file_size: number;
  file_type: DocumentType;
  mime_type: string;
  folder_id: number | null;
  folder?: Folder;
  page_count: number | null;
  tags: string[];
  metadata: Record<string, unknown>;
  ocr_processed: boolean;
  ocr_text: string | null;
  checksum: string;
  is_favorite: boolean;
  created_by: number;
  created_by_user?: User;
  created_at: string;
  updated_at: string;
}

export interface DocumentCreate {
  title: string;
  description?: string;
  folder_id?: number | null;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface DocumentUpdate {
  title?: string;
  description?: string;
  folder_id?: number | null;
  tags?: string[];
  metadata?: Record<string, unknown>;
  is_favorite?: boolean;
}

export interface DocumentPage {
  id: number;
  document_id: number;
  page_number: number;
  image_url: string;
  thumbnail_url: string;
  width: number;
  height: number;
  ocr_text: string | null;
  ocr_confidence: number | null;
}

export interface DocumentVersion {
  id: number;
  document_id: number;
  version_number: number;
  file: string;
  file_name: string;
  file_size: number;
  checksum: string;
  created_by: number;
  created_by_user?: User;
  created_at: string;
}

export interface OcrResult {
  id: number;
  document_id: number;
  page_id: number | null;
  page_number: number;
  text: string;
  confidence: number;
  raw_data: Record<string, unknown>;
  processing_time_ms: number;
  created_at: string;
}

export interface Scanner {
  id: string;
  name: string;
  device_id: string;
  vendor: string;
  is_available: boolean;
  connection: string;
}

export interface ScanRequest {
  device_id: string;
  resolution?: number;
  color_mode?: "color" | "grayscale" | "black_white";
  format?: "pdf" | "jpeg" | "png" | "tiff";
  duplex?: boolean;
  source?: "flatbed" | "adf";
  document_title?: string;
  folder_id?: number | null;
}

export interface SearchRequest {
  query: string;
  folder_id?: number | null;
  file_type?: DocumentType;
  tags?: string[];
  date_from?: string;
  date_to?: string;
  page?: number;
  page_size?: number;
  sort_by?: string;
  sort_order?: "asc" | "desc";
}

export interface SearchResponse {
  results: Document[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  query_time_ms: number;
}

export interface AuditLog {
  id: number;
  user_id: number | null;
  user?: User;
  action: string;
  entity_type: string;
  entity_id: number | null;
  details: Record<string, unknown>;
  ip_address: string;
  created_at: string;
}

export interface ReportData {
  total_documents: number;
  total_folders: number;
  total_users: number;
  documents_by_type: Record<string, number>;
  documents_by_date: Record<string, number>;
  recent_uploads: number;
  ocr_processed: number;
  ocr_pending: number;
  storage_used: number;
  storage_formatted: string;
  top_users: { user: User; count: number }[];
}

export interface ApiResponse<T> {
  data: T;
  message?: string;
  status: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

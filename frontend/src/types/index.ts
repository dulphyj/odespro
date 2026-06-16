export interface User {
  id: number;
  username: string;
  email: string;
  full_name: string;
  is_active: boolean;
  is_superuser: boolean;
  role_id?: number | null;
  roles?: Role[];
  created_at: string;
  updated_at: string;
}

export interface UserCreate {
  username: string;
  email: string;
  password: string;
  full_name: string;
  role_id?: number | null;
  role_ids?: number[];
  is_active?: boolean;
}

export interface UserUpdate {
  email?: string;
  full_name?: string;
  is_active?: boolean;
  role_id?: number | null;
  role_ids?: number[];
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
  code: string;
  name: string;
  description: string | null;
  module: string;
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
  owner_id: number;
  is_active: boolean;
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

export interface DocumentTypeItem {
  id: number;
  code: string;
  name: string;
  description?: string | null;
  icon?: string | null;
  retention_days?: number | null;
  requires_ocr: boolean;
  is_active: boolean;
}

export interface Document {
  id: number;
  title: string;
  description: string | null;
  file_name: string | null;
  file_size: number;
  mime_type: string | null;
  folder_id: number | null;
  folder?: Folder;
  document_type_id?: number | null;
  document_type?: DocumentTypeItem;
  page_count: number;
  storage_path?: string | null;
  checksum: string | null;
  is_indexed: boolean;
  classification?: string | null;
  classification_confidence?: number | null;
  metadata: Record<string, unknown>;
  is_active: boolean;
  owner_id: number;
  owner?: User;
  pages?: DocumentPage[];
  versions?: DocumentVersion[];
  ocr_results?: OcrResult[];
  current_version: number;
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
  storage_path: string;
  thumbnail_path?: string | null;
  width: number | null;
  height: number | null;
  rotation: number;
  ocr_text: string | null;
  ocr_confidence: number | null;
}

export interface DocumentVersion {
  id: number;
  document_id: number;
  version_number: number;
  file_name: string | null;
  file_size: number;
  storage_path?: string | null;
  checksum: string | null;
  changes_description?: string | null;
  created_by: number | null;
  created_at: string;
}

export interface OcrResult {
  id: number;
  document_id: number;
  page_id: number | null;
  full_text: string;
  confidence: number | null;
  raw_data: Record<string, unknown> | null;
  processing_time_ms: number | null;
  language: string | null;
  created_at: string;
}

export interface Scanner {
  id: string;
  name: string;
  device_id?: string;
  vendor?: string;
  manufacturer?: string;
  model?: string;
  is_available?: boolean;
  connection?: string;
}

export interface ScanRequest {
  device_id: string;
  resolution?: number;
  color_mode?: "color" | "grayscale" | "black_white";
  format?: "pdf" | "jpeg" | "png" | "tiff";
  duplex?: boolean;
  source?: "flatbed" | "adf";
  paper_size?: string;
  page_count?: number;
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
  entity_id: string | null;
  username?: string | null;
  description?: string | null;
  details: Record<string, unknown>;
  ip_address: string | null;
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

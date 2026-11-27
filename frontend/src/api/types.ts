export type Role = "user" | "admin";
export type User = {
  id: string;
  display_name: string;
  email: string;
  role: Role;
};
export type EmailChallenge = {
  mode: "code";
  challenge_id: string;
  expires_in: number;
  resend_after: number;
};
export type Category = { id: string; name: string; active: boolean };
export type Course = Category & { college_ids: string[]; aliases: string[] };
export type Grade = 1 | 2 | 3 | 4;
export type Semester = "first" | "second";
export type Sort = "latest" | "year_desc" | "popular";
type Choice<T> = { value: T; label: string };
export type Catalog = {
  colleges: Category[];
  resource_types: Category[];
  grades: Choice<Grade>[];
  semesters: Choice<Semester>[];
  years?: number[];
};
export type Page<T> = {
  items: T[];
  total: number;
  page: number;
  page_size: number;
};
export type Attachment = {
  id: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  preview_supported: boolean;
  download_supported?: boolean;
};
export type FileAccess = {
  url: string;
  expires_at: string;
  filename: string;
  content_type: string;
  size_bytes: number;
};
export type ResourceSummary = {
  id: string;
  archive_code?: string;
  title: string;
  course: Category;
  colleges: Category[];
  grades: Grade[];
  semester: Semester | null;
  year: number | null;
  resource_type: Category;
  source: string | null;
  version: string | null;
  review_status: "pending" | "approved" | "rejected";
  safety_status: "checking" | "passed" | "failed";
  visibility: "published" | "hidden" | "withdrawn";
  file_count: number;
  files: Attachment[];
  download_count: number;
  created_at: string;
  updated_at: string;
};
export type ResourceDetail = ResourceSummary & {
  description: string | null;
  request_id: string | null;
};
export type Dashboard = {
  resource_count: number;
  pending_count: number;
  open_request_count: number;
};
export type RequestStatus = "open" | "completed" | "closed";
export type RequestItem = {
  id: string;
  archive_code?: string;
  title: string;
  description: string;
  status: RequestStatus;
  colleges: Category[];
  course: Category | null;
  resource_type: Category | null;
  grades: Grade[];
  semester: Semester | null;
  year: number | null;
  submission_count: number;
  created_at: string;
  updated_at: string;
};
export type UploadConfig = {
  max_file_size_bytes: number;
  allowed_extensions: string[];
  max_attachments: number;
};
export type UploadInit = {
  filename: string;
  size_bytes: number;
  content_type: string;
};
export type UploadPlan = {
  upload_id: string;
  method: "PUT" | "POST";
  url: string;
  headers: Record<string, string>;
  form_fields?: Record<string, string>;
  expires_at: string;
};
export type UploadState = {
  upload_id: string;
  status: "uploading" | "checking" | "ready" | "failed";
  file_id: string | null;
  filename: string;
  reason: string | null;
};
export type CreateResource = {
  title: string;
  college_ids: string[];
  course_id: string;
  type_id: string;
  grades: Grade[];
  semester: Semester | null;
  year: number | null;
  source: string | null;
  version: string | null;
  description: string | null;
  file_ids: string[];
  request_id: string | null;
  share_confirmed: true;
};

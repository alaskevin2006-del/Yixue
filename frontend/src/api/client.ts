import type {
  Catalog,
  Course,
  CreateResource,
  Dashboard,
  EmailChallenge,
  FileAccess,
  Page,
  ResourceDetail,
  ResourceSummary,
  RequestItem,
  UploadConfig,
  UploadInit,
  UploadPlan,
  UploadState,
  User,
} from "./types";

export const mockEnabled =
  import.meta.env.DEV && import.meta.env.VITE_ENABLE_MOCKS !== "false";
const base = "/api/v1";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

let onUnauthorized: (() => void) | undefined;

export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${base}${path}`, {
    credentials: "same-origin",
    ...options,
  });
  if (response.status === 401 && !path.startsWith("/auth/")) onUnauthorized?.();
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload || payload.code !== "OK") {
    const message =
      typeof payload?.message === "string"
        ? payload.message
        : "接口暂时无法访问，请重试。";
    throw new ApiError(
      response.status,
      message,
      typeof payload?.code === "string" ? payload.code : undefined,
    );
  }
  return payload.data;
}

function post<T>(
  path: string,
  data: unknown,
  extraHeaders?: Record<string, string>,
) {
  return request<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...extraHeaders },
    body: JSON.stringify(data),
  });
}

export const api = {
  async session(signal?: AbortSignal) {
    try {
      return await request<User>("/auth/me", { signal });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return null;
      throw error;
    }
  },
  logout: () => request<null>("/auth/logout", { method: "POST" }),
  startEmailLogin: (email: string, returnTo: string) =>
    post<EmailChallenge>("/auth/start", { email, return_to: returnTo }),
  verifyEmail: (challengeId: string, code: string) =>
    post<User>("/auth/verify", { challenge_id: challengeId, code }),
  catalog: (signal?: AbortSignal) => request<Catalog>("/catalog", { signal }),
  courses: (params: string, signal?: AbortSignal) =>
    request<Page<Course>>(`/courses?${params}`, { signal }),
  course: (id: string, signal?: AbortSignal) =>
    request<Course>(`/courses/${encodeURIComponent(id)}`, { signal }),
  resources: (params: string, signal?: AbortSignal) =>
    request<Page<ResourceSummary>>(`/resources?${params}`, { signal }),
  resource: (id: string, signal?: AbortSignal) =>
    request<ResourceDetail>(`/resources/${encodeURIComponent(id)}`, { signal }),
  requests: (params: string, signal?: AbortSignal) =>
    request<Page<RequestItem>>(`/requests?${params}`, { signal }),
  requestDetails: (id: string, signal?: AbortSignal) =>
    request<RequestItem>(`/requests/${encodeURIComponent(id)}`, { signal }),
  uploadConfig: (signal?: AbortSignal) =>
    request<UploadConfig>("/uploads/config", { signal }),
  planUpload: (file: UploadInit) => post<UploadPlan>("/uploads/presign", file),
  finishUpload: (id: string) =>
    post<UploadState>(`/uploads/${encodeURIComponent(id)}/complete`, {}),
  uploadState: (id: string, signal?: AbortSignal) =>
    request<UploadState>(`/uploads/${encodeURIComponent(id)}`, { signal }),
  cancelUpload: (id: string) =>
    request<null>(`/uploads/${encodeURIComponent(id)}`, { method: "DELETE" }),
  createResource: (fields: CreateResource, key: string) =>
    post<ResourceDetail>("/resources", fields, { "Idempotency-Key": key }),
  previewFile: (id: string, resourceId: string, signal?: AbortSignal) =>
    request<FileAccess>(
      `/files/${encodeURIComponent(id)}/preview?${new URLSearchParams({ resource_id: resourceId })}`,
      { signal, cache: "no-store" },
    ),
  downloadFile: (id: string, resourceId: string) =>
    request<FileAccess>(`/files/${encodeURIComponent(id)}/download`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resource_id: resourceId }),
      cache: "no-store",
    }),
  dashboard: (signal?: AbortSignal) =>
    request<Dashboard>("/admin/dashboard", { signal }),
};

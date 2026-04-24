import { buildApiUrl } from "@/lib/api";

export type AdminRole = "super_admin" | "operator";

export interface AdminProfile {
  id: string;
  login: string;
  role: AdminRole;
}

export interface AdminSession {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in_seconds: number;
  admin: AdminProfile;
}

export interface AdminRefreshResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in_seconds: number;
}

export interface StoredSession {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

export interface TemplateLayoutData {
  page_width: number;
  page_height: number;
  name_x: number;
  name_y: number;
  name_max_width: number;
  name_box_height: number;
  font_family: string;
  font_size: number;
  font_color_hex: string;
  text_align: string;
  vertical_align: string;
  auto_shrink: boolean;
  canvas?: TemplateCanvasData | null;
}

export interface TemplateCanvasData {
  version: number;
  layers: TemplateCanvasLayer[];
}

export interface TemplateCanvasLayer {
  id: string;
  name: string;
  kind: "text" | "image";
  role?: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  visible: boolean;
  locked: boolean;
  text?: TemplateCanvasTextLayer | null;
  image?: TemplateCanvasImageLayer | null;
}

export interface TemplateCanvasTextLayer {
  content: string;
  binding?: string | null;
  font_family: string;
  font_size: number;
  font_color_hex: string;
  text_align: string;
  vertical_align: string;
  auto_shrink: boolean;
  font_weight: number;
  letter_spacing: number;
  line_height: number;
  background_color_hex?: string | null;
}

export interface TemplateCanvasImageLayer {
  src: string;
  fit: "fill" | "contain" | "cover";
  border_radius: number;
}

export interface TemplateSummary {
  id: string;
  name: string;
  source_kind: string;
  is_active: boolean;
  has_layout: boolean;
  category_count: number;
  participant_count: number;
  issued_count: number;
  created_at: string;
  updated_at: string;
}

export interface TemplateDetail {
  template: TemplateSummary;
  layout: TemplateLayoutData | null;
  categories: CategorySummary[];
}

export interface CategorySummary {
  id: string;
  template_id: string;
  name: string;
  slug: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type CertificateStatus = "not_created" | "queued" | "processing" | "completed" | "failed";

export interface ParticipantSummary {
  id: string;
  event_code: string;
  email: string;
  full_name: string;
  category: string | null;
  imported_at: string;
  certificate_status: CertificateStatus;
  certificate_id: string | null;
  attempts: number | null;
  last_error: string | null;
}

export interface GenerationProgress {
  total: number;
  not_created: number;
  queued: number;
  processing: number;
  completed: number;
  failed: number;
}

export interface ParticipantListResponse {
  items: ParticipantSummary[];
  total: number;
  page: number;
  page_size: number;
}

export interface ImportError {
  row_number: number;
  email: string;
  message: string;
}

export interface ImportResponse {
  total_rows: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors: ImportError[];
}

const ACCESS_TOKEN_KEY = "decentra_admin_access_token";
const REFRESH_TOKEN_KEY = "decentra_admin_refresh_token";
const EXPIRES_AT_KEY = "decentra_admin_expires_at";
const PROFILE_KEY = `${ACCESS_TOKEN_KEY}:profile`;
const JSON_HEADERS = { "Content-Type": "application/json" };

type CategoryPayload = {
  name: string;
  description?: string | null;
  is_active: boolean;
};

export function getStoredSession(): StoredSession | null {
  if (typeof window === "undefined") {
    return null;
  }

  const accessToken = window.localStorage.getItem(ACCESS_TOKEN_KEY);
  const refreshToken = window.localStorage.getItem(REFRESH_TOKEN_KEY);
  const expiresAtRaw = window.localStorage.getItem(EXPIRES_AT_KEY);
  if (!accessToken || !refreshToken) {
    return null;
  }

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_at: expiresAtRaw ? Number(expiresAtRaw) : 0,
  };
}

export function hasAdminSession() {
  return getStoredSession() !== null;
}

export function setAdminSession(
  session: AdminSession | AdminRefreshResponse,
  profile?: AdminProfile,
) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(ACCESS_TOKEN_KEY, session.access_token);
  if ("refresh_token" in session) {
    window.localStorage.setItem(REFRESH_TOKEN_KEY, session.refresh_token);
  }

  const expiresAt = Date.now() + session.expires_in_seconds * 1000;
  window.localStorage.setItem(EXPIRES_AT_KEY, String(expiresAt));

  if (profile) {
    window.localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  }

  window.dispatchEvent(new Event("auth:storage:change"));
}

export function getStoredAdminProfile(): AdminProfile | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(PROFILE_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as AdminProfile;
  } catch {
    return null;
  }
}

export function clearAdminSession() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  window.localStorage.removeItem(REFRESH_TOKEN_KEY);
  window.localStorage.removeItem(EXPIRES_AT_KEY);
  window.localStorage.removeItem(PROFILE_KEY);
}

export async function adminLogin(login: string, password: string) {
  const response = await fetch(buildApiUrl("/api/v1/admin/auth/login"), {
    body: JSON.stringify({ login, password }),
    headers: JSON_HEADERS,
    method: "POST",
  });
  const data = await parseJson<AdminSession>(response);
  return { response, data };
}

export async function adminLogout() {
  const session = getStoredSession();
  if (!session) {
    clearAdminSession();
    return;
  }

  await adminRequest(
    "/api/v1/admin/logout",
    {
      body: JSON.stringify({ refresh_token: session.refresh_token }),
      headers: JSON_HEADERS,
      method: "POST",
    },
    false,
  );

  clearAdminSession();
}

export async function fetchAdminMe() {
  return adminRequestJson<{ admin: AdminProfile }>("/api/v1/admin/me");
}

export async function fetchTemplates() {
  return adminRequestJson<TemplateDetail[]>("/api/v1/admin/templates");
}

export async function fetchTemplateCategories(templateId: string) {
  return adminRequestJson<CategorySummary[]>(`/api/v1/admin/templates/${templateId}/categories`);
}

export async function fetchAllCategories() {
  return adminRequestJson<CategorySummary[]>("/api/v1/admin/categories");
}

export async function createTemplateCategory(templateId: string, payload: CategoryPayload) {
  return postJson<CategorySummary>(`/api/v1/admin/templates/${templateId}/categories`, payload);
}

export async function updateTemplateCategory(
  templateId: string,
  categoryId: string,
  payload: CategoryPayload,
) {
  return patchJson<CategorySummary>(
    `/api/v1/admin/templates/${templateId}/categories/${categoryId}`,
    payload,
  );
}

export async function deleteTemplateCategory(templateId: string, categoryId: string) {
  return adminRequestJson<{ status: string }>(
    `/api/v1/admin/templates/${templateId}/categories/${categoryId}`,
    {
      method: "DELETE",
    },
  );
}

export async function fetchTemplate(id: string) {
  return adminRequestJson<TemplateDetail>(`/api/v1/admin/templates/${id}`);
}

export async function fetchTemplateSource(id: string) {
  return adminRequest(`/api/v1/admin/templates/${id}/source`);
}

export async function createTemplate(form: FormData) {
  return adminRequestJson<TemplateDetail>("/api/v1/admin/templates", {
    body: form,
    method: "POST",
  });
}

export async function updateTemplate(id: string, form: FormData) {
  return adminRequestJson<TemplateDetail>(`/api/v1/admin/templates/${id}`, {
    body: form,
    method: "PATCH",
  });
}

export async function activateTemplate(id: string) {
  return adminRequestJson<TemplateDetail>(`/api/v1/admin/templates/${id}/activate`, {
    method: "POST",
  });
}

export async function deactivateTemplate(id: string) {
  return adminRequestJson<TemplateDetail>(`/api/v1/admin/templates/${id}/deactivate`, {
    method: "POST",
  });
}

export async function deleteTemplate(id: string) {
  return adminRequestJson<{ status: string }>(`/api/v1/admin/templates/${id}`, {
    method: "DELETE",
  });
}

export async function saveTemplateLayout(id: string, layout: TemplateLayoutData) {
  return putJson<TemplateLayoutData>(`/api/v1/admin/templates/${id}/layout`, layout);
}

export async function previewTemplate(
  id: string,
  previewName: string,
  layout?: TemplateLayoutData,
) {
  return adminRequest(
    `/api/v1/admin/templates/${id}/preview`,
    jsonInit("POST", {
      preview_name: previewName,
      layout,
    }),
  );
}

export async function saveTemplateSnapshot(
  id: string,
  previewName: string,
  layout?: TemplateLayoutData,
) {
  return postJson<{ preview_path: string }>(`/api/v1/admin/templates/${id}/snapshot`, {
    preview_name: previewName,
    layout,
  });
}

export async function importParticipants(form: FormData) {
  return adminRequestJson<ImportResponse>("/api/v1/admin/participants/import", {
    body: form,
    method: "POST",
  });
}

export async function fetchParticipants(params: {
  category?: string;
  email?: string;
  eventCode?: string;
  page?: number;
  pageSize?: number;
}) {
  const url = new URL(buildApiUrl("/api/v1/admin/participants"));
  if (params.category) {
    url.searchParams.set("category", params.category);
  }
  if (params.email) {
    url.searchParams.set("email", params.email);
  }
  if (params.eventCode) {
    url.searchParams.set("event_code", params.eventCode);
  }
  url.searchParams.set("page", String(params.page ?? 1));
  url.searchParams.set("page_size", String(params.pageSize ?? 20));

  return adminRequestJson<ParticipantListResponse>(url.pathname + url.search);
}

export async function deleteParticipants(eventCode: string) {
  return adminRequestJson<{ status: string; deleted: number }>(
    `/api/v1/admin/participants?event_code=${encodeURIComponent(eventCode)}`,
    {
      method: "DELETE",
    },
  );
}

export async function fetchGenerationProgress(templateId: string) {
  return adminRequestJson<GenerationProgress>(
    `/api/v1/admin/templates/${templateId}/generation-progress`,
  );
}

export async function requeueCertificateIssue(issueId: string) {
  return adminRequestJson<{ status: string }>(
    `/api/v1/admin/certificate-issues/${issueId}/requeue`,
    { method: "POST" },
  );
}

export async function requeueFailedForTemplate(templateId: string) {
  return adminRequestJson<{ status: string; requeued: number }>(
    `/api/v1/admin/templates/${templateId}/requeue-failed`,
    { method: "POST" },
  );
}

export async function tryRefreshSession(): Promise<boolean> {
  const session = getStoredSession();
  if (!session?.refresh_token) {
    return false;
  }

  const refreshed = await refreshAdminSession(session.refresh_token);
  return refreshed !== null;
}

async function adminRequestJson<T>(
  path: string,
  init: RequestInit = {},
): Promise<{ response: Response; data: T | null }> {
  const response = await adminRequest(path, init);
  const data = await parseJson<T>(response);
  return { response, data };
}

async function adminRequest(path: string, init: RequestInit = {}, retry = true): Promise<Response> {
  const session = getStoredSession();
  const headers = new Headers(init.headers);
  if (session?.access_token) {
    headers.set("Authorization", `Bearer ${session.access_token}`);
  }

  const response = await fetch(buildApiUrl(path), {
    ...init,
    headers,
  });

  if (response.status !== 401 || !retry || !session?.refresh_token) {
    return response;
  }

  const refreshed = await refreshAdminSession(session.refresh_token);
  if (!refreshed) {
    window.dispatchEvent(new CustomEvent("auth:expired"));
    return response;
  }

  const retryHeaders = new Headers(init.headers);
  retryHeaders.set("Authorization", `Bearer ${refreshed.access_token}`);
  return fetch(buildApiUrl(path), {
    ...init,
    headers: retryHeaders,
  });
}

async function refreshAdminSession(refreshToken: string): Promise<AdminRefreshResponse | null> {
  const response = await fetch(buildApiUrl("/api/v1/admin/auth/refresh"), {
    body: JSON.stringify({ refresh_token: refreshToken }),
    headers: JSON_HEADERS,
    method: "POST",
  });

  const data = await parseJson<AdminRefreshResponse>(response);
  if (!response.ok || !data) {
    return null;
  }

  setAdminSession(data);
  return data;
}

function postJson<T>(path: string, payload: unknown) {
  return adminRequestJson<T>(path, jsonInit("POST", payload));
}

function patchJson<T>(path: string, payload: unknown) {
  return adminRequestJson<T>(path, jsonInit("PATCH", payload));
}

function putJson<T>(path: string, payload: unknown) {
  return adminRequestJson<T>(path, jsonInit("PUT", payload));
}

function jsonInit(method: string, payload: unknown): RequestInit {
  return {
    body: JSON.stringify(payload),
    headers: JSON_HEADERS,
    method,
  };
}

async function parseJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

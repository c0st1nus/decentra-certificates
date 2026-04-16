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

export interface IssuanceStatusResponse {
  enabled: boolean;
  has_active_template: boolean;
  active_template_name: string | null;
  participant_count: number;
  has_layout: boolean;
  ready_to_enable: boolean;
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
}

export interface FontFamilyOption {
  label: string;
  value: string;
}

export interface TemplateSummary {
  id: string;
  name: string;
  source_kind: string;
  is_active: boolean;
  has_layout: boolean;
  created_at: string;
  updated_at: string;
}

export interface TemplateDetail {
  template: TemplateSummary;
  layout: TemplateLayoutData | null;
}

export interface ParticipantSummary {
  id: string;
  event_code: string;
  email: string;
  full_name: string;
  category: string | null;
  imported_at: string;
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

export function getAdminSession(): AdminSession | null {
  if (typeof window === "undefined") {
    return null;
  }

  const accessToken = window.localStorage.getItem(ACCESS_TOKEN_KEY);
  const refreshToken = window.localStorage.getItem(REFRESH_TOKEN_KEY);
  if (!accessToken || !refreshToken) {
    return null;
  }

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: "Bearer",
    expires_in_seconds: 0,
    admin: {
      id: "",
      login: "",
      role: "operator",
    },
  };
}

export function hasAdminSession() {
  return getAdminSession() !== null;
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
  } else if (!window.localStorage.getItem(REFRESH_TOKEN_KEY)) {
    window.localStorage.removeItem(REFRESH_TOKEN_KEY);
  }

  if (profile) {
    window.localStorage.setItem(`${ACCESS_TOKEN_KEY}:profile`, JSON.stringify(profile));
  }
}

export function getStoredAdminProfile(): AdminProfile | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(`${ACCESS_TOKEN_KEY}:profile`);
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
  window.localStorage.removeItem(`${ACCESS_TOKEN_KEY}:profile`);
}

export async function adminLogin(login: string, password: string) {
  const response = await fetch(buildApiUrl("/api/v1/admin/auth/login"), {
    body: JSON.stringify({ login, password }),
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  const data = await parseJson<AdminSession>(response);
  return { response, data };
}

export async function adminLogout() {
  const session = getStoredSessionTokens();
  if (!session) {
    clearAdminSession();
    return;
  }

  await adminRequest(
    "/api/v1/admin/auth/logout",
    {
      body: JSON.stringify({ refresh_token: session.refresh_token }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    },
    false,
  );

  clearAdminSession();
}

export async function fetchAdminMe() {
  return adminRequestJson<{ admin: AdminProfile }>("/api/v1/admin/auth/me");
}

export async function fetchIssuanceStatus() {
  return adminRequestJson<IssuanceStatusResponse>("/api/v1/admin/issuance/status");
}

export async function updateIssuanceStatus(enabled: boolean) {
  return adminRequestJson<IssuanceStatusResponse>("/api/v1/admin/issuance/status", {
    body: JSON.stringify({ enabled }),
    headers: {
      "Content-Type": "application/json",
    },
    method: "PATCH",
  });
}

export async function fetchTemplates() {
  return adminRequestJson<TemplateDetail[]>("/api/v1/admin/templates");
}

export async function fetchTemplate(id: string) {
  return adminRequestJson<TemplateDetail>(`/api/v1/admin/templates/${id}`);
}

export async function fetchTemplateSource(id: string) {
  return adminRequest(`/api/v1/admin/templates/${id}/source`);
}

export async function fetchFontFamilies() {
  return adminRequestJson<FontFamilyOption[]>("/api/v1/admin/fonts");
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

export async function deleteTemplate(id: string) {
  return adminRequestJson<{ status: string }>(`/api/v1/admin/templates/${id}`, {
    method: "DELETE",
  });
}

export async function saveTemplateLayout(id: string, layout: TemplateLayoutData) {
  return adminRequestJson<TemplateLayoutData>(`/api/v1/admin/templates/${id}/layout`, {
    body: JSON.stringify(layout),
    headers: {
      "Content-Type": "application/json",
    },
    method: "PUT",
  });
}

export async function previewTemplate(
  id: string,
  previewName: string,
  layout?: TemplateLayoutData,
) {
  return adminRequest(`/api/v1/admin/templates/${id}/preview`, {
    body: JSON.stringify({
      preview_name: previewName,
      layout,
    }),
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
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

function getStoredSessionTokens() {
  if (typeof window === "undefined") {
    return null;
  }

  const accessToken = window.localStorage.getItem(ACCESS_TOKEN_KEY);
  const refreshToken = window.localStorage.getItem(REFRESH_TOKEN_KEY);
  if (!accessToken || !refreshToken) {
    return null;
  }

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
  };
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
  const session = getStoredSessionTokens();
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
    clearAdminSession();
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
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  const data = await parseJson<AdminRefreshResponse>(response);
  if (!response.ok || !data) {
    return null;
  }

  setAdminSession(data);
  return data;
}

async function parseJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

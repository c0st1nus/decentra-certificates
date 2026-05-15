import { type TelegramAuthPayload, buildApiUrl } from "@/lib/api";

export interface GameSession {
  access_token: string;
  expires_at: number;
}

export interface GameAuthResponse {
  access_token: string;
  expires_in_seconds?: number;
  user?: {
    id?: number;
    username?: string | null;
    avatar_url?: string | null;
  };
}

export interface GameStartResponse {
  id?: string;
  session_id?: string;
  nonce?: string;
}

export interface GameFinishResponse {
  status?: string;
  score?: number;
}

export interface GameHistoryItem {
  id: string;
  score: number;
  lines_cleared?: number | null;
  level?: number | null;
  duration_seconds?: number | null;
  created_at: string;
}

export interface GameProfileResponse {
  user?: {
    id?: string;
    username?: string | null;
    avatar_url?: string | null;
  };
  stats?: {
    games_played?: number;
    personal_best?: number;
    total_score?: number;
    total_lines_cleared?: number;
  };
  games?: GameHistoryItem[];
  recent_games?: GameHistoryItem[];
  personal_best?: number;
}

export interface LeaderboardEntry {
  user_id?: string;
  username: string;
  avatar_url?: string | null;
  score: number;
  rank?: number;
  games_played?: number;
  achieved_at?: string | null;
}

export interface LeaderboardResponse {
  items?: LeaderboardEntry[];
  leaders?: LeaderboardEntry[];
  leaderboard?: LeaderboardEntry[];
}

const ACCESS_TOKEN_KEY = "decentra_game_access_token";
const EXPIRES_AT_KEY = "decentra_game_expires_at";
const JSON_HEADERS = { "Content-Type": "application/json" };

export function getStoredGameSession(): GameSession | null {
  if (typeof window === "undefined") {
    return null;
  }

  const accessToken = window.localStorage.getItem(ACCESS_TOKEN_KEY);
  const expiresAtRaw = window.localStorage.getItem(EXPIRES_AT_KEY);
  const expiresAt = expiresAtRaw ? Number(expiresAtRaw) : 0;

  if (!accessToken) {
    return null;
  }

  if (expiresAt > 0 && expiresAt < Date.now()) {
    clearGameSession();
    return null;
  }

  return { access_token: accessToken, expires_at: expiresAt };
}

export function setGameSession(data: GameAuthResponse) {
  if (typeof window === "undefined") {
    return null;
  }

  const accessToken = data.access_token;
  if (!accessToken) {
    return null;
  }

  const expiresAt = Date.now() + (data.expires_in_seconds ?? 60 * 60 * 24) * 1000;
  window.localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  window.localStorage.setItem(EXPIRES_AT_KEY, String(expiresAt));
  window.dispatchEvent(new Event("game-auth:storage:change"));

  return { access_token: accessToken, expires_at: expiresAt };
}

export function clearGameSession() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  window.localStorage.removeItem(EXPIRES_AT_KEY);
  window.dispatchEvent(new Event("game-auth:storage:change"));
}

export async function authenticateGame(telegramAuth: TelegramAuthPayload) {
  const response = await fetch(buildApiUrl("/api/v1/game/auth"), {
    body: JSON.stringify({ telegram_auth: telegramAuth }),
    headers: JSON_HEADERS,
    method: "POST",
  });
  const data = await parseJson<GameAuthResponse>(response);
  return { response, data };
}

export async function startGameSession() {
  return gameRequestJson<GameStartResponse>("/api/v1/game/sessions/start", {
    headers: JSON_HEADERS,
    method: "POST",
  });
}

export async function finishGameSession(
  sessionId: string,
  payload: { score: number; lines_cleared: number; nonce: string },
) {
  return gameRequestJson<GameFinishResponse>(`/api/v1/game/sessions/${sessionId}/finish`, {
    body: JSON.stringify(payload),
    headers: JSON_HEADERS,
    method: "POST",
  });
}

export async function fetchGameProfile() {
  return gameRequestJson<GameProfileResponse>("/api/v1/game/me");
}

export async function fetchGameLeaderboard() {
  const response = await fetch(buildApiUrl("/api/v1/game/leaderboard"), {
    cache: "no-store",
  });
  const data = await parseJson<LeaderboardResponse | LeaderboardEntry[]>(response);
  return { response, data };
}

async function gameRequestJson<T>(
  path: string,
  init: RequestInit = {},
): Promise<{ response: Response; data: T | null }> {
  const session = getStoredGameSession();
  const headers = new Headers(init.headers);
  if (session?.access_token) {
    headers.set("Authorization", `Bearer ${session.access_token}`);
  }

  const response = await fetch(buildApiUrl(path), {
    ...init,
    headers,
  });

  if (response.status === 401) {
    clearGameSession();
  }

  const data = await parseJson<T>(response);
  return { response, data };
}

async function parseJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

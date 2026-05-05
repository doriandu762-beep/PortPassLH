import * as SecureStore from "expo-secure-store";
import type { Work, Stats, HistoryEntry, AuthUser } from "./types";

const BASE_URL = process.env.EXPO_PUBLIC_PORTPASS_BACKEND_URL as string;
const TOKEN_KEY = "portpass_session_token";

export async function getToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function setToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = await getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status}: ${body || res.statusText}`);
  }
  // Try JSON, fall back to text
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return (await res.json()) as T;
  return (await res.text()) as unknown as T;
}

// Public endpoints
export const getWorks = () => request<Work[]>("/api/works");
export const getStats = () => request<Stats>("/api/stats");
export const getHistory = (limit = 200) =>
  request<HistoryEntry[]>(`/api/history?limit=${limit}`);

// Auth
export interface SessionResponse {
  session_token?: string;
  access_token?: string;
  token?: string;
  user?: AuthUser;
  [key: string]: any;
}

export async function exchangeSession(
  sessionId: string,
): Promise<{ token: string; user: AuthUser }> {
  const res = await fetch(`${BASE_URL}/api/auth/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Auth failed (${res.status}): ${body || res.statusText}`);
  }

  // Try to read Set-Cookie for session_token (mobile fallback)
  const setCookie = res.headers.get("set-cookie") || "";
  const cookieMatch = /session_token=([^;]+)/i.exec(setCookie);

  const data: SessionResponse = await res.json();
  const token =
    data.session_token ||
    data.access_token ||
    data.token ||
    (cookieMatch ? cookieMatch[1] : "");

  if (!token) {
    throw new Error(
      "Le backend n'a pas renvoyé de session_token. Vérifiez l'implémentation.",
    );
  }

  const user: AuthUser = data.user || {
    email: data.email,
    name: data.name,
    picture: data.picture,
    user_id: data.user_id,
    is_admin: data.is_admin,
  };
  return { token, user };
}

export const getMe = () => request<AuthUser>("/api/auth/me");
export const logoutApi = () =>
  request<{ ok?: boolean }>("/api/auth/logout", { method: "POST" });

// Admin (kept for future use)
export const updateWorkStatus = (workId: string, status: string) =>
  request<Work>(`/api/works/${workId}/status`, {
    method: "PUT",
    body: JSON.stringify({ status }),
  });

export const refreshWorks = () =>
  request<{ ok?: boolean }>("/api/works/refresh", { method: "POST" });

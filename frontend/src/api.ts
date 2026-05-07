import type { Work, Stats, HistoryEntry } from "./types";

const BASE_URL = process.env.EXPO_PUBLIC_PORTPASS_BACKEND_URL as string;

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status}: ${body || res.statusText}`);
  }
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return (await res.json()) as T;
  return (await res.text()) as unknown as T;
}

// Public endpoints — no authentication required
export const getWorks = () => request<Work[]>("/api/works");
export const getStats = () => request<Stats>("/api/stats");
export const getHistory = (limit = 200) =>
  request<HistoryEntry[]>(`/api/history?limit=${limit}`);

import { ATTIRE_API_BASE } from "./base";

const API_BASE = ATTIRE_API_BASE;

export function getToken() {
  return localStorage.getItem("sw_token") || "";
}

export function setToken(t: string) {
  if (t) localStorage.setItem("sw_token", t);
  else localStorage.removeItem("sw_token");
}

export async function api<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const token = getToken();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(opts.headers as Record<string, string> || {}),
  };

  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers,
  });

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      msg = j?.detail || msg;
    } catch {}
    throw new Error(msg);
  }

  return res.json();
}
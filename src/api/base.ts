const clean = (url?: string) => url?.replace(/\/$/, "");

export const LOSTFOUND_API_BASE =
  clean(import.meta.env.VITE_LOSTFOUND_API_BASE_URL) ||
  (import.meta.env.DEV ? "http://127.0.0.1:8000" : "");

export const ATTIRE_API_BASE =
  clean(import.meta.env.VITE_ATTIRE_API_BASE_URL) ||
  (import.meta.env.DEV ? "http://127.0.0.1:8001" : "");

export function resolveLostFoundUrl(url?: string | null) {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  return `${LOSTFOUND_API_BASE}${url.startsWith("/") ? "" : "/"}${url}`;
}

export function resolveAttireUrl(url?: string | null) {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  return `${ATTIRE_API_BASE}${url.startsWith("/") ? "" : "/"}${url}`;
}
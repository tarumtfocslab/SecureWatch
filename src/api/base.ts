const clean = (v?: string) => (v || "").trim().replace(/\/+$/, "");

const env = (import.meta as any).env || {};

export const LOSTFOUND_API_BASE = clean(env.VITE_LOSTFOUND_API_BASE_URL);
export const ATTIRE_API_BASE = clean(env.VITE_ATTIRE_API_BASE_URL);
export const LEGACY_API_BASE = clean(env.VITE_API_BASE_URL);

export function getApiBase(mode: "lost-found" | "attire") {
  if (mode === "lost-found") {
    return LOSTFOUND_API_BASE || LEGACY_API_BASE || "";
  }
  return ATTIRE_API_BASE || LEGACY_API_BASE || "";
}

export function resolveApiUrl(
  mode: "lost-found" | "attire",
  url?: string | null
) {
  if (!url) return "";

  const s = String(url).trim();
  if (!s) return "";

  const base = getApiBase(mode);

  // convert localhost backend URL to production backend URL
  if (/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//i.test(s)) {
    if (!base) return s;
    try {
      const u = new URL(s);
      return `${base}${u.pathname}${u.search}`;
    } catch {
      return s;
    }
  }

  // already absolute non-localhost URL
  if (/^https?:\/\//i.test(s)) {
    return s;
  }

  // relative path
  if (!base) return s;
  return `${base}${s.startsWith("/") ? "" : "/"}${s}`;
}

export function resolveLostFoundUrl(url?: string | null) {
  return resolveApiUrl("lost-found", url);
}

export function resolveAttireUrl(url?: string | null) {
  return resolveApiUrl("attire", url);
}
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  RefreshCw,
  CheckCircle2,
  Trash2,
  StickyNote,
  Download,
  X,
  Image as ImageIcon,
  Filter,
  Clock,
} from "lucide-react";
import {
  LOSTFOUND_API_BASE,
  buildApiUrl,
  resolveLostFoundUrl,
} from "../api/base";

const MAX_VISIBLE_ITEMS = 300;

type LostFoundItem = {
  id: string;
  module?: string;
  source?: string;
  cameraId?: string;
  videoId?: string;
  location?: string;
  label?: string;
  status?: "lost" | "solved" | string;
  firstSeenTs?: number;
  lastSeenTs?: number;
  imageUrl?: string | null;
  notes?: string;
  updatedAt?: number;
  raw?: any;
};

type LostFoundRetentionSettings = {
  data_retention_enabled?: boolean;
  data_retention_days?: number;
};

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function fmtTs(ts?: number) {
  const t = Number(ts || 0);
  if (!t) return "-";
  const ms = t > 2_000_000_000_000 ? t : t * 1000;
  return new Date(ms).toLocaleString();
}

function isLost(x: LostFoundItem) {
  return (x.status || "lost").toLowerCase().includes("lost");
}

function isSolved(x: LostFoundItem) {
  return (x.status || "").toLowerCase().includes("solv");
}

function getItemSortTs(it: any): number {
  const rawTs =
    it?.lastSeenTs ??
    it?.last_seen_ts ??
    it?.firstSeenTs ??
    it?.first_seen_ts ??
    it?.updatedAt ??
    it?.updated_at ??
    0;

  const t = Number(rawTs || 0);
  if (!t) return 0;

  return t > 2_000_000_000_000 ? t : t * 1000;
}

async function apiGetItems(signal?: AbortSignal): Promise<LostFoundItem[]> {
  const res = await fetch(buildApiUrl(LOSTFOUND_API_BASE, "/api/lostfound/items"), {
    signal,
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Failed to load items");

  const js = await res.json();
  const rawItems: any[] = Array.isArray(js?.items)
    ? js.items
    : Array.isArray(js)
    ? js
    : [];

  return rawItems
    .filter((it) => it && typeof it === "object" && it.id != null)
    .sort((a, b) => getItemSortTs(b) - getItemSortTs(a))
    .slice(0, MAX_VISIBLE_ITEMS)
    .map((it: any) => {
      const rawImageUrl = it.imageUrl ?? it.image_url ?? null;

      return {
        ...it,
        id: String(it.id),
        label: it.label ? String(it.label) : "Unknown",
        location: it.location ? String(it.location) : "Unknown",
        status: (it.status || "lost") as any,
        source: it.source ? String(it.source) : "unknown",
        cameraId: it.cameraId ?? it.camera_id ?? undefined,
        videoId: it.videoId ?? it.video_id ?? undefined,
        firstSeenTs:
          typeof it.firstSeenTs === "number"
            ? it.firstSeenTs
            : typeof it.first_seen_ts === "number"
            ? it.first_seen_ts
            : undefined,
        lastSeenTs:
          typeof it.lastSeenTs === "number"
            ? it.lastSeenTs
            : typeof it.last_seen_ts === "number"
            ? it.last_seen_ts
            : undefined,
        updatedAt:
          typeof it.updatedAt === "number"
            ? it.updatedAt
            : typeof it.updated_at === "number"
            ? it.updated_at
            : undefined,
        imageUrl:
          typeof rawImageUrl === "string" && rawImageUrl.trim()
            ? resolveLostFoundUrl(rawImageUrl.trim())
            : null,
        notes: it.notes ?? "",
        raw: it,
      };
    });
}

async function apiGetRetentionSettings(): Promise<LostFoundRetentionSettings> {
  const res = await fetch(
    buildApiUrl(LOSTFOUND_API_BASE, "/api/lostfound/settings"),
    { cache: "no-store" }
  );
  if (!res.ok) throw new Error("Failed to load retention settings");
  const js = await res.json();
  return {
    data_retention_enabled:
      typeof js?.data_retention_enabled === "boolean"
        ? js.data_retention_enabled
        : true,
    data_retention_days: Number(js?.data_retention_days ?? 90) || 90,
  };
}

async function apiSolve(itemId: string) {
  const res = await fetch(
    buildApiUrl(
      LOSTFOUND_API_BASE,
      `/api/lostfound/item/${encodeURIComponent(itemId)}/solve`
    ),
    { method: "POST" }
  );
  if (!res.ok) throw new Error("Solve failed");
  return res.json();
}

async function apiUpdateNotes(itemId: string, notes: string) {
  const res = await fetch(
    buildApiUrl(
      LOSTFOUND_API_BASE,
      `/api/lostfound/item/${encodeURIComponent(itemId)}/update`
    ),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes }),
    }
  );
  if (!res.ok) throw new Error("Update notes failed");
  return res.json();
}

async function apiDelete(itemId: string) {
  const res = await fetch(
    buildApiUrl(
      LOSTFOUND_API_BASE,
      `/api/lostfound/item/${encodeURIComponent(itemId)}`
    ),
    { method: "DELETE" }
  );
  if (!res.ok) throw new Error("Delete failed");
  return res.json();
}

function downloadBlob(filename: string, data: Blob) {
  const url = URL.createObjectURL(data);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function apiExportCsv(params: {
  q?: string;
  status?: string;
  source?: string;
  label?: string;
  location?: string;
}) {
  const usp = new URLSearchParams();
  if (params.q) usp.set("q", params.q);
  if (params.status) usp.set("status", params.status);
  if (params.source) usp.set("source", params.source);
  if (params.label) usp.set("label", params.label);
  if (params.location) usp.set("location", params.location);

  const res = await fetch(
    buildApiUrl(
      LOSTFOUND_API_BASE,
      `/api/lostfound/items/export.csv?${usp.toString()}`
    )
  );
  if (!res.ok) throw new Error("Export CSV failed");
  const blob = await res.blob();
  downloadBlob("lost_found_reports.csv", blob);
}

function Chip({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "red" | "green";
}) {
  const cls =
    tone === "red"
      ? "bg-rose-500/15 text-rose-200 ring-1 ring-rose-400/25"
      : tone === "green"
      ? "bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-400/25"
      : "bg-white/5 text-slate-200 ring-1 ring-white/10";
  return (
    <div className={`px-3 py-1 rounded-full text-xs ${cls}`}>{children}</div>
  );
}

function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-[min(1400px,96vw)] h-[92vh] overflow-hidden rounded-2xl bg-slate-900 ring-1 ring-white/10 shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <div className="text-slate-100 font-semibold">{title}</div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/10 text-slate-200"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 h-[calc(92vh-56px)] overflow-auto">{children}</div>
      </div>
    </div>
  );
}

export default function LostAndFoundEventsPage() {
  const [items, setItems] = useState<LostFoundItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [retentionSettings, setRetentionSettings] =
    useState<LostFoundRetentionSettings>({
      data_retention_enabled: true,
      data_retention_days: 90,
    });

  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "lost" | "solved">(
    "all"
  );
  const [sourceFilter, setSourceFilter] = useState<
    "all" | "live" | "upload" | "offline"
  >("all");
  const [labelFilter, setLabelFilter] = useState<string>("all");
  const [locationFilter, setLocationFilter] = useState<string>("all");

  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshSec, setRefreshSec] = useState(2);

  const [imgOpen, setImgOpen] = useState(false);
  const [imgUrl, setImgUrl] = useState<string>("");
  const [imgTitle, setImgTitle] = useState<string>("Evidence");
  const [zoom, setZoom] = useState(1);

  const [notesOpen, setNotesOpen] = useState(false);
  const [notesItem, setNotesItem] = useState<LostFoundItem | null>(null);
  const [notesDraft, setNotesDraft] = useState("");

  const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({});

  const abortRef = useRef<AbortController | null>(null);

  async function loadRetentionSettings() {
    try {
      const st = await apiGetRetentionSettings();
      setRetentionSettings({
        data_retention_enabled:
          typeof st?.data_retention_enabled === "boolean"
            ? st.data_retention_enabled
            : true,
        data_retention_days: Number(st?.data_retention_days ?? 90) || 90,
      });
    } catch {
      setRetentionSettings({
        data_retention_enabled: true,
        data_retention_days: 90,
      });
    }
  }

  async function load() {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setLoading(true);
    setErr(null);
    try {
      const data = await apiGetItems(ac.signal);

      console.log("[EVENT FRONTEND] RAW FETCH COUNT =", data.length);
      console.log(
        "[EVENT FRONTEND] RAW LOST =",
        data.filter((x) => (x.status || "lost").toLowerCase().includes("lost")).length
      );
      console.log(
        "[EVENT FRONTEND] RAW SOLVED =",
        data.filter((x) => (x.status || "").toLowerCase().includes("solv")).length
      );
      console.log(
        "[EVENT FRONTEND] SAMPLE ITEMS =",
        data.slice(0, 5).map((x) => ({
          id: x.id,
          status: x.status,
          firstSeenTs: x.firstSeenTs,
          lastSeenTs: x.lastSeenTs,
          location: x.location,
          label: x.label,
        }))
      );

      setItems(data);

      setBrokenImages((prev) => {
        const visibleIds = new Set(data.map((x) => x.id));
        const next: Record<string, boolean> = {};
        for (const [k, v] of Object.entries(prev)) {
          if (visibleIds.has(k)) next[k] = v;
        }
        return next;
      });

      await loadRetentionSettings();
    } catch (e: any) {
      if (String(e?.name || "") !== "AbortError") {
        setErr(e?.message || "Failed to load");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;
    const sec = clamp(Number(refreshSec || 2), 1, 30);
    const t = setInterval(() => load(), sec * 1000);
    return () => clearInterval(t);
  }, [autoRefresh, refreshSec]);

  const labels = useMemo(() => {
    const s = new Set<string>();
    for (const it of items) {
      if (it.label) s.add(it.label);
    }
    return ["all", ...Array.from(s).sort((a, b) => a.localeCompare(b))];
  }, [items]);

  const locations = useMemo(() => {
    const s = new Set<string>();
    for (const it of items) {
      if (it.location) s.add(it.location);
    }
    return ["all", ...Array.from(s).sort((a, b) => a.localeCompare(b))];
  }, [items]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();

    const retentionEnabled =
      typeof retentionSettings?.data_retention_enabled === "boolean"
        ? retentionSettings.data_retention_enabled
        : true;

    const retentionDays = clamp(
      Number(retentionSettings?.data_retention_days ?? 90) || 90,
      1,
      3650
    );

    useEffect(() => {
      console.log("[EVENT FRONTEND] FILTERED COUNT =", filtered.length);
      console.log(
        "[EVENT FRONTEND] FILTERED LOST =",
        filtered.filter((x) => (x.status || "lost").toLowerCase().includes("lost")).length
      );
      console.log(
        "[EVENT FRONTEND] FILTERED SOLVED =",
        filtered.filter((x) => (x.status || "").toLowerCase().includes("solv")).length
      );
    }, [filtered]);

    const cutoffMs = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

    return items.filter((it) => {
      if (retentionEnabled) {
        const tsRaw =
          it.lastSeenTs ??
          it.firstSeenTs ??
          it.updatedAt ??
          (typeof it.raw?.lastSeenTs === "number"
            ? it.raw.lastSeenTs
            : undefined) ??
          (typeof it.raw?.firstSeenTs === "number"
            ? it.raw.firstSeenTs
            : undefined) ??
          (typeof it.raw?.updatedAt === "number"
            ? it.raw.updatedAt
            : undefined) ??
          (typeof it.raw?.updated_at === "number"
            ? it.raw.updated_at
            : undefined);

        if (typeof tsRaw === "number" && tsRaw > 0) {
          const tsMs = tsRaw > 2_000_000_000_000 ? tsRaw : tsRaw * 1000;
          if (tsMs < cutoffMs) return false;
        }
      }

      if (statusFilter === "lost" && !isLost(it)) return false;
      if (statusFilter === "solved" && !isSolved(it)) return false;

      const src = (it.source || "").toLowerCase();
      if (sourceFilter !== "all") {
        if (sourceFilter === "offline") {
          const looksOffline = !!it.videoId && !it.cameraId;
          if (!looksOffline && src !== "offline") return false;
        } else if (src !== sourceFilter) {
          if (!(sourceFilter === "upload" && src === "offline")) return false;
        }
      }

      if (labelFilter !== "all" && (it.label || "") !== labelFilter) {
        return false;
      }

      if (locationFilter !== "all" && (it.location || "") !== locationFilter) {
        return false;
      }

      if (!qq) return true;

      const hay = [
        it.id,
        it.label,
        it.location,
        it.cameraId,
        it.videoId,
        it.source,
        it.status,
        it.notes,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return hay.includes(qq);
    });
  }, [
    items,
    q,
    statusFilter,
    sourceFilter,
    labelFilter,
    locationFilter,
    retentionSettings,
  ]);

  const counts = useMemo(() => {
    const lost = filtered.filter(isLost).length;
    const solved = filtered.filter(isSolved).length;
    return { total: filtered.length, lost, solved };
  }, [filtered]);

  async function onSolve(it: LostFoundItem) {
    try {
      await apiSolve(it.id);
      await load();
    } catch (e: any) {
      alert(e?.message || "Solve failed");
    }
  }

  async function onDelete(it: LostFoundItem) {
    const ok = confirm("Hide this item from the Events page? It will remain in history for reports.");
    if (!ok) return;
    try {
      await apiDelete(it.id);
      await load();
    } catch (e: any) {
      alert(e?.message || "Delete failed");
    }
  }

  function openNotes(it: LostFoundItem) {
    setNotesItem(it);
    setNotesDraft(String(it.notes || ""));
    setNotesOpen(true);
  }

  async function saveNotes() {
    if (!notesItem) return;
    try {
      await apiUpdateNotes(notesItem.id, notesDraft);
      setNotesOpen(false);
      setNotesItem(null);
      await load();
    } catch (e: any) {
      alert(e?.message || "Update notes failed");
    }
  }

  function openImage(it: LostFoundItem) {
    const url = String(it.imageUrl || "");
    if (!url || brokenImages[it.id]) return;
    setImgUrl(url);
    setImgTitle(`${it.label || "Evidence"} • ${it.location || ""}`);
    setZoom(2);
    setImgOpen(true);
  }

  return (
    <div className="min-h-screen bg-[#0b1220] text-slate-100">
      <div className="w-full px-6 py-6">
        <div className="text-slate-300 text-sm mb-3">
          View, search, solve, add notes, export CSV.
        </div>

        <div className="rounded-2xl bg-[#0e1627]/70 ring-1 ring-white/10 shadow-[0_10px_40px_rgba(0,0,0,0.35)] p-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-4 top-3.5 text-slate-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={`Search within latest ${MAX_VISIBLE_ITEMS} items (id / label / location / cameraId / notes...)`}
                className="w-full pl-10 pr-4 py-2.5 rounded-full bg-[#0b1220] ring-1 ring-white/10 focus:ring-white/20 outline-none text-sm placeholder:text-slate-500"
              />
            </div>

            <div className="flex items-center gap-2 text-sm">
              <div className="hidden md:flex items-center gap-2 px-3 py-2 rounded-full bg-[#0b1220] ring-1 ring-white/10 text-slate-300">
                <Filter className="w-4 h-4 text-slate-400" />
                <span>Filters</span>
              </div>

              <div className="flex items-center gap-2 px-3 py-2 rounded-full bg-[#0b1220] ring-1 ring-white/10">
                <span className="text-slate-400 text-xs">Auto</span>
                <button
                  onClick={() => setAutoRefresh((v) => !v)}
                  className={
                    "px-2.5 py-1 rounded-lg text-xs font-semibold ring-1 transition " +
                    (autoRefresh
                      ? "bg-emerald-500/15 text-emerald-200 ring-emerald-400/30"
                      : "bg-rose-500/15 text-rose-200 ring-rose-400/30")
                  }
                >
                  {autoRefresh ? "ON" : "OFF"}
                </button>
              </div>

              <div className="flex items-center gap-2 px-3 py-2 rounded-full bg-[#0b1220] ring-1 ring-white/10">
                <Clock className="w-4 h-4 text-slate-400" />
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={refreshSec}
                  onChange={(e) => setRefreshSec(Number(e.target.value || 2))}
                  className="w-12 bg-transparent outline-none text-slate-200 text-sm"
                  disabled={!autoRefresh}
                />
                <span className="text-slate-400 text-xs">sec</span>
              </div>

              <button
                onClick={load}
                className="px-3 py-2 rounded-full bg-[#0b1220] ring-1 ring-white/10 hover:ring-white/20 transition"
                title="Refresh"
              >
                <RefreshCw
                  className={`w-4 h-4 ${
                    loading ? "animate-spin" : ""
                  } text-slate-300`}
                />
              </button>

              <button
                onClick={() =>
                  apiExportCsv({
                    q: q.trim() || undefined,
                    status: statusFilter === "all" ? "" : statusFilter,
                    source: sourceFilter === "all" ? "" : sourceFilter,
                    label: labelFilter === "all" ? "" : labelFilter,
                    location: locationFilter === "all" ? "" : locationFilter,
                  })
                }
                className="hidden lg:inline-flex items-center gap-2 px-4 py-2 rounded-full bg-sky-500/15 hover:bg-sky-500/20 ring-1 ring-sky-400/25 text-sky-200 transition"
              >
                <Download className="w-4 h-4" />
                Export CSV
              </button>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 md:grid-cols-4 gap-3">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="px-4 py-2.5 rounded-full bg-[#0b1220] ring-1 ring-white/10 text-sm outline-none hover:ring-white/20 transition"
            >
              <option value="all">Status: All</option>
              <option value="lost">Status: Lost</option>
              <option value="solved">Status: Solved</option>
            </select>

            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value as any)}
              className="px-4 py-2.5 rounded-full bg-[#0b1220] ring-1 ring-white/10 text-sm outline-none hover:ring-white/20 transition"
            >
              <option value="all">Source: All</option>
              <option value="live">Source: Live</option>
              <option value="upload">Source: Upload/Offline</option>
              <option value="offline">Source: Offline</option>
            </select>

            <select
              value={labelFilter}
              onChange={(e) => setLabelFilter(e.target.value)}
              className="px-4 py-2.5 rounded-full bg-[#0b1220] ring-1 ring-white/10 text-sm outline-none hover:ring-white/20 transition"
            >
              {labels.map((x) => (
                <option key={x} value={x}>
                  {x === "all" ? "Label: All" : `Label: ${x}`}
                </option>
              ))}
            </select>

            <select
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              className="px-4 py-2.5 rounded-full bg-[#0b1220] ring-1 ring-white/10 text-sm outline-none hover:ring-white/20 transition"
            >
              {locations.map((x) => (
                <option key={x} value={x}>
                  {x === "all" ? "Location: All" : `Location: ${x}`}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <Chip>{counts.total} visible items</Chip>
            <Chip tone="red">{counts.lost} lost</Chip>
            <Chip tone="green">{counts.solved} solved</Chip>
            <Chip>Window: latest {MAX_VISIBLE_ITEMS}</Chip>

            <Chip>
              Retention:{" "}
              {retentionSettings.data_retention_enabled === false
                ? "OFF"
                : `${Number(retentionSettings.data_retention_days ?? 90)} days`}
            </Chip>

            <div className="flex-1" />

            <button
              onClick={() =>
                apiExportCsv({
                  q: q.trim() || undefined,
                  status: statusFilter === "all" ? "" : statusFilter,
                  source: sourceFilter === "all" ? "" : sourceFilter,
                  label: labelFilter === "all" ? "" : labelFilter,
                  location: locationFilter === "all" ? "" : locationFilter,
                })
              }
              className="lg:hidden inline-flex items-center gap-2 px-4 py-2 rounded-full bg-sky-500/15 hover:bg-sky-500/20 ring-1 ring-sky-400/25 text-sky-200 transition"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>

            {err ? (
              <span className="text-rose-300 text-sm ml-2">{err}</span>
            ) : null}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((it) => {
            const statusLost = isLost(it);
            const canShowImage = !!it.imageUrl && !brokenImages[it.id];

            return (
              <div
                key={it.id}
                className="rounded-2xl bg-[#0e1627]/70 ring-1 ring-white/10 shadow-[0_10px_40px_rgba(0,0,0,0.35)] overflow-hidden"
              >
                <div className="flex gap-4 p-5">
                  <div className="w-44 shrink-0">
                    <div className="relative w-44 h-28 rounded-2xl bg-[#07101f] ring-1 ring-white/10 overflow-hidden flex items-center justify-center">
                      {canShowImage ? (
                        <>
                          <img
                            src={it.imageUrl as string}
                            className="w-full h-full object-contain"
                            alt={it.label || "evidence"}
                            loading="lazy"
                            decoding="async"
                            onError={() => {
                              setBrokenImages((prev) => ({
                                ...prev,
                                [it.id]: true,
                              }));
                            }}
                          />
                          <button
                            onClick={() => openImage(it)}
                            className="absolute inset-0 opacity-0 hover:opacity-100 transition bg-black/55 backdrop-blur-sm flex items-center justify-center"
                            title="View evidence"
                          >
                            <div className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/10 ring-1 ring-white/15">
                              <ImageIcon className="w-4 h-4" />
                              <span className="text-sm">Open</span>
                            </div>
                          </button>
                        </>
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs gap-2">
                          <ImageIcon className="w-4 h-4" />
                          No image
                        </div>
                      )}

                      <div className="absolute left-2 bottom-2 flex gap-2">
                        <span
                          className={
                            "px-2 py-0.5 rounded-full text-[11px] ring-1 " +
                            (statusLost
                              ? "bg-rose-500/20 text-rose-200 ring-rose-400/25"
                              : "bg-emerald-500/20 text-emerald-200 ring-emerald-400/25")
                          }
                        >
                          {statusLost ? "Lost" : "Solved"}
                        </span>

                        <span className="px-2 py-0.5 rounded-full text-[11px] ring-1 bg-sky-500/20 text-sky-200 ring-sky-400/25">
                          {(it.source || "unknown").toUpperCase()}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="text-lg font-semibold leading-tight">
                      {it.label || "Unknown"}
                    </div>
                    <div className="text-sm text-slate-200/90">
                      {it.location || "Unknown"}
                    </div>
                    <div className="text-xs text-slate-400 mt-1 line-clamp-2 break-all">
                      ID: {it.id}
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                      <div className="rounded-2xl bg-[#0b1220]/70 ring-1 ring-white/10 px-4 py-3">
                        <div className="text-xs text-slate-400">First Seen</div>
                        <div className="text-slate-200">
                          {fmtTs(it.firstSeenTs)}
                        </div>
                      </div>
                      <div className="rounded-2xl bg-[#0b1220]/70 ring-1 ring-white/10 px-4 py-3">
                        <div className="text-xs text-slate-400">Last Seen</div>
                        <div className="text-slate-200">
                          {fmtTs(it.lastSeenTs)}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 rounded-2xl bg-[#0b1220]/70 ring-1 ring-white/10 px-4 py-3">
                      <div className="text-xs text-slate-400">Notes</div>
                      <div className="text-sm text-slate-200 mt-0.5 whitespace-pre-wrap break-words">
                        {it.notes ? (
                          it.notes
                        ) : (
                          <span className="text-slate-500">No notes</span>
                        )}
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => openNotes(it)}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-white/5 hover:bg-white/10 ring-1 ring-white/10 text-sm transition"
                      >
                        <StickyNote className="w-4 h-4" />
                        Notes
                      </button>

                      <button
                        onClick={() => onSolve(it)}
                        disabled={!statusLost}
                        className={
                          "inline-flex items-center gap-2 px-4 py-2 rounded-2xl text-sm font-medium transition " +
                          (statusLost
                            ? "bg-emerald-600/40 hover:bg-emerald-600/55 ring-1 ring-emerald-400/25 text-emerald-100"
                            : "bg-white/5 ring-1 ring-white/10 text-slate-500 cursor-not-allowed")
                        }
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        Mark Solved
                      </button>

                      <button
                        onClick={() => onDelete(it)}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-rose-600/30 hover:bg-rose-600/45 ring-1 ring-rose-400/25 text-rose-100 text-sm transition"
                      >
                        <Trash2 className="w-4 h-4" />
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {filtered.length === 0 && (
          <div className="mt-6 rounded-2xl bg-white/5 ring-1 ring-white/10 p-8 text-center text-slate-300">
            No items found.
          </div>
        )}
      </div>

      <Modal open={imgOpen} onClose={() => setImgOpen(false)} title={imgTitle}>
        <div className="rounded-xl bg-black/30 ring-1 ring-white/10 h-[74vh] overflow-auto">
          <div className="sticky top-0 z-10 flex items-center justify-between gap-2 p-2 bg-slate-900/55 backdrop-blur border-b border-white/10">
            <div className="text-xs text-slate-300 truncate">{imgUrl}</div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() =>
                  setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))
                }
                className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 ring-1 ring-white/10 text-sm"
              >
                −
              </button>
              <div className="px-3 py-1.5 rounded-lg bg-white/5 ring-1 ring-white/10 text-sm text-slate-200">
                {Math.round(zoom * 100)}%
              </div>
              <button
                onClick={() =>
                  setZoom((z) => Math.min(4, +(z + 0.25).toFixed(2)))
                }
                className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 ring-1 ring-white/10 text-sm"
              >
                +
              </button>
              <a
                href={imgUrl}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 ring-1 ring-white/10 text-sm text-slate-200"
              >
                Open Original
              </a>
            </div>
          </div>

          <div className="min-h-[calc(74vh-52px)] flex items-center justify-center p-4">
            <img
              src={imgUrl}
              alt="Evidence"
              loading="eager"
              decoding="async"
              className="object-contain max-w-full max-h-full"
              style={{
                transform: `scale(${zoom})`,
                transformOrigin: "center",
              }}
            />
          </div>
        </div>
      </Modal>

      <Modal
        open={notesOpen}
        onClose={() => {
          setNotesOpen(false);
          setNotesItem(null);
        }}
        title={`Notes • ${notesItem?.label || ""}`}
      >
        <div className="text-sm text-slate-300 mb-2 break-all">
          Item ID: <span className="text-slate-200">{notesItem?.id || "-"}</span>
        </div>
        <textarea
          value={notesDraft}
          onChange={(e) => setNotesDraft(e.target.value)}
          rows={8}
          className="w-full px-3 py-2 rounded-xl bg-[#0b1220] ring-1 ring-white/10 outline-none text-sm"
          placeholder="Write notes (e.g., owner contacted, item stored at office...)"
        />
        <div className="mt-3 flex items-center justify-end gap-2">
          <button
            onClick={() => {
              setNotesOpen(false);
              setNotesItem(null);
            }}
            className="px-3 py-2 rounded-xl bg-white/8 hover:bg-white/12 ring-1 ring-white/10 text-sm transition"
          >
            Cancel
          </button>
          <button
            onClick={saveNotes}
            className="px-3 py-2 rounded-xl bg-sky-500/15 hover:bg-sky-500/20 ring-1 ring-sky-500/25 text-sky-200 text-sm transition"
          >
            Save Notes
          </button>
        </div>
      </Modal>
    </div>
  );
}
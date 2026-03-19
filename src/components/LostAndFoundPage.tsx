import { useEffect, useMemo, useState } from "react";
import {
  RefreshCw,
  Search,
  Filter,
  Image as ImageIcon,
  AlertCircle,
  CheckCircle2,
  Clock3,
  Camera,
  Wifi,
  HardDrive,
} from "lucide-react";
import { LOSTFOUND_API_BASE } from "../api/base";

type LostFoundItem = {
  id?: string | number;
  event_id?: string;
  source?: string;
  camera?: string;
  camera_id?: string;
  item_label?: string;
  label?: string;
  class_name?: string;
  status?: string;
  timestamp?: string;
  created_at?: string;
  event_time?: string;
  note?: string;
  notes?: string;
  image_url?: string;
  snapshot_url?: string;
  roi_name?: string;
  roi_id?: string | number;
  confidence?: number;
};

function apiUrl(path?: string) {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  return `${LOSTFOUND_API_BASE}${path.startsWith("/") ? "" : "/"}${path}`;
}

async function fetchLostFoundItems(): Promise<LostFoundItem[]> {
  const res = await fetch(apiUrl("/api/lostfound/items"), {
    headers: {
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to fetch items (${res.status}) ${text}`);
  }

  const data = await res.json();
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

function formatDateTime(value?: string) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

function getItemLabel(item: LostFoundItem) {
  return item.item_label || item.label || item.class_name || "Unknown Item";
}

function getTime(item: LostFoundItem) {
  return item.timestamp || item.created_at || item.event_time || "";
}

function statusBadgeClass(status?: string) {
  const s = String(status || "").toLowerCase();
  if (s === "solved") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (s === "lost") return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-slate-50 text-slate-700 border-slate-200";
}

function sourceBadge(item: LostFoundItem) {
  const s = String(item.source || "").toLowerCase();
  if (s === "live") {
    return {
      label: "Live",
      icon: <Wifi className="h-3.5 w-3.5" />,
      className: "bg-blue-50 text-blue-700 border-blue-200",
    };
  }
  if (s === "offline" || s === "upload") {
    return {
      label: "Offline",
      icon: <HardDrive className="h-3.5 w-3.5" />,
      className: "bg-purple-50 text-purple-700 border-purple-200",
    };
  }
  return {
    label: item.source || "-",
    icon: <Camera className="h-3.5 w-3.5" />,
    className: "bg-slate-50 text-slate-700 border-slate-200",
  };
}

export default function LostAndFoundEventsPage() {
  const [items, setItems] = useState<LostFoundItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  async function loadItems(showRefreshing = false) {
    try {
      setError("");
      if (showRefreshing) setRefreshing(true);
      else setLoading(true);

      const rows = await fetchLostFoundItems();
      setItems(rows);
    } catch (err: any) {
      setError(err?.message || "Failed to load events");
      setItems([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    loadItems(false);
  }, []);

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();

    return items.filter((item) => {
      const itemText = [
        getItemLabel(item),
        item.camera,
        item.camera_id,
        item.source,
        item.status,
        item.note,
        item.notes,
        item.roi_name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchesQuery = !q || itemText.includes(q);
      const matchesStatus =
        statusFilter === "all" ||
        String(item.status || "").toLowerCase() === statusFilter;
      const matchesSource =
        sourceFilter === "all" ||
        String(item.source || "").toLowerCase() === sourceFilter;

      return matchesQuery && matchesStatus && matchesSource;
    });
  }, [items, query, statusFilter, sourceFilter]);

  const summary = useMemo(() => {
    const total = items.length;
    const lost = items.filter(
      (x) => String(x.status || "").toLowerCase() === "lost"
    ).length;
    const solved = items.filter(
      (x) => String(x.status || "").toLowerCase() === "solved"
    ).length;
    const live = items.filter(
      (x) => String(x.source || "").toLowerCase() === "live"
    ).length;
    const offline = items.filter((x) => {
      const s = String(x.source || "").toLowerCase();
      return s === "offline" || s === "upload";
    }).length;

    return { total, lost, solved, live, offline };
  }, [items]);

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Lost &amp; Found Events
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              View detected lost item records from live and offline sources.
            </p>
          </div>

          <button
            onClick={() => loadItems(true)}
            disabled={refreshing}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw
              className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
            />
            Refresh
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-medium text-slate-500">Total</div>
            <div className="mt-2 text-2xl font-bold text-slate-900">
              {summary.total}
            </div>
          </div>

          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <div className="text-xs font-medium text-amber-700">Lost</div>
            <div className="mt-2 text-2xl font-bold text-amber-800">
              {summary.lost}
            </div>
          </div>

          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <div className="text-xs font-medium text-emerald-700">Solved</div>
            <div className="mt-2 text-2xl font-bold text-emerald-800">
              {summary.solved}
            </div>
          </div>

          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
            <div className="text-xs font-medium text-blue-700">Live</div>
            <div className="mt-2 text-2xl font-bold text-blue-800">
              {summary.live}
            </div>
          </div>

          <div className="rounded-2xl border border-purple-200 bg-purple-50 p-4">
            <div className="text-xs font-medium text-purple-700">Offline</div>
            <div className="mt-2 text-2xl font-bold text-purple-800">
              {summary.offline}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[1fr_180px_180px]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search item, camera, ROI, notes..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm outline-none ring-0 transition focus:border-slate-400"
            />
          </div>

          <div className="relative">
            <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full appearance-none rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm outline-none transition focus:border-slate-400"
            >
              <option value="all">All Status</option>
              <option value="lost">Lost</option>
              <option value="solved">Solved</option>
            </select>
          </div>

          <div className="relative">
            <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="w-full appearance-none rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm outline-none transition focus:border-slate-400"
            >
              <option value="all">All Sources</option>
              <option value="live">Live</option>
              <option value="offline">Offline</option>
              <option value="upload">Upload</option>
            </select>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <RefreshCw className="mx-auto h-6 w-6 animate-spin text-slate-400" />
          <p className="mt-3 text-sm text-slate-500">Loading events...</p>
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 shadow-sm">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 text-red-600" />
            <div>
              <h3 className="font-semibold text-red-700">Failed to load events</h3>
              <p className="mt-1 text-sm text-red-600">{error}</p>
            </div>
          </div>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <Clock3 className="mx-auto h-6 w-6 text-slate-400" />
          <p className="mt-3 text-sm text-slate-500">No events found.</p>
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
          {filteredItems.map((item, index) => {
            const imageSrc = item.image_url || item.snapshot_url;
            const source = sourceBadge(item);
            const label = getItemLabel(item);
            const itemKey = String(item.id ?? item.event_id ?? index);

            return (
              <div
                key={itemKey}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
              >
                <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-4">
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-semibold text-slate-900">
                      {label}
                    </h3>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${statusBadgeClass(
                          item.status
                        )}`}
                      >
                        {String(item.status || "").toLowerCase() === "solved" ? (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        ) : (
                          <AlertCircle className="h-3.5 w-3.5" />
                        )}
                        {item.status || "Unknown"}
                      </span>

                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${source.className}`}
                      >
                        {source.icon}
                        {source.label}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 p-4 md:grid-cols-[160px_1fr]">
                  <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                    {imageSrc ? (
                      <img
                        src={apiUrl(imageSrc)}
                        alt={label}
                        className="h-40 w-full cursor-pointer object-cover"
                        loading="lazy"
                        onClick={() => setSelectedImage(apiUrl(imageSrc))}
                        onError={(e) => {
                          const img = e.currentTarget;
                          img.style.display = "none";
                          const parent = img.parentElement;
                          if (parent) {
                            parent.innerHTML = `
                              <div class="flex h-40 items-center justify-center text-slate-400">
                                Image unavailable
                              </div>
                            `;
                          }
                        }}
                      />
                    ) : (
                      <div className="flex h-40 flex-col items-center justify-center gap-2 text-slate-400">
                        <ImageIcon className="h-6 w-6" />
                        <span className="text-xs">No image</span>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2 text-sm">
                    <div className="flex gap-2">
                      <span className="w-24 shrink-0 text-slate-500">Camera</span>
                      <span className="font-medium text-slate-800">
                        {item.camera || item.camera_id || "-"}
                      </span>
                    </div>

                    <div className="flex gap-2">
                      <span className="w-24 shrink-0 text-slate-500">ROI</span>
                      <span className="font-medium text-slate-800">
                        {item.roi_name || item.roi_id || "-"}
                      </span>
                    </div>

                    <div className="flex gap-2">
                      <span className="w-24 shrink-0 text-slate-500">Time</span>
                      <span className="font-medium text-slate-800">
                        {formatDateTime(getTime(item))}
                      </span>
                    </div>

                    <div className="flex gap-2">
                      <span className="w-24 shrink-0 text-slate-500">
                        Confidence
                      </span>
                      <span className="font-medium text-slate-800">
                        {typeof item.confidence === "number"
                          ? `${(item.confidence * 100).toFixed(1)}%`
                          : "-"}
                      </span>
                    </div>

                    <div className="pt-2">
                      <div className="mb-1 text-slate-500">Notes</div>
                      <div className="min-h-[52px] rounded-xl bg-slate-50 p-3 text-slate-700">
                        {item.note || item.notes || "No notes available"}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setSelectedImage(null)}
        >
          <div
            className="max-h-[90vh] max-w-[95vw] overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={selectedImage}
              alt="Selected evidence"
              className="max-h-[90vh] max-w-[95vw] object-contain"
            />
          </div>
        </div>
      )}
    </div>
  );
}
import { useEffect, useMemo, useState } from "react";
import {
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Clock3,
  TrendingUp,
  Wifi,
  HardDrive,
  Search,
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
    throw new Error(`Failed to fetch report data (${res.status}) ${text}`);
  }

  const data = await res.json();
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

function getItemLabel(item: LostFoundItem) {
  return item.item_label || item.label || item.class_name || "Unknown Item";
}

function getTime(item: LostFoundItem) {
  return item.timestamp || item.created_at || item.event_time || "";
}

function formatDateTime(value?: string) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

function formatDay(value?: string) {
  if (!value) return "Unknown";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Unknown";
  return d.toLocaleDateString();
}

export default function LostAndFoundReportsPage() {
  const [items, setItems] = useState<LostFoundItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  async function loadReportData(showRefreshing = false) {
    try {
      setError("");
      if (showRefreshing) setRefreshing(true);
      else setLoading(true);

      const rows = await fetchLostFoundItems();
      setItems(rows);
    } catch (err: any) {
      setError(err?.message || "Failed to load report data");
      setItems([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    loadReportData(false);
  }, []);

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;

    return items.filter((item) =>
      [
        getItemLabel(item),
        item.status,
        item.source,
        item.camera,
        item.camera_id,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [items, query]);

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

    const solveRate = total > 0 ? ((solved / total) * 100).toFixed(1) : "0.0";

    return {
      total,
      lost,
      solved,
      live,
      offline,
      solveRate,
    };
  }, [items]);

  const byItem = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of items) {
      const key = getItemLabel(item);
      map.set(key, (map.get(key) || 0) + 1);
    }
    return [...map.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [items]);

  const byDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of items) {
      const key = formatDay(getTime(item));
      map.set(key, (map.get(key) || 0) + 1);
    }
    return [...map.entries()]
      .map(([day, count]) => ({ day, count }))
      .sort((a, b) => {
        if (a.day === "Unknown") return 1;
        if (b.day === "Unknown") return -1;
        return new Date(b.day).getTime() - new Date(a.day).getTime();
      })
      .slice(0, 7);
  }, [items]);

  const recentItems = useMemo(() => {
    return [...filteredItems]
      .sort((a, b) => {
        const ta = new Date(getTime(a)).getTime() || 0;
        const tb = new Date(getTime(b)).getTime() || 0;
        return tb - ta;
      })
      .slice(0, 20);
  }, [filteredItems]);

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Lost &amp; Found Reports
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Overview and analytics for Lost &amp; Found events.
            </p>
          </div>

          <button
            onClick={() => loadReportData(true)}
            disabled={refreshing}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw
              className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
            />
            Refresh
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-medium text-slate-500">Total Events</div>
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
            <div className="text-xs font-medium text-blue-700">Live Source</div>
            <div className="mt-2 text-2xl font-bold text-blue-800">
              {summary.live}
            </div>
          </div>

          <div className="rounded-2xl border border-purple-200 bg-purple-50 p-4">
            <div className="text-xs font-medium text-purple-700">
              Offline Source
            </div>
            <div className="mt-2 text-2xl font-bold text-purple-800">
              {summary.offline}
            </div>
          </div>

          <div className="rounded-2xl border border-cyan-200 bg-cyan-50 p-4">
            <div className="text-xs font-medium text-cyan-700">Solve Rate</div>
            <div className="mt-2 text-2xl font-bold text-cyan-800">
              {summary.solveRate}%
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search reports table..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm outline-none transition focus:border-slate-400"
          />
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <RefreshCw className="mx-auto h-6 w-6 animate-spin text-slate-400" />
          <p className="mt-3 text-sm text-slate-500">Loading reports...</p>
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 shadow-sm">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 text-red-600" />
            <div>
              <h3 className="font-semibold text-red-700">
                Failed to load report data
              </h3>
              <p className="mt-1 text-sm text-red-600">{error}</p>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="grid gap-4 xl:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-slate-700" />
                <h2 className="text-lg font-semibold text-slate-900">
                  Top Detected Items
                </h2>
              </div>

              <div className="space-y-3">
                {byItem.length === 0 ? (
                  <p className="text-sm text-slate-500">No item data available.</p>
                ) : (
                  byItem.map((row) => {
                    const max = byItem[0]?.count || 1;
                    const width = `${(row.count / max) * 100}%`;

                    return (
                      <div key={row.name}>
                        <div className="mb-1 flex items-center justify-between text-sm">
                          <span className="font-medium text-slate-700">
                            {row.name}
                          </span>
                          <span className="text-slate-500">{row.count}</span>
                        </div>
                        <div className="h-2 rounded-full bg-slate-100">
                          <div
                            className="h-2 rounded-full bg-slate-800"
                            style={{ width }}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2">
                <Clock3 className="h-5 w-5 text-slate-700" />
                <h2 className="text-lg font-semibold text-slate-900">
                  Events by Day
                </h2>
              </div>

              <div className="space-y-3">
                {byDay.length === 0 ? (
                  <p className="text-sm text-slate-500">No date data available.</p>
                ) : (
                  byDay.map((row) => {
                    const max = byDay[0]?.count || 1;
                    const width = `${(row.count / max) * 100}%`;

                    return (
                      <div key={row.day}>
                        <div className="mb-1 flex items-center justify-between text-sm">
                          <span className="font-medium text-slate-700">
                            {row.day}
                          </span>
                          <span className="text-slate-500">{row.count}</span>
                        </div>
                        <div className="h-2 rounded-full bg-slate-100">
                          <div
                            className="h-2 rounded-full bg-cyan-600"
                            style={{ width }}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5 shadow-sm">
              <div className="flex items-center gap-2 text-blue-700">
                <Wifi className="h-5 w-5" />
                <h3 className="font-semibold">Live Monitoring</h3>
              </div>
              <p className="mt-3 text-sm text-blue-700/90">
                {summary.live} event(s) were detected from live camera streams.
              </p>
            </div>

            <div className="rounded-2xl border border-purple-200 bg-purple-50 p-5 shadow-sm">
              <div className="flex items-center gap-2 text-purple-700">
                <HardDrive className="h-5 w-5" />
                <h3 className="font-semibold">Offline / Upload</h3>
              </div>
              <p className="mt-3 text-sm text-purple-700/90">
                {summary.offline} event(s) were recorded from offline or uploaded
                sources.
              </p>
            </div>

            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
              <div className="flex items-center gap-2 text-emerald-700">
                <CheckCircle2 className="h-5 w-5" />
                <h3 className="font-semibold">Resolution Progress</h3>
              </div>
              <p className="mt-3 text-sm text-emerald-700/90">
                {summary.solved} out of {summary.total} event(s) are marked as
                solved.
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-slate-900">
              Recent Event Records
            </h2>

            {recentItems.length === 0 ? (
              <p className="text-sm text-slate-500">No records found.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-slate-500">
                      <th className="py-3 pr-4 font-medium">Item</th>
                      <th className="py-3 pr-4 font-medium">Status</th>
                      <th className="py-3 pr-4 font-medium">Source</th>
                      <th className="py-3 pr-4 font-medium">Camera</th>
                      <th className="py-3 pr-4 font-medium">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentItems.map((item, index) => {
                      const key = String(item.id ?? item.event_id ?? index);
                      const status = String(item.status || "").toLowerCase();

                      return (
                        <tr
                          key={key}
                          className="border-b border-slate-100 last:border-0"
                        >
                          <td className="py-3 pr-4 font-medium text-slate-800">
                            {getItemLabel(item)}
                          </td>

                          <td className="py-3 pr-4">
                            <span
                              className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                                status === "solved"
                                  ? "bg-emerald-50 text-emerald-700"
                                  : status === "lost"
                                  ? "bg-amber-50 text-amber-700"
                                  : "bg-slate-50 text-slate-700"
                              }`}
                            >
                              {item.status || "-"}
                            </span>
                          </td>

                          <td className="py-3 pr-4 text-slate-700">
                            {item.source || "-"}
                          </td>

                          <td className="py-3 pr-4 text-slate-700">
                            {item.camera || item.camera_id || "-"}
                          </td>

                          <td className="py-3 pr-4 text-slate-700">
                            {formatDateTime(getTime(item))}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
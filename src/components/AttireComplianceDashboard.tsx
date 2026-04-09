// AttireComplianceDashboard.tsx
import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Flame, Filter, Search, Video, VideoOff, ImageOff } from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { ATTIRE_API_BASE } from "../api/base";
import { getAttireDashboard } from "../api/attire";
import type { DashData } from "../api/attire";
import type { Camera } from "../App";

const API_BASE = ATTIRE_API_BASE;

type UploadedVideo = {
  id: string;
  name: string;
  uploadDate: string;
  size: string;
};

type RtspSource = { id: string; name: string; url: string; enabled?: boolean };

type SourceItem =
  | ({ kind: "offline" } & UploadedVideo)
  | ({ kind: "rtsp"; uploadDate?: string; size?: string } & RtspSource);

async function fetchUploadedVideos(): Promise<UploadedVideo[]> {
  const res = await fetch(`${API_BASE}/api/offline/videos`);
  if (!res.ok) throw new Error("Failed to load uploaded videos");
  return (await res.json()) as UploadedVideo[];
}

async function fetchRtspSources(): Promise<RtspSource[]> {
  const res = await fetch(`${API_BASE}/api/rtsp/sources`);
  if (!res.ok) throw new Error("Failed to load RTSP sources");
  const data = await res.json();
  return (data?.sources || []) as RtspSource[];
}

async function fetchEnabledSources(): Promise<Record<string, boolean>> {
  const res = await fetch(`${API_BASE}/api/attire/sources`);
  if (!res.ok) throw new Error("Failed to load enabled sources");
  const data = await res.json();
  return (data?.sources || {}) as Record<string, boolean>;
}

async function setSourceEnabled(videoId: string, enabled: boolean) {
  const res = await fetch(`${API_BASE}/api/attire/sources/${videoId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.detail || `HTTP ${res.status}`);
  return data;
}

function StatCard({
  icon,
  label,
  value,
  hint,
  valueClassName,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  hint?: string;
  valueClassName?: string;
}) {
  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-lg px-6 py-6 min-h-[150px] h-full flex">
      <div className="flex items-start gap-4 w-full">
        <div className="w-11 h-11 bg-slate-800/60 rounded-lg flex items-center justify-center shrink-0">
          {icon}
        </div>

        <div className="min-w-0 flex-1">
          <div className="text-slate-300 text-[15px]">{label}</div>

          <div
            className={
              "text-white font-semibold leading-tight mt-2 truncate " +
              (valueClassName ?? "text-[clamp(1.35rem,2.1vw,1.85rem)]")
            }
          >
            {value}
          </div>

          {hint && <div className="text-slate-400 text-sm mt-2 truncate">{hint}</div>}
        </div>
      </div>
    </div>
  );
}

function CameraTile({
  id,
  title,
  subtitle,
  selected,
  thumbUrl,
  enabled,
  onClick,
  onToggleEnabled,
}: {
  id: string;
  title: string;
  subtitle?: string;
  selected: boolean;
  thumbUrl: string | null;
  enabled: boolean;
  onClick: () => void;
  onToggleEnabled: () => void;
}) {
  const [imgFailed, setImgFailed] = React.useState(false);

  React.useEffect(() => {
    setImgFailed(false);
  }, [thumbUrl]);

  return (
    <button
      onClick={onClick}
      className={
        "group w-full text-left bg-slate-900/40 border rounded-xl overflow-hidden hover:bg-slate-900/55 transition " +
        (selected ? "border-blue-500/60 ring-1 ring-blue-500/30" : "border-slate-800")
      }
    >
      <div className="relative w-full bg-slate-950 h-[160px]">
        {thumbUrl && !imgFailed ? (
          <img
            src={thumbUrl}
            onError={() => setImgFailed(true)}
            className={[
              "absolute inset-0 w-full h-full object-cover object-center",
              "transition-all duration-200",
              enabled ? "" : "opacity-40",
            ].join(" ")}
            alt={title}
          />
        ) : (
          <div className="absolute inset-0 bg-slate-950 flex items-center justify-center">
            <div className="w-14 h-14 rounded-2xl bg-slate-900/90 border border-slate-700/60 flex items-center justify-center shadow-lg">
              <ImageOff className="w-7 h-7 text-slate-200" />
            </div>
          </div>
        )}

        <div className="absolute top-2 left-2 bg-black/60 text-white text-[11px] px-2 py-1 rounded-md tracking-wide">
          {id}
        </div>

        {!enabled && (
          <div className="absolute top-2 right-2 bg-red-600 border border-red-400 text-white text-[11px] font-semibold px-2.5 py-1 rounded-md shadow-md">
            OFF
          </div>
        )}

        <div
          className={[
            "absolute inset-0 transition duration-200 pointer-events-none",
            enabled ? "bg-black/0 group-hover:bg-black/55" : "bg-black/25 group-hover:bg-black/60",
          ].join(" ")}
        />

        <div className="absolute inset-0 flex items-center justify-center">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggleEnabled();
            }}
            className={[
              enabled ? "opacity-0 group-hover:opacity-100" : "opacity-100",
              "transition duration-200",
              "w-12 h-12 rounded-xl flex items-center justify-center",
              "bg-slate-950 border border-slate-700 shadow-xl",
              "ring-1 ring-black/40",
              "hover:bg-black active:scale-95",
              "focus:outline-none focus:ring-2 focus:ring-blue-500/40",
            ].join(" ")}
            title={enabled ? "Turn OFF (hide from Live View)" : "Turn ON (show in Live View)"}
          >
            {enabled ? (
              <Video className="w-6 h-6 text-white" />
            ) : (
              <VideoOff className="w-6 h-6 text-white" />
            )}
          </button>
        </div>
      </div>

      <div className="p-3">
        <div className="text-white font-medium truncate" title={title}>
          {title}
        </div>
        {subtitle && (
          <div className="text-slate-400 text-xs mt-1 truncate" title={subtitle}>
            {subtitle}
          </div>
        )}
      </div>
    </button>
  );
}

interface Props {
  cameras?: Camera[];
  selectedCamera: string | null;
  onSelectCamera: (id: string) => void;
  onRecordingToggle: (id: string) => void;
}

export function AttireDashboard({
  cameras = [],
  selectedCamera,
  onSelectCamera,
  onRecordingToggle,
}: Props) {
  const [sources, setSources] = useState<SourceItem[]>([]);
  const [enabledMap, setEnabledMap] = useState<Record<string, boolean>>({});
  
  const MAX_LIVE = 4;
  const MAX_ACTIVE_THUMBS = 6;

  const [showWebcam, setShowWebcam] = useState<boolean>(() => {
    return localStorage.getItem("attire:showWebcam") === "1";
  });

  useEffect(() => {
    const onStorage = () => {
      setShowWebcam(localStorage.getItem("attire:showWebcam") === "1");
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const maxOfflineEnabled = showWebcam ? MAX_LIVE - 1 : MAX_LIVE;

  const [data, setData] = useState<DashData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [hotspotMode, setHotspotMode] = useState<"24h" | "7d">("24h");

  const [searchTerm, setSearchTerm] = useState("");

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [floorFilter, setFloorFilter] = useState<"ALL" | "GF" | "1F" | "2F">("ALL");

  const getFloorFromName = (nameOrId: string) => {
    const s = (nameOrId || "").toUpperCase();
    const m = s.match(/\d/);
    const d = m ? m[0] : "";
    if (d === "0") return "GF";
    if (d === "1") return "1F";
    if (d === "2") return "2F";
    return "OTHER";
  };

  const matchesFloor = (s: SourceItem) => {
    if (floorFilter === "ALL") return true;
    const key = `${s.name || ""} ${s.id || ""}`;
    return getFloorFromName(key) === floorFilter;
  };

  const sourceSwitchLockRef = React.useRef(false);

  const handleSelectCameraSafe = (nextId: string) => {
    if (!nextId) return;
    if (nextId === selectedCamera) return;
    if (sourceSwitchLockRef.current) return;

    sourceSwitchLockRef.current = true;
    onSelectCamera(nextId);

    window.setTimeout(() => {
      sourceSwitchLockRef.current = false;
    }, 800);
  };

  const DASHBOARD_THUMB_INTERVAL_MS = 10000; // refresh every 10 sec

  const [isVisible, setIsVisible] = useState(() => !document.hidden);
  const [thumbTick, setThumbTick] = useState(0);

  useEffect(() => {
    const onVis = () => setIsVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(() => {
    if (!isVisible) return;

    const t = window.setInterval(() => {
      setThumbTick((x) => x + 1);
    }, DASHBOARD_THUMB_INTERVAL_MS);

    return () => window.clearInterval(t);
  }, [isVisible]);

  const getThumbBaseUrl = (s: SourceItem): string | null => {
    if (!s?.id) return null;

    if (s.kind === "rtsp") {
      return `${API_BASE}/api/rtsp/thumb/${s.id}`;
    }

    return `${API_BASE}/api/offline/thumb/${s.id}`;
  };

  const getThumbUrl = (s: SourceItem, active: boolean): string | null => {
    const base = getThumbBaseUrl(s);
    if (!base) return null;

    return active ? `${base}?t=${thumbTick}` : base;
  };

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const [vidsRes, rtspsRes, enabledRes] = await Promise.allSettled([
        fetchUploadedVideos(),
        fetchRtspSources(),
        fetchEnabledSources(),
      ]);

      const vids =
        vidsRes.status === "fulfilled" ? vidsRes.value : [];

      const rtsps =
        rtspsRes.status === "fulfilled" ? rtspsRes.value : [];

      const enabled =
        enabledRes.status === "fulfilled" ? enabledRes.value : {};

      const offline: SourceItem[] = vids.map((v) => ({
        kind: "offline",
        ...v,
      }));

      const rtsp: SourceItem[] = rtsps.map((s) => ({
        kind: "rtsp",
        ...s,
        uploadDate: "",
        size: "",
      }));

      const merged = [...offline, ...rtsp];
      merged.sort((a, b) => (a.id || "").localeCompare(b.id || ""));

      setSources(merged);
      setEnabledMap(enabled);

      const errors = [
        vidsRes.status === "rejected" ? "videos" : "",
        rtspsRes.status === "rejected" ? "rtsp" : "",
        enabledRes.status === "rejected" ? "enabled sources" : "",
      ].filter(Boolean);

      setErr(errors.length ? `Partial load failed: ${errors.join(", ")}` : null);
    };

    load();

    const onChanged = () => load();
    window.addEventListener("attire:sourcesChanged", onChanged);
    window.addEventListener("storage", onChanged);

    const t = window.setInterval(load, 15000);

    return () => {
      cancelled = true;
      window.removeEventListener("attire:sourcesChanged", onChanged);
      window.removeEventListener("storage", onChanged);
      window.clearInterval(t);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      try {
        const d = await getAttireDashboard();
        if (cancelled) return;
        setData(d);
        setErr(null);
      } catch (e: any) {
        if (cancelled) return;
        setErr(String(e?.message || e));
      }
    };

    tick();
    const t = window.setInterval(tick, 8000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, []);

  const filteredSources = useMemo(() => {
    const q = (searchTerm || "").trim().toLowerCase();

    return (sources || [])
      .filter((s) => matchesFloor(s))
      .filter((s) => {
        if (!q) return true;
        const hay = `${s.id} ${s.name ?? ""}`.toLowerCase();
        return hay.includes(q);
      });
  }, [sources, searchTerm, floorFilter]);

  const toggleEnabledFromTile = async (videoId: string) => {
    const cur = enabledMap[videoId] ?? true;
    const nextEnabled = !cur;

    const enabledCount = (sources || []).reduce((acc, s) => {
      const on = enabledMap[s.id] ?? true;
      return acc + (on ? 1 : 0);
    }, 0);

    if (nextEnabled && enabledCount >= maxOfflineEnabled) {
      alert(`You can enable maximum ${maxOfflineEnabled} video source(s) for Live View (webcam slot reserved).`);
      return;
    }

    setEnabledMap((prev) => ({ ...prev, [videoId]: nextEnabled }));

    try {
      await setSourceEnabled(videoId, nextEnabled);
      localStorage.setItem("attire:enabledSourcesVer", String(Date.now()));
      window.dispatchEvent(new Event("attire:sourcesChanged"));
    } catch (e: any) {
      alert(`Failed to save source status: ${e?.message || e}`);
      setEnabledMap((prev) => ({ ...prev, [videoId]: cur }));
    }
  };

  const hotspots = useMemo(() => {
    const rows = hotspotMode === "24h" ? data?.hotspot_24h : data?.hotspot_7d;
    return (rows || []).slice(0, 6).map((r) => ({
      name: (r.name || r.video_id || "Unknown").slice(0, 22),
      count: r.count,
      full: r.name || r.video_id || "Unknown",
    }));
  }, [data, hotspotMode]);

  const breakdown = useMemo(() => {
    const b = data?.breakdown_24h || [];
    return b.map((x) => ({ name: x.type, value: x.count }));
  }, [data]);

  const donutColors = ["#f59e0b", "#ef4444", "#3b82f6", "#22c55e", "#a855f7"];
  const total24h = breakdown.reduce((s, x) => s + (x.value || 0), 0);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const el = e.target as HTMLElement;
      if (!el.closest?.("[data-filters-root]")) setFiltersOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  return (
    <div className="mt-4">
      {/* Title strip */}
      <div className="bg-slate-900/40 border border-slate-800 rounded-lg p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-white text-lg">Attire Compliance Dashboard</div>
            <div className="text-slate-400 text-sm mt-1">
              Tracking dress code violation in computer lab areas.
            </div>
            {err && <div className="text-red-400 text-sm mt-2">{err}</div>}
          </div>
          <div className="text-slate-500 text-xs shrink-0">
            {data ? `Updated: ${new Date(data.generated_ts * 1000).toLocaleTimeString()}` : "Loading…"}
          </div>
        </div>
      </div>

      {/* Main two-column layout */}
      <div className="mt-4 grid grid-cols-12 gap-4 items-start">
        {/* LEFT CONTENT */}
        <div className="col-span-12 2xl:col-span-9 min-w-0 space-y-4">
          {/* Top stats */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-stretch">
            <StatCard
              icon={<AlertTriangle className="w-6 h-6 text-orange-300" />}
              label="Violations Today"
              value={data ? data.overview.violations_today : "—"}
              hint="Since midnight"
            />
            <StatCard
              icon={<Flame className="w-6 h-6 text-red-300" />}
              label="Most Common (24h)"
              value={data ? data.overview.most_common_24h : "—"}
              hint="Top violation type"
            />
            <StatCard
              icon={<AlertTriangle className="w-6 h-6 text-red-300" />}
              label="Worst Camera (24h)"
              value={data?.overview?.worst_camera_24h ? data.overview.worst_camera_24h.name : "—"}
              hint={
                data?.overview?.worst_camera_24h
                  ? `${data.overview.worst_camera_24h.count} violations`
                  : undefined
              }
            />
          </div>

          {/* Tip */}
          <div className="bg-slate-900/30 border border-slate-800 rounded-lg p-4">
            <div className="text-slate-300 text-sm">
              Tip: Use the right sidebar to quickly identify hotspot cameras and dominant violation types.
            </div>
          </div>

          {/* Camera Feeds */}
          <div className="bg-slate-900/30 border border-slate-800 rounded-lg p-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <div className="text-white font-medium">Camera Feeds</div>
                <div className="text-slate-400 text-sm mt-1">Search and monitor sources</div>
              </div>

              <div className="w-full mt-3 grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-3 items-center">
                <div className="relative w-full">
                  <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search cameras..."
                    className="w-full h-10 bg-slate-900/60 border border-slate-800 rounded-lg pl-10 pr-3 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-600/40"
                  />
                </div>

                <div className="flex items-center justify-end gap-3">
                  <div className="relative" data-filters-root>
                    <button
                      className="h-10 inline-flex items-center gap-2 bg-slate-900/60 border border-slate-800 rounded-lg px-4 text-sm text-slate-200 hover:bg-slate-800/50"
                      onClick={() => setFiltersOpen((v) => !v)}
                      title="Filters"
                    >
                      <Filter className="w-4 h-4" />
                      Filters
                    </button>

                    {filtersOpen && (
                      <div className="absolute right-0 mt-2 w-52 bg-slate-950 border border-slate-800 rounded-lg shadow-lg p-2 z-50">
                        <div className="text-slate-300 text-xs px-2 py-1">Filter by Floor</div>

                        {(["ALL", "GF", "1F", "2F"] as const).map((k) => (
                          <button
                            key={k}
                            onClick={() => {
                              setFloorFilter(k);
                              setFiltersOpen(false);
                            }}
                            className={
                              "w-full text-left px-2 py-2 rounded-md text-sm hover:bg-slate-900/60 " +
                              (floorFilter === k ? "bg-slate-900/70 text-white" : "text-slate-200")
                            }
                          >
                            {k === "ALL" ? "All Floors" : k}
                          </button>
                        ))}

                        <div className="mt-2 border-t border-slate-800 pt-2 px-2">
                          <button
                            onClick={() => {
                              setFloorFilter("ALL");
                              setFiltersOpen(false);
                            }}
                            className="text-xs text-slate-400 hover:text-slate-200"
                          >
                            Reset
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <button
                    className="h-10 inline-flex items-center gap-2 bg-blue-600/70 text-white rounded-lg px-4 text-sm cursor-default"
                    type="button"
                    title="Search filters automatically while typing"
                  >
                    <Search className="w-4 h-4" />
                    Search
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
                {filteredSources.map((s, idx) => (
                  <CameraTile
                    key={s.id}
                    id={s.id}
                    title={s.name || s.id}
                    subtitle={
                      s.kind === "rtsp"
                        ? "RTSP Source"
                        : s.uploadDate
                          ? new Date(s.uploadDate).toLocaleString()
                          : undefined
                    }
                    selected={selectedCamera === s.id}
                    enabled={enabledMap[s.id] ?? true}
                    thumbUrl={getThumbUrl(s, idx < MAX_ACTIVE_THUMBS)}
                    onClick={() => handleSelectCameraSafe(s.id)}
                    onToggleEnabled={() => toggleEnabledFromTile(s.id)}
                  />
                ))}

                {filteredSources.length === 0 && sources.length === 0 && (
                  <div className="xl:col-span-3 md:col-span-2 col-span-1 text-slate-400 text-center py-12">
                    No sources found.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT SIDEBAR */}
        <aside className="col-span-12 2xl:col-span-3 min-w-0">
          <div className="2xl:sticky 2xl:top-4 space-y-4">
            {/* Hotspots */}
            <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-white font-medium">Hotspots</div>
                  <div className="text-slate-400 text-sm mt-1">Top cameras by violations</div>
                </div>

                <div className="flex items-center gap-2 bg-slate-800/30 p-1 rounded-lg shrink-0">
                  <button
                    className={`px-3 py-1 rounded-md text-sm ${
                      hotspotMode === "24h" ? "bg-blue-600 text-white" : "text-slate-300 hover:text-white"
                    }`}
                    onClick={() => setHotspotMode("24h")}
                  >
                    24h
                  </button>
                  <button
                    className={`px-3 py-1 rounded-md text-sm ${
                      hotspotMode === "7d" ? "bg-blue-600 text-white" : "text-slate-300 hover:text-white"
                    }`}
                    onClick={() => setHotspotMode("7d")}
                  >
                    7d
                  </button>
                </div>
              </div>

              <div className="mt-4">
                <div className="text-slate-500 text-xs mb-2">rows: {hotspots.length}</div>

                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={hotspots} layout="vertical" margin={{ left: 10, right: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis type="number" stroke="#94a3b8" />
                    <YAxis type="category" dataKey="name" stroke="#94a3b8" width={105} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#0f172a",
                        border: "1px solid #334155",
                        borderRadius: "10px",
                        color: "#fff",
                      }}
                      formatter={(v: any, _n: any, p: any) => [v, p?.payload?.full || "Camera"]}
                    />
                    <Bar dataKey="count" fill="#ef4444" radius={[10, 10, 10, 10]} />
                  </BarChart>
                </ResponsiveContainer>

                {hotspots.length === 0 && (
                  <div className="text-slate-400 text-sm text-center py-4">
                    No hotspot data for {hotspotMode}.
                  </div>
                )}
              </div>
            </div>

            {/* Breakdown */}
            <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-white font-medium">Violation Breakdown (24h)</div>
                  <div className="text-slate-400 text-sm mt-1">Distribution by type</div>
                </div>
                <div className="text-slate-300 text-sm tabular-nums">{total24h}</div>
              </div>

              <div className="mt-4">
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie
                      data={breakdown}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={68}
                      outerRadius={98}
                      paddingAngle={3}
                    >
                      {breakdown.map((_, idx) => (
                        <Cell key={idx} fill={donutColors[idx % donutColors.length]} />
                      ))}
                    </Pie>

                    <text x="50%" y="49%" textAnchor="middle" dominantBaseline="middle" fill="#e2e8f0" fontSize="14">
                      Total
                    </text>
                    <text x="50%" y="58%" textAnchor="middle" dominantBaseline="middle" fill="#ffffff" fontSize="20">
                      {total24h}
                    </text>

                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#0f172a",
                        border: "1px solid #334155",
                        borderRadius: "10px",
                      }}
                      labelStyle={{ color: "#ffffff" }}
                      itemStyle={{ color: "#ffffff" }}
                    />
                  </PieChart>
                </ResponsiveContainer>

                {breakdown.length === 0 && (
                  <div className="text-slate-400 text-sm text-center py-4">No violations in last 24h.</div>
                )}
              </div>

              <div className="mt-2 space-y-2">
                {breakdown.map((b, idx) => (
                  <div key={b.name} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 text-slate-200 min-w-0">
                      <span
                        className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: donutColors[idx % donutColors.length] }}
                      />
                      <span className="truncate">{b.name}</span>
                    </div>
                    <div className="text-slate-300 tabular-nums shrink-0">{b.value}</div>
                  </div>
                ))}

                {breakdown.length === 0 && (
                  <div className="text-slate-400 text-sm text-center py-4">No violations in last 24h.</div>
                )}
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
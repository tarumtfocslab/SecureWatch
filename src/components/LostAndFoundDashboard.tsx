import type { Camera, Alert } from "../App";
import { CameraFeed } from "./CameraFeedLF";
import { useEffect, useMemo, useState } from "react";
import { resolveLostFoundUrl } from "../api/base";
import { Search, Filter, Maximize2, X } from "lucide-react";

interface Props {
  cameras?: Camera[];
  alerts?: Alert[];
  selectedCamera: string | null;
  onSelectCamera: (id: string) => void;
  onRecordingToggle: (id: string) => void;
  onStatusChange: (id: string, status: Camera["status"]) => void;
  onDismissAlert?: (id: string) => void;
  onOpenEvents?: (alert: Alert) => void;
  isFullscreen: boolean;
  onToggleFullscreen?: () => void;
}

function sevDot(sev: Alert["severity"]) {
  if (sev === "high") return "bg-red-400";
  if (sev === "medium") return "bg-yellow-400";
  return "bg-green-400";
}

function makeAlertUiKey(alert: Alert, idx: number) {
  return `${alert.id}_${alert.cameraId}_${alert.timestamp.getTime()}_${idx}`;
}

function getCameraType(cam: Camera) {
  const c = cam as Camera & {
    video_type?: string;
    type?: string;
    camera_type?: string;
    source_type?: string;
  };

  return (
    c.video_type ||
    c.type ||
    c.camera_type ||
    c.source_type ||
    "normal"
  ).toLowerCase();
}

function AlertCard({
  alert,
  onDismiss,
  onOpenEvents,
}: {
  alert: Alert;
  onDismiss?: () => void;
  onOpenEvents?: (alert: Alert) => void;
}) {
  const [imgError, setImgError] = useState(false);

  const resolvedImageUrl = resolveLostFoundUrl(alert.imageUrl);
  const hasImage = !!resolvedImageUrl && !imgError;

  return (
    <div className="border border-slate-800 rounded-2xl p-3 bg-slate-950/40">
      <div className="flex items-start gap-3">
        <div className="w-[96px] h-[72px] rounded-xl overflow-hidden border border-slate-800 bg-slate-900 shrink-0 flex items-center justify-center">
          {hasImage ? (
            <img
              src={resolvedImageUrl}
              alt="evidence"
              className="w-full h-full object-cover"
              onError={() => {
                setImgError(true);
              }}
            />
          ) : (
            <div className="text-[11px] text-slate-500 px-2 text-center">
              No image
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-sm text-white truncate">
                {alert.cameraName || alert.cameraId}
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                {alert.timestamp.toLocaleString()}
              </div>
            </div>

            {onDismiss && (
              <button
                className="text-slate-400 hover:text-white text-xs"
                onClick={() => onDismiss()}
                title="Dismiss"
              >
                ✕
              </button>
            )}
          </div>

          <div className="text-sm text-slate-200 mt-2 line-clamp-2">
            {alert.message}
          </div>

          <div className="mt-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs">
              <span
                className={`h-2 w-2 rounded-full ${sevDot(alert.severity)}`}
              />
              <span className="text-slate-300 capitalize">
                {alert.severity} priority
              </span>
            </div>

            <button
              className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white"
              onClick={() => onOpenEvents?.(alert)}
            >
              Open Events
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AlertsPanel({
  alerts,
  onDismiss,
  onOpenEvents,
}: {
  alerts: Alert[];
  onDismiss?: (id: string) => void;
  onOpenEvents?: (alert: Alert) => void;
}) {
  const STORAGE_KEY = "lf_dismissed_alert_keys";

  const [dismissedKeys, setDismissedKeys] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(dismissedKeys));
    } catch {
      // ignore
    }
  }, [dismissedKeys]);

  const sorted = useMemo(() => {
    return [...alerts].sort(
      (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
    );
  }, [alerts]);

  const keyedAlerts = useMemo(() => {
    return sorted.map((alert, idx) => ({
      alert,
      uiKey: makeAlertUiKey(alert, idx),
    }));
  }, [sorted]);

  const visibleAlerts = useMemo(() => {
    return keyedAlerts.filter((x) => !dismissedKeys.includes(x.uiKey));
  }, [keyedAlerts, dismissedKeys]);

  const top5 = visibleAlerts.slice(0, 5);

  const handleDismiss = (uiKey: string, rawId: string) => {
    setDismissedKeys((prev) => {
      if (prev.includes(uiKey)) return prev;
      return [...prev, uiKey];
    });

    onDismiss?.(rawId);
  };

  return (
    <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-4 h-full flex flex-col">
      <div className="flex items-center justify-between">
        <div className="text-white font-semibold">Recent Alerts</div>
        <div className="text-xs text-slate-400">
          {top5.length}/{visibleAlerts.length}
        </div>
      </div>

      <div className="mt-3 space-y-3 overflow-auto flex-1 pr-1">
        {top5.length === 0 ? (
          <div className="text-slate-400 text-sm">No alerts yet.</div>
        ) : (
          top5.map(({ alert, uiKey }) => (
            <AlertCard
              key={uiKey}
              alert={alert}
              onDismiss={() => handleDismiss(uiKey, alert.id)}
              onOpenEvents={onOpenEvents}
            />
          ))
        )}

        {visibleAlerts.length > 5 && (
          <div className="text-xs text-slate-500 pt-1">
            Showing latest 5 only.
          </div>
        )}
      </div>
    </div>
  );
}

export function LostFoundDashboard({
  cameras = [],
  alerts = [],
  selectedCamera,
  onSelectCamera,
  onRecordingToggle,
  onStatusChange,
  onDismissAlert,
  onOpenEvents,
  isFullscreen,
  onToggleFullscreen,
}: Props) {
  const [searchTerm, setSearchTerm] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [statusFilter, setStatusFilter] = useState<
    "all" | "online" | "offline" | "warning"
  >("all");
  const [typeFilter, setTypeFilter] = useState<
    "all" | "normal" | "fisheye"
  >("all");

  const filteredCameras = useMemo(() => {
    return cameras.filter((cam) => {
      const name = (cam.name || "").toLowerCase();
      const location = (cam.location || "").toLowerCase();
      const id = (cam.id || "").toLowerCase();
      const keyword = searchTerm.trim().toLowerCase();

      const matchesSearch =
        keyword === "" ||
        name.includes(keyword) ||
        location.includes(keyword) ||
        id.includes(keyword);

      const matchesStatus =
        statusFilter === "all" ? true : cam.status === statusFilter;

      const camType = getCameraType(cam);
      const matchesType =
        typeFilter === "all"
          ? true
          : typeFilter === "fisheye"
          ? camType.includes("fisheye")
          : !camType.includes("fisheye");

      return matchesSearch && matchesStatus && matchesType;
    });
  }, [cameras, searchTerm, statusFilter, typeFilter]);

  return (
    <>
      {!isFullscreen && (
        <div className="mt-4 bg-slate-900/40 border border-slate-800 rounded-2xl p-4">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
              <div>
                <div className="text-white">Lost &amp; Found Monitoring</div>
                <div className="text-slate-400 text-sm mt-1">
                  Fisheye swaps between Group A and Group B every 30s.
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search cameras..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-[260px] pl-10 pr-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white placeholder:text-slate-400 outline-none focus:border-blue-500"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => setShowFilters((v) => !v)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white hover:bg-slate-700"
                >
                  <Filter className="w-4 h-4" />
                  Filters
                </button>

                {onToggleFullscreen && (
                  <button
                    type="button"
                    onClick={onToggleFullscreen}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white hover:bg-slate-700"
                  >
                    <Maximize2 className="w-4 h-4" />
                    Fullscreen
                  </button>
                )}
              </div>
            </div>

            {showFilters && (
              <div className="flex flex-wrap items-center gap-3 border border-slate-800 rounded-2xl bg-slate-950/40 p-4">
                <select
                  value={statusFilter}
                  onChange={(e) =>
                    setStatusFilter(
                      e.target.value as "all" | "online" | "offline" | "warning"
                    )
                  }
                  className="px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white outline-none"
                >
                  <option value="all">All Status</option>
                  <option value="online">Online</option>
                  <option value="warning">Warning</option>
                  <option value="offline">Offline</option>
                </select>

                <select
                  value={typeFilter}
                  onChange={(e) =>
                    setTypeFilter(
                      e.target.value as "all" | "normal" | "fisheye"
                    )
                  }
                  className="px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white outline-none"
                >
                  <option value="all">All Types</option>
                  <option value="normal">Normal</option>
                  <option value="fisheye">Fisheye</option>
                </select>

                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm("");
                    setStatusFilter("all");
                    setTypeFilter("all");
                  }}
                  className="px-4 py-2 rounded-xl bg-slate-700 text-white hover:bg-slate-600"
                >
                  Reset
                </button>

                <div className="ml-auto text-sm text-slate-400">
                  {filteredCameras.length} camera
                  {filteredCameras.length === 1 ? "" : "s"} found
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="mt-6">
        <div className="grid grid-cols-[1fr,380px] gap-4">
          <div className="grid gap-4 grid-cols-3 auto-rows-[260px]">
            {filteredCameras.map((cam) => (
              <CameraFeed
                key={cam.id}
                camera={cam}
                isSelected={selectedCamera === cam.id}
                onSelect={() => onSelectCamera(cam.id)}
                onRecordingToggle={() => onRecordingToggle(cam.id)}
                onStatusChange={onStatusChange}
                isFullscreen={isFullscreen}
                gridContain={!isFullscreen}
                cycleSeconds={30}
              />
            ))}

            {filteredCameras.length === 0 && (
              <div className="text-slate-400 text-center py-12 col-span-3 border border-slate-800 rounded-2xl bg-slate-900/30">
                No cameras match the current filter.
              </div>
            )}
          </div>

          <AlertsPanel
            alerts={alerts}
            onDismiss={onDismissAlert}
            onOpenEvents={onOpenEvents}
          />
        </div>
      </div>
    </>
  );
}
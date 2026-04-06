import type { Camera, Alert } from "../App";
import { CameraFeed } from "./CameraFeedLF";
import { useEffect, useMemo, useState } from "react";
import { resolveLostFoundUrl } from "../api/base";
import { Search, Filter, Maximize2 } from "lucide-react";

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

function getFloorFromCamera(cam: Camera) {
  const key = `${cam.name || ""} ${cam.location || ""} ${cam.id || ""}`.toUpperCase();

  // Prefer the same logic style as Attire dashboard:
  // first detected digit 0 => GF, 1 => 1F, 2 => 2F
  const match = key.match(/[012]/);
  const digit = match ? match[0] : "";

  if (digit === "0") return "GF";
  if (digit === "1") return "1F";
  if (digit === "2") return "2F";

  return "OTHER";
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
              onError={() => setImgError(true)}
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
              <span className={`h-2 w-2 rounded-full ${sevDot(alert.severity)}`} />
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
      //
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
    "all" | "online" | "warning" | "offline"
  >("all");

  const [floorFilter, setFloorFilter] = useState<
    "ALL" | "GF" | "1F" | "2F"
  >("ALL");

  const filteredCameras = useMemo(() => {
    return cameras.filter((cam) => {
      const keyword = searchTerm.trim().toLowerCase();

      const matchesSearch =
        keyword === "" ||
        (cam.name || "").toLowerCase().includes(keyword) ||
        (cam.location || "").toLowerCase().includes(keyword) ||
        (cam.id || "").toLowerCase().includes(keyword);

      const matchesStatus =
        statusFilter === "all" ? true : cam.status === statusFilter;

      const camFloor = getFloorFromCamera(cam);
      const matchesFloor =
        floorFilter === "ALL" ? true : camFloor === floorFilter;

      return matchesSearch && matchesStatus && matchesFloor;
    });
  }, [cameras, searchTerm, statusFilter, floorFilter]);

  return (
    <>
      {/* Dashboard Header */}
      {!isFullscreen && (
        <div className="px-0">
          <h1 className="text-2xl font-semibold text-white">
            Lost & Found Dashboard
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            This dashboard monitors unattended items detected from CCTV cameras and manages alert events in real time.
          </p>
        </div>
      )}

      {!isFullscreen && (
        <div className="mt-4 bg-slate-900/40 border border-slate-800 rounded-2xl p-4">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
              <div className="flex items-center gap-3">
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

                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowFilters((v) => !v)}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white hover:bg-slate-700"
                  >
                    <Filter className="w-4 h-4" />
                    Filters
                  </button>

                  {showFilters && (
                    <div className="absolute right-0 mt-2 w-56 bg-slate-950 border border-slate-800 rounded-xl shadow-lg p-2 z-50">
                      <div className="text-slate-300 text-xs px-2 py-1">
                        Filter by Floor
                      </div>

                      {[
                        { key: "ALL", label: "All Floors" },
                        { key: "GF", label: "Ground Floor" },
                        { key: "1F", label: "Floor 1" },
                        { key: "2F", label: "Floor 2" },
                      ].map((item) => (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => {
                            setFloorFilter(item.key as "ALL" | "GF" | "1F" | "2F");
                            setShowFilters(false);
                          }}
                          className={
                            "w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-slate-900/60 " +
                            (floorFilter === item.key
                              ? "bg-slate-900/70 text-white"
                              : "text-slate-200")
                          }
                        >
                          {item.label}
                        </button>
                      ))}

                      <div className="mt-2 border-t border-slate-800 pt-2 px-2">
                        <div className="text-slate-300 text-xs px-0 py-1">
                          Status
                        </div>

                        <select
                          value={statusFilter}
                          onChange={(e) =>
                            setStatusFilter(
                              e.target.value as
                                | "all"
                                | "online"
                                | "warning"
                                | "offline"
                            )
                          }
                          className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white outline-none"
                        >
                          <option value="all">All Status</option>
                          <option value="online">Online</option>
                          <option value="warning">Warning</option>
                          <option value="offline">Offline</option>
                        </select>
                      </div>

                      <div className="mt-2 border-t border-slate-800 pt-2 px-2 flex items-center justify-between">
                        <button
                          type="button"
                          onClick={() => {
                            setSearchTerm("");
                            setStatusFilter("all");
                            setFloorFilter("ALL");
                            setShowFilters(false);
                          }}
                          className="text-xs text-slate-400 hover:text-slate-200"
                        >
                          Reset
                        </button>

                        <span className="text-xs text-slate-500">
                          {filteredCameras.length} found
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="mt-6">
        {isFullscreen ? (
          <div className="grid gap-4 grid-cols-4 auto-rows-[260px] overflow-y-auto max-h-[calc(100vh-120px)]">
            {filteredCameras.map((cam) => (
              <CameraFeed
                key={cam.id}
                camera={cam}
                isSelected={selectedCamera === cam.id}
                onSelect={() => onSelectCamera(cam.id)}
                onRecordingToggle={() => onRecordingToggle(cam.id)}
                onStatusChange={onStatusChange}
                isFullscreen={true}
                gridContain={true}
                cycleSeconds={30}
              />
            ))}

            {filteredCameras.length === 0 && (
              <div className="text-slate-400 text-center py-12 col-span-4 border border-slate-800 rounded-2xl bg-slate-900/30">
                No cameras match the current filter.
              </div>
            )}
          </div>
        ) : (
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
                  isFullscreen={false}
                  gridContain={true}
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
        )}
      </div>
    </>
  );
}
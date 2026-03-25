// App.tsx
import { ATTIRE_API_BASE, LOSTFOUND_API_BASE } from "./api/base";

import { useEffect, useRef, useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { ControlBar } from "./components/ControlBar";
import { UploadVideoPage } from "./components/UploadVideoPage";
import { EventsPage } from "./components/EventsPage";
import { SettingsPage } from "./components/SettingsPage";
import { ReportsPage } from "./components/ReportsPage";
import { LoginPage } from "./components/LoginPage";
import { UsersPage } from "./components/userpage";
import { api, getToken, setToken } from "./api/apiHelper";

import { LostFoundDashboard } from "./components/LostAndFoundDashboard";
import LostAndFoundSettingsPage from "./components/LostAndFoundSettingsPage";
import LostAndFoundLiveView from "./components/LostAndFoundLiveView";

import { AttireDashboard } from "./components/AttireComplianceDashboard";
import { AttireComplianceLiveView } from "./components/AttireComplianceLiveView";

export interface Camera {
  id: string;
  name: string;
  location: string;
  status: "online" | "offline" | "warning";
  imageUrl?: string;
  recording: boolean;
  videoUrl?: string;
  mjpegUrl?: string;
  views?: any[];
  isFisheye?: boolean;
  videoType?: string;
}

export interface Alert {
  id: string;
  cameraId: string;
  cameraName: string;
  type:
    | "motion"
    | "intrusion"
    | "offline"
    | "lost-found"
    | "attire-violation";
  timestamp: Date;
  severity: "low" | "medium" | "high";
  message: string;
  imageUrl?: string;
}

type AppPage =
  | "dashboard"
  | "live-attire"
  | "live-lostfound"
  | "reports"
  | "events"
  | "settings"
  | "upload-video"
  | "users";

function isAppPage(value: string): value is AppPage {
  return [
    "dashboard",
    "live-attire",
    "live-lostfound",
    "reports",
    "events",
    "settings",
    "upload-video",
    "users",
  ].includes(value);
}

function toAbsLostFound(u?: string) {
  if (!u) return undefined;
  if (u.startsWith("http")) return u;
  if (u.startsWith("/")) return `${LOSTFOUND_API_BASE}${u}`;
  return `${LOSTFOUND_API_BASE}/${u}`;
}

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [me, setMe] = useState<any>(null);

  type AttireToast = {
    id: string;
    title: string;
    message: string;
    createdAt: number;
  };

  const [attireToasts, setAttireToasts] = useState<AttireToast[]>([]);
  const [unreadAttireNotifs, setUnreadAttireNotifs] = useState(0);
  const [notifConfig, setNotifConfig] = useState<any>(null);
  const notifConfigRef = useRef<any>(null);
  const notifFetchInFlightRef = useRef(false);
  async function refreshNotifConfig() {
    if (notifFetchInFlightRef.current) return;

    notifFetchInFlightRef.current = true;
    try {
      const token = getToken();
      if (!token) return;

      const base = ATTIRE_API_BASE;

      const r = await fetch(`${base}/api/attire/notifications`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) return;

      const data = await r.json();
      setNotifConfig(data.config);
    } catch {
    } finally {
      notifFetchInFlightRef.current = false;
    }
  }

  const role = (me?.role || "Viewer") as "Admin" | "Security" | "Staff" | "Viewer";
  const allowedPagesByRole: Record<typeof role, AppPage[]> = {
    Admin: ["dashboard","live-attire","live-lostfound","reports","events","settings","upload-video","users"],
    Security: ["dashboard","live-attire","live-lostfound","reports","events","settings","upload-video"],
    Staff: ["dashboard","live-attire","live-lostfound","reports","events","settings","upload-video"],
    Viewer: ["dashboard","live-attire","live-lostfound","reports","events"],
  };

  const canAccessPage = (page: AppPage) => allowedPagesByRole[role].includes(page);
  const canExportReports = role === "Admin"; //only admin can export

  const [lfCameras, setLfCameras] = useState<Camera[]>([]);
  const [lfAlerts, setLfAlerts] = useState<Alert[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "online" | "warning" | "offline">("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "single">("grid");
  const [isGridFullscreen, setIsGridFullscreen] = useState(false);
  const gridWrapRef = useRef<HTMLDivElement | null>(null);

  const [cameras, setCameras] = useState<Camera[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [selectedCamera, setSelectedCamera] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [currentPage, setCurrentPage] = useState<AppPage>("dashboard");
  const [monitoringMode, setMonitoringMode] = useState<"lost-found" | "attire">("lost-found");
  const [settingsView, setSettingsView] = useState<"main" | "lostfound-offline">("main");
  const [lostFoundOfflineStem, setLostFoundOfflineStem] = useState<string | null>(null);
  const [activeSources, setActiveSources] = useState<number>(0);
  const [attireTotalSources, setAttireTotalSources] = useState<number>(() => {
  const v = Number(localStorage.getItem("attire:totalSources") || 0);
    return Number.isFinite(v) && v >= 0 ? v : 0;
  });
  const notifyAudioRef = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    notifyAudioRef.current = new Audio(`${import.meta.env.BASE_URL}sounds/notify.wav`);
    notifyAudioRef.current.preload = "auto";
  }, []);

  useEffect(() => {
    const unlock = () => {
      const a = notifyAudioRef.current;
      if (!a) return;

      // Try to play once to unlock audio context
      a.play()
        .then(() => {
          a.pause();
          a.currentTime = 0;
        })
        .catch(() => {});

      window.removeEventListener("pointerdown", unlock);
    };

    window.addEventListener("pointerdown", unlock);

    return () => {
      window.removeEventListener("pointerdown", unlock);
    };
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;

    refreshNotifConfig();

    const onNotifChanged = () => refreshNotifConfig();

    window.addEventListener("attire:notifChanged", onNotifChanged);

    return () => {
      window.removeEventListener("attire:notifChanged", onNotifChanged);
    };
  }, [isAuthenticated]);

  useEffect(() => {
    const syncNavFromStorage = () => {
      const p = localStorage.getItem("nav:lastPage");
      if (!p || !isAppPage(p)) return;

      setCurrentPage(p);

      if (p === "live-attire") setMonitoringMode("attire");
      if (p === "live-lostfound") setMonitoringMode("lost-found");
    };

    syncNavFromStorage();

    // your UploadVideoPage dispatches: window.dispatchEvent(new Event("storage"))
    window.addEventListener("storage", syncNavFromStorage);
    window.addEventListener("nav:changed", syncNavFromStorage);

    return () => {
      window.removeEventListener("storage", syncNavFromStorage);
      window.removeEventListener("nav:changed", syncNavFromStorage);
    };
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (!canAccessPage(currentPage)) {
      setCurrentPage("dashboard");
      localStorage.setItem("nav:lastPage", "dashboard");
    }
  }, [currentPage, isAuthenticated, role]);

  useEffect(() => {
    const refreshTotal = () => {
      const v = Number(localStorage.getItem("attire:totalSources") || 0);
      setAttireTotalSources(Number.isFinite(v) && v >= 0 ? v : 0);
    };

    refreshTotal();
    window.addEventListener("storage", refreshTotal);
    window.addEventListener("attire:sourceCountChanged", refreshTotal);

    return () => {
      window.removeEventListener("storage", refreshTotal);
      window.removeEventListener("attire:sourceCountChanged", refreshTotal);
    };
  }, []);

  useEffect(() => {
    const activeModule: "lost-found" | "attire" =
      currentPage === "live-attire"
        ? "attire"
        : currentPage === "live-lostfound"
        ? "lost-found"
        : monitoringMode;

    const key =
      activeModule === "attire"
        ? "attire:enabledCameraIds"
        : "lostfound:enabledCameraIds";

    const readCount = () => {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) return 0;
        const ids = JSON.parse(raw);
        return Array.isArray(ids) ? ids.length : 0;
      } catch {
        return 0;
      }
    };

    const refresh = () => setActiveSources(readCount());
    refresh();

    window.addEventListener("storage", refresh);
    window.addEventListener("attire:gridSourcesChanged", refresh);

    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("attire:gridSourcesChanged", refresh);
    };
  }, [currentPage, monitoringMode]);

  useEffect(() => {
    (async () => {
      if (!getToken()) return;

      try {
        const r = await api<{ user: any }>("/api/auth/me");
        setMe(r.user);
        setIsAuthenticated(true);
      } catch {
        setToken("");
        setIsAuthenticated(false);
        setMe(null);
      }
    })();
  }, []);
  
  useEffect(() => {
    if (!isAuthenticated) return;

    const token = getToken();
    if (!token) return;

    const es = new EventSource(`${ATTIRE_API_BASE}/api/attire/notifications/stream?token=${encodeURIComponent(token)}`);

    es.onmessage = (ev: MessageEvent) => {
      try {
        const payload = JSON.parse(ev.data);

        const toastId = payload.id;
        setAttireToasts(prev =>
          [{
            id: toastId,
            title: `Attire Violation: ${String(payload.violation_type || "").toUpperCase()}`,
            message: `${payload.source_name || payload.source_id || "Unknown"} • ${new Date(payload.timestamp * 1000).toLocaleTimeString()}`,
            createdAt: Date.now()
          }, ...prev].slice(0, 5)
        );

        setUnreadAttireNotifs(x => x + 1);

        if (notifConfig?.play_sound && notifyAudioRef.current) {
          notifyAudioRef.current.currentTime = 0;
          notifyAudioRef.current.play().catch(() => {});
        }

        setTimeout(() => {
          setAttireToasts(prev => prev.filter(t => t.id !== toastId));
        }, (notifConfig?.toast_sec ?? 6) * 1000);
      } catch (err) {
        console.error("Failed to parse SSE payload:", err);
      }
    };

    es.onerror = (err) => {
      console.error("SSE connection error:", err);
      // DO NOT close here. Let EventSource retry automatically.
    };

    return () => es.close();
  }, [isAuthenticated]); // only depends on auth

  useEffect(() => {
    notifConfigRef.current = notifConfig;
  }, [notifConfig]);

  useEffect(() => {
    if (currentPage === "events") setUnreadAttireNotifs(0);
  }, [currentPage]);

  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // ---------- Lost & Found ------------
  useEffect(() => {
    if (!isAuthenticated) return;

    const shouldPollLostFound =
      currentPage === "dashboard" && monitoringMode === "lost-found";

    if (!shouldPollLostFound) return;

    let cancelled = false;

    const loadLostFoundDashboard = async () => {
      try {
        const [camsRes, alertsRes] = await Promise.all([
          fetch(`${LOSTFOUND_API_BASE}/api/lostfound/cameras`, { cache: "no-store" }),
          fetch(`${LOSTFOUND_API_BASE}/api/lostfound/alerts?limit=50`, { cache: "no-store" }),
        ]);

        const camsJson = await camsRes.json().catch(() => ({}));
        const alertsJson = await alertsRes.json().catch(() => ({}));

        if (cancelled) return;

        const cams = Array.isArray(camsJson)
          ? camsJson
          : Array.isArray(camsJson?.cameras)
          ? camsJson.cameras
          : [];

        const backendAlerts = Array.isArray(alertsJson)
          ? alertsJson
          : Array.isArray(alertsJson?.alerts)
          ? alertsJson.alerts
          : [];

        setLfCameras((prev) => {
          const prevMap = new Map(prev.map((cam) => [cam.id, cam]));

          return cams.map((c: any) => {
            const id = String(c.id ?? "");
            const prevCam = prevMap.get(id);

            const backendStatus = (c.status ?? "offline") as "online" | "offline" | "warning";
            const localStatus = prevCam?.status;

            // Keep stronger local failure states instead of letting poll reset them to online
            const mergedStatus: "online" | "offline" | "warning" =
              localStatus === "offline"
                ? "offline"
                : localStatus === "warning" && backendStatus === "online"
                ? "warning"
                : backendStatus;

            return {
              id,
              name: String(c.name ?? c.id ?? "Unknown Camera"),
              location: String(c.location ?? ""),
              status: mergedStatus,
              recording: !!c.recording,
              imageUrl: c.imageUrl ?? "",
              videoUrl: c.videoUrl,
              mjpegUrl: c.mjpegUrl,
              views: c.views,
              isFisheye: c.isFisheye,
              videoType: c.videoType,
            };
          }) as Camera[];
        });

        setLfAlerts(
          backendAlerts.map((a: any) => ({
            id: String(a.id ?? ""),
            cameraId: String(a.cameraId ?? ""),
            cameraName: String(a.cameraName ?? a.cameraId ?? "Unknown"),
            type: "lost-found",
            timestamp: new Date(Number(a.timestamp ?? 0) * 1000),
            severity: (a.severity ?? "medium") as "low" | "medium" | "high",
            message: String(a.message ?? ""),
            imageUrl: toAbsLostFound(a.imageUrl || a.thumbUrl),
          }))
        );
      } catch (e) {
        console.error("Lost & Found dashboard load failed:", e);
      }
    };

    loadLostFoundDashboard();
    const t = window.setInterval(loadLostFoundDashboard, 2000);

    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [isAuthenticated, currentPage, monitoringMode]);

  const filteredLfCameras = lfCameras.filter((c) => {
    const s = searchTerm.toLowerCase();
    const matchSearch =
      (c.name || "").toLowerCase().includes(s) ||
      (c.id || "").toLowerCase().includes(s);

    const matchStatus = statusFilter === "all" ? true : c.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const handleGridFullscreen = async () => {
    const el = gridWrapRef.current;
    if (!el) return;

    if (!document.fullscreenElement) {
      await el.requestFullscreen?.();
      setIsGridFullscreen(true);
    } else {
      await document.exitFullscreen?.();
      setIsGridFullscreen(false);
    }
  };

  useEffect(() => {
    const onFsChange = () => setIsGridFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  const toggleViewMode = () => {
    setViewMode((v) => {
      const next = v === "grid" ? "single" : "grid";
      if (next === "single" && !selectedCamera) {
        const first = filteredLfCameras[0]?.id;
        if (first) setSelectedCamera(first);
      }
      return next;
    });
  };
  // --------------------------------

  const handleLogin = (user: any) => {
    setMe(user);
    setIsAuthenticated(true);
  };

  const handleLogout = async () => {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch {
      // ignore logout errors
    }

    setToken("");
    setMe(null);
    setIsAuthenticated(false);
    setCurrentPage("dashboard");
  };

  // Show login page if not authenticated
  if (!isAuthenticated) {
    return <LoginPage onLogin={handleLogin} />;
  }

  const handleRecordingToggle = (cameraId: string) => {
    setCameras((prev) =>
      prev.map((cam) =>
        cam.id === cameraId
          ? { ...cam, recording: !cam.recording }
          : cam,
      ),
    );
  };

  const handleLfStatusChange = (
    cameraId: string,
    status: Camera["status"]
  ) => {
    setLfCameras((prev) =>
      prev.map((cam) =>
        cam.id === cameraId ? { ...cam, status } : cam
      )
    );
  };

 const handleDismissAlert = async (alertId: string) => {
  // optimistic UI remove first
  setAlerts((prev) => prev.filter((alert) => alert.id !== alertId));
  setLfAlerts((prev) => prev.filter((alert) => alert.id !== alertId));

  try {
    const r = await fetch(
      `${LOSTFOUND_API_BASE}/api/lostfound/alerts/${encodeURIComponent(alertId)}/dismiss`,
      {
        method: "POST",
        cache: "no-store",
      }
    );

    if (!r.ok) {
      throw new Error(`Dismiss failed: ${r.status}`);
    }
  } catch (err) {
    console.error("Failed to dismiss lost & found alert:", err);

    // reload from backend if dismiss failed
    try {
      const alertsRes = await fetch(
        `${LOSTFOUND_API_BASE}/api/lostfound/alerts?limit=50`,
        { cache: "no-store" }
      );
      const alertsJson = await alertsRes.json().catch(() => ({}));

      const backendAlerts = Array.isArray(alertsJson)
        ? alertsJson
        : Array.isArray(alertsJson?.alerts)
        ? alertsJson.alerts
        : [];

      setLfAlerts(
        backendAlerts.map((a: any) => ({
          id: String(a.id ?? ""),
          cameraId: String(a.cameraId ?? ""),
          cameraName: String(a.cameraName ?? a.cameraId ?? "Unknown"),
          type: "lost-found",
          timestamp: new Date(Number(a.timestamp ?? 0) * 1000),
          severity: (a.severity ?? "medium") as "low" | "medium" | "high",
          message: String(a.message ?? ""),
          imageUrl: toAbsLostFound(a.imageUrl || a.thumbUrl),
        }))
      );
    } catch {}
  }
};


  // Get current alerts based on monitoring mode
  const getCurrentAlerts = () => {
    // If don't have a alerts yet, keep it empty for dashboard/live pages.
    if (
      currentPage === "dashboard" ||
      currentPage === "live-attire" ||
      currentPage === "live-lostfound"
    ) {
      return [];
    }

    return alerts;
  };

  const currentAlerts = getCurrentAlerts();

  // which module is currently relevant for the header?
  const activeModule: "lost-found" | "attire" =
    currentPage === "live-attire"
      ? "attire"
      : currentPage === "live-lostfound"
      ? "lost-found"
      : monitoringMode;
      
  const totalSources =
    activeModule === "attire" ? attireTotalSources : lfCameras.length;

  const lfOnlineCount = lfCameras.filter((c) => c.status === "online").length;
  const lfWarningCount = lfCameras.filter((c) => c.status === "warning").length;
  const lfOfflineCount = lfCameras.filter((c) => c.status === "offline").length;

  const online = activeModule === "attire" ? activeSources : lfOnlineCount;
  const warnings = activeModule === "attire" ? unreadAttireNotifs : lfWarningCount;
  const offline =
    activeModule === "attire"
      ? Math.max(0, totalSources - activeSources)
      : lfOfflineCount;

  const openLostFoundOfflineSettings = (stem: string) => {
    const cleanStem = String(stem || "").trim();
    if (!cleanStem) return;

    setMonitoringMode("lost-found");
    setLostFoundOfflineStem(cleanStem);
    setSettingsView("lostfound-offline");
    setCurrentPage("settings");

    localStorage.setItem("nav:lastPage", "settings");
    localStorage.setItem("lostfound:offlineStem", cleanStem);
    localStorage.setItem("settings:view", "lostfound-offline");
  };

  const openMainSettings = () => {
    setSettingsView("main");
    setLostFoundOfflineStem(null);
    setCurrentPage("settings");

    localStorage.setItem("nav:lastPage", "settings");
    localStorage.setItem("settings:view", "main");
    localStorage.removeItem("lostfound:offlineStem");
  };

  const renderPage = () => {
    switch (currentPage) {
      case "dashboard":
        return (
          <>
            <main className="flex-1 p-6 overflow-y-auto overflow-x-hidden min-w-0">
              {monitoringMode === "lost-found" ? (
                <div
                  ref={gridWrapRef}
                  className={`flex flex-col ${
                    isGridFullscreen
                      ? "h-screen w-screen overflow-hidden bg-slate-950"
                      : "h-full min-h-screen space-y-4"
                  }`}
                >
                  <ControlBar
                    viewMode={viewMode}
                    onToggleView={toggleViewMode}
                    onFullscreen={handleGridFullscreen}
                    searchTerm={searchTerm}
                    onSearchChange={setSearchTerm}
                    onOpenFilters={() => setFiltersOpen(true)}
                    onExport={() => {}}
                  />

                  <LostFoundDashboard
                    cameras={filteredLfCameras}
                    alerts={lfAlerts}
                    selectedCamera={selectedCamera}
                    onSelectCamera={setSelectedCamera}
                    onRecordingToggle={handleRecordingToggle}
                    onDismissAlert={handleDismissAlert}
                    onStatusChange={handleLfStatusChange}
                    isFullscreen={isGridFullscreen}
                  />
                </div>
              ) : (
                <AttireDashboard
                  cameras={cameras}
                  selectedCamera={selectedCamera}
                  onSelectCamera={setSelectedCamera}
                  onRecordingToggle={handleRecordingToggle}
                />
              )}
            </main>
          </>
        );
      case "live-attire":
        return <AttireComplianceLiveView />;
      case "live-lostfound":
        return <LostAndFoundLiveView mode="lost-found" />;
      case "events":
        return <EventsPage />;
      case "users":
        return <UsersPage />;
      case "settings":
        return settingsView === "lostfound-offline" ? (
          <LostAndFoundSettingsPage offlineStem={lostFoundOfflineStem} />
        ) : (
          <SettingsPage />
        );
      case "reports":
        return <ReportsPage canExport={canExportReports} />;
      case "upload-video":
        return (
          <UploadVideoPage
            onProcessingComplete={() => {}}
            onOpenLostFoundSettings={openLostFoundOfflineSettings}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white flex">
      {/* Sidebar Navigation */}
      <Sidebar
        currentPage={currentPage}
        onPageChange={(page: AppPage) => {
          if (!canAccessPage(page)) return;

          if (page === "settings") {
            openMainSettings();
            return;
          }

          setCurrentPage(page);
          localStorage.setItem("nav:lastPage", page);

          if (page === "live-attire") setMonitoringMode("attire");
          if (page === "live-lostfound") setMonitoringMode("lost-found");
        }}
        onLogout={handleLogout}
        currentUser={me ? { name: me.name ?? "User", role: me.role ?? "" } : undefined}
        role={role}   // pass down (you'll add this prop)
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-sm">
          <div className="px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-white">
                  CCTV Monitoring System
                </h1>
                <p className="text-slate-400 mt-1">
                  Real-time security surveillance
                </p>
              </div>
              <div className="flex items-center gap-6">
                <div className="text-right">
                  <div className="text-slate-400">
                    {currentTime.toLocaleDateString("en-US", {
                      weekday: "long",
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </div>
                  <div className="text-white mt-1">
                    {currentTime.toLocaleTimeString("en-US", {
                      hour12: false,
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Monitoring Mode Tabs - Only show on dashboard */}
            {currentPage === "dashboard" && (
              <div className="mt-4 flex items-center gap-2 bg-slate-800/30 p-1 rounded-lg w-fit">
                <button
                  onClick={() => setMonitoringMode("lost-found")}
                  className={`px-6 py-2 rounded-md transition-colors ${
                    monitoringMode === "lost-found"
                      ? "bg-blue-600 text-white"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Lost & Found
                </button>

                <button
                  onClick={() => setMonitoringMode("attire")}
                  className={`px-6 py-2 rounded-md transition-colors ${
                    monitoringMode === "attire"
                      ? "bg-blue-600 text-white"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Attire Compliance
                </button>
              </div>
            )}

            {/* Status Bar */}
            <div className="mt-4 grid grid-cols-3 gap-4">
              <div className="bg-slate-800/50 rounded-lg px-4 py-3 border border-slate-700">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Online</span>
                  <span className="text-green-400">
                    {online}/{totalSources}
                  </span>
                </div>
              </div>
              <div className="bg-slate-800/50 rounded-lg px-4 py-3 border border-slate-700">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">
                    Warnings
                  </span>
                  <span className="text-yellow-400">
                    {warnings}
                  </span>
                </div>
              </div>
              <div className="bg-slate-800/50 rounded-lg px-4 py-3 border border-slate-700">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">
                    Offline
                  </span>
                  <span className="text-red-400">
                    {offline}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </header>

        <div className="flex flex-1 overflow-hidden min-w-0">
          {renderPage()}
        </div>
      </div>

      {/* Toast overlay */}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] space-y-3 w-[22rem]">
        {attireToasts.map((t) => (
          <div
            key={t.id}
            role="button"
            tabIndex={0}
            onClick={() => {
              setCurrentPage("events");
              localStorage.setItem("nav:lastPage", "events");
              setAttireToasts((prev) => prev.filter((x) => x.id !== t.id)); // optional: auto close
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setCurrentPage("events");
                localStorage.setItem("nav:lastPage", "events");
              }
            }}
            className="cursor-pointer select-none bg-slate-900 border border-slate-700 rounded-lg shadow-lg p-3 hover:border-slate-500 transition"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-white text-sm font-semibold truncate">{t.title}</div>
                <div className="text-slate-300 text-xs mt-1 truncate">{t.message}</div>
              </div>

              <button
                className="text-slate-400 hover:text-white shrink-0"
                onClick={(e) => {
                  e.stopPropagation(); // don't navigate
                  setAttireToasts((prev) => prev.filter((x) => x.id !== t.id));
                }}
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
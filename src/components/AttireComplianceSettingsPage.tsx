// AttireComplianceSettingsPage.tsx:
import React, { useState, useRef, useEffect } from 'react';
import { getToken } from "../api/apiHelper";
import { ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Minus, Plus } from "lucide-react";
import { Pencil, Check, Undo2} from "lucide-react";
import {
  Settings as SettingsIcon,
  Camera,
  Clock,
  Bell,
  Save,
  RotateCcw,
  Square,
  Circle,
  X,
  Video,
  Trash2,
} from 'lucide-react';
import { ATTIRE_API_BASE } from "../api/base";

interface CameraSettings {
  id: string;
  name: string;
  enabled: boolean;
  dewarp: DewarpParams;
}

interface ViolationTypeSettings {
  name: string;
  enabled: boolean;
  icon: string;
}

interface DewarpParams {
  roll: number;
  pitch: number;
  fov: number;
}

interface TimeSchedule {
  id: string;
  startTime: string;
  endTime: string;
  enabled: boolean;
  days: string[];
}

const API_BASE = ATTIRE_API_BASE;
const MAX_RETENTION_DAYS = 150;

function clampRetentionDays(v: number) {
  if (!Number.isFinite(v)) return 1;
  return Math.max(1, Math.min(MAX_RETENTION_DAYS, Math.round(v)));
}

type ViolationKey = "sleeveless" | "shorts" | "slippers";

const UI_TO_KEY: Record<string, ViolationKey> = {
  Sleeveless: "sleeveless",
  Shorts: "shorts",
  Slippers: "slippers",
};
const MAX_LIVE = 4;
const showWebcam = localStorage.getItem("attire:showWebcam") === "1";
const maxOfflineEnabled = showWebcam ? (MAX_LIVE - 1) : MAX_LIVE;

async function fetchViolationTypes(): Promise<Record<ViolationKey, boolean>> {
  const res = await fetch(`${API_BASE}/api/attire/violations`);
  if (!res.ok) throw new Error("Failed to load violation types");
  const data = await res.json();
  return (data?.enabled || {}) as Record<ViolationKey, boolean>;
}

async function saveViolationTypes(enabled: Record<ViolationKey, boolean>) {
  const res = await fetch(`${API_BASE}/api/attire/violations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.detail || `HTTP ${res.status}`);
  return data;
}

type BackendVideo = {
  id: string;
  name: string;
  status?: string;
  uploadDate?: string;
  size?: string;
};

type Point = [number, number];            // [xPercent, yPercent]
type Polygon = Point[];                   // >= 3 points
type RoiMap = Record<string, Polygon[]>;  // viewName -> polygons
    
type AttireNotifConfig = {
  enabled: boolean;
  cooldown_sec: number;
  toast_sec: number;
  play_sound: boolean;
};

type SourceKind = "offline" | "rtsp";

type UnifiedSource = {
  id: string;
  name: string;
  kind: SourceKind;
  url?: string; // only for rtsp
  status?: string;
  uploadDate?: string;
  size?: string;
};

type AttireRetentionConfig = {
  enabled: boolean;
  retention_days: number;
};

async function fetchRetentionConfig(): Promise<AttireRetentionConfig> {
  const res = await fetch(`${API_BASE}/api/attire/data-retention`);
  if (!res.ok) throw new Error("Failed to load data retention config");
  return await res.json();
}

async function saveRetentionConfig(enabled: boolean, retention_days: number) {
  const res = await fetch(`${API_BASE}/api/attire/data-retention`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled, retention_days }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.detail || `HTTP ${res.status}`);
  return data;
}

async function clearAllAttireEventsApi() {
  const res = await fetch(`${API_BASE}/api/attire/data-retention/events`, {
    method: "DELETE",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.detail || `HTTP ${res.status}`);
  return data;
}

async function fetchNotifConfig(): Promise<AttireNotifConfig> {
  const token = getToken();
  const res = await fetch(`${API_BASE}/api/attire/notifications`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to load notification config");
  const data = await res.json();
  return data.config;
}

async function saveNotifConfig(cfg: AttireNotifConfig) {
  const token = getToken();
  const res = await fetch(`${API_BASE}/api/attire/notifications`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(cfg),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.detail || `HTTP ${res.status}`);
  return data;
}

async function fetchRtspSources(): Promise<UnifiedSource[]> {
  const res = await fetch(`${API_BASE}/api/rtsp/sources`);
  if (!res.ok) return [];
  const j = await res.json();
  const items = Array.isArray(j?.sources) ? j.sources : [];
  return items.map((x: any) => ({
    id: String(x.id),
    name: String(x.name ?? x.id),
    url: String(x.url ?? ""),
    kind: "rtsp" as const,
  }));
}

async function fetchOfflineSources(): Promise<UnifiedSource[]> {
  const res = await fetch(`${API_BASE}/api/offline/videos`);
  if (!res.ok) return [];
  const list = await res.json();
  const items = Array.isArray(list) ? list : [];
  return items.map((v: any) => ({
    id: String(v.id),
    name: String(v.name ?? v.id),
    uploadDate: v.uploadDate,
    size: v.size,
    status: v.status,
    kind: "offline" as const,
  }));
}

export function AttireComplianceSettingsPage() {
  const [activeTab, setActiveTab] = useState<
    "sources" | "roi" | "timing" | "violations" | "notifications" | "retention"
  >("sources");
  const [roiMode, setRoiMode] = useState<"roi" | "dewarp">("roi");

  // ✅ backend video list (real sources)
  const [videoSources, setVideoSources] = useState<UnifiedSource[]>([]);
  const [selectedCamera, setSelectedCamera] = useState<string>("");
  const [selectedKind, setSelectedKind] = useState<SourceKind>("offline");

  const selectedSource = videoSources.find(s => s.id === selectedCamera);
  useEffect(() => {
    if (selectedSource) setSelectedKind(selectedSource.kind);
  }, [selectedSource?.id]);

  const [dewarp, setDewarp] = useState<DewarpParams>({
    roll: -105,
    pitch: -80,
    fov: 40,
  });

  type DewarpViewName = "entrance" | "corridor" | "left_seats" | "right_seats";

  type DewarpViewCfg = {
    name: DewarpViewName;
    label?: string;
    roll_deg: number;
    pitch_deg: number;
    fov_deg: number;
  };

  type DewarpKey = "roll_deg" | "pitch_deg" | "fov_deg";

  const DEFAULT_DEWARP_VIEWS: DewarpViewCfg[] = [
    { name: "entrance",    label: "entrance",    roll_deg: -105, pitch_deg: -70, fov_deg: 40 },
    { name: "corridor",    label: "corridor",    roll_deg: -100, pitch_deg: -55, fov_deg: 70 },
    { name: "left_seats",  label: "left_seats",  roll_deg: 180,  pitch_deg: -55, fov_deg: 80 },
    { name: "right_seats", label: "right_seats", roll_deg: 160,  pitch_deg: 45,  fov_deg: 80 },
  ];

  // -----------------------------
  // RTSP Manage UI state
  // -----------------------------
  const [rtspId, setRtspId] = useState("");
  const [rtspName, setRtspName] = useState("");
  const [rtspUrl, setRtspUrl] = useState("");
  const [rtspSaving, setRtspSaving] = useState(false);

  const [dewarpViews, setDewarpViews] = useState<DewarpViewCfg[]>(DEFAULT_DEWARP_VIEWS);
  const [activeDewarpView, setActiveDewarpView] = useState<DewarpViewName>("entrance");
  const currentViewCfg: DewarpViewCfg =
    dewarpViews.find(v => v.name === activeDewarpView) ?? DEFAULT_DEWARP_VIEWS[0];

  const setCurrentViewCfg = (patch: Partial<DewarpViewCfg>) => {
    setDewarpViews(prev =>
      prev.map(v => (v.name === activeDewarpView ? { ...v, ...patch } : v))
    );
  };

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // ✅ settings per video (instead of demo cameras)
  const [cameraSettings, setCameraSettings] = useState<CameraSettings[]>([]);

  // -----------------------------
  // Rename (offline label) UI state
  // -----------------------------
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState<string>("");
  const [renameSavingId, setRenameSavingId] = useState<string | null>(null);

  const beginRename = (id: string, currentName: string) => {
    setEditingId(id);
    setEditName(currentName ?? "");
  };

  const cancelRename = () => {
    setEditingId(null);
    setEditName("");
  };

  const saveRename = async (id: string) => {
    const next = editName.trim();
    if (!next) return alert("Name cannot be empty.");

    const src = videoSources.find(s => s.id === id);
    if (!src) return;

    setRenameSavingId(id);

    try {
      if (src.kind === "rtsp") {
        // RTSP upsert requires url too
        const res = await fetch(`${API_BASE}/api/rtsp/sources/${encodeURIComponent(id)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: next, url: src.url || "" }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.detail || `HTTP ${res.status}`);
      } else {
        // offline alias
        const res = await fetch(`${API_BASE}/api/offline/labels/${encodeURIComponent(id)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: next }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.detail || `HTTP ${res.status}`);
      }

      // update UI lists
      setCameraSettings(prev => prev.map(v => (v.id === id ? { ...v, name: next } : v)));
      setVideoSources(prev => prev.map(v => (v.id === id ? { ...v, name: next } : v)));

      cancelRename();
    } catch (e: any) {
      alert(`Rename failed: ${e?.message || e}`);
    } finally {
      setRenameSavingId(null);
    }
  };

  async function refreshSources() {
    const [offline, rtsp] = await Promise.all([fetchOfflineSources(), fetchRtspSources()]);
    const merged = [...rtsp, ...offline];
    setVideoSources(merged);

    // keep selection valid + sync kind
    setSelectedCamera(prev => {
      const nextId = prev && merged.some(s => s.id === prev) ? prev : (merged[0]?.id ?? "");
      const src = merged.find(s => s.id === nextId);
      if (src) setSelectedKind(src.kind);
      return nextId;
    });
  }

  async function addOrUpdateRtsp() {
    const id = rtspId.trim();
    const url = rtspUrl.trim();
    const name = (rtspName.trim() || id);

    if (!id) return alert("RTSP ID is required.");
    const lower = url.toLowerCase();
    if (!lower.startsWith("rtsp://") && !lower.startsWith("rtsps://")) {
      return alert("URL must start with rtsp:// or rtsps://");
    }

    setRtspSaving(true);
    try {
      // 1) Upsert RTSP source
      const res = await fetch(`${API_BASE}/api/rtsp/sources/${encodeURIComponent(id)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, url }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.detail || `HTTP ${res.status}`);

      // 2) Force it OFF in attire enabled-sources store (so LiveView won't auto-start it)
      try {
        const res2 = await fetch(`${API_BASE}/api/attire/sources/${encodeURIComponent(id)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled: false }),
        });
        const data2 = await res2.json().catch(() => ({}));
        if (!res2.ok) throw new Error(data2?.detail || `HTTP ${res2.status}`);
      } catch (e: any) {
        // Don’t fail RTSP add; just warn
        console.warn("Force-disable RTSP failed:", e);
        alert(`RTSP added, but failed to force-disable it: ${e?.message || e}`);
      }

      // 3) Refresh list + clear form
      await refreshSources();
      setRtspId("");
      setRtspName("");
      setRtspUrl("");
    } catch (e: any) {
      alert(`RTSP save failed: ${e?.message || e}`);
    } finally {
      setRtspSaving(false);
    }
  }

  async function deleteRtsp(id: string) {
    if (!id) return;
    if (!confirm(`Delete RTSP source "${id}"?`)) return;

    setRtspSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/rtsp/sources/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.detail || `HTTP ${res.status}`);

      await refreshSources();
      setSelectedCamera(prev => (prev === id ? "" : prev));

      // if deleted item was selected, select first available
      setSelectedCamera((prev) => {
        if (prev !== id) return prev;
        const next = videoSources.filter(s => s.id !== id);
        return next[0]?.id ?? "";
      });
    } catch (e: any) {
      alert(`RTSP delete failed: ${e?.message || e}`);
    } finally {
      setRtspSaving(false);
    }
  }

  const [rois, setRois] = useState<RoiMap>({});
  const [lastSavedRois, setLastSavedRois] = useState<RoiMap>({});
  const [activeView, setActiveView] = useState<string>("normal"); // entrance/corridor/...
  const [currentPoly, setCurrentPoly] = useState<Point[]>([]);
  const [isMosaic, setIsMosaic] = useState<boolean>(false);
  const [previewNonce, setPreviewNonce] = useState(0);

  async function loadEnabledSourcesIntoSettings() {
    try {
      const res = await fetch(`${API_BASE}/api/attire/sources`);
      const data = await res.json();
      const enabledMap = (data?.sources || {}) as Record<string, boolean>;

      setCameraSettings(prev =>
        prev.map(cam => ({
          ...cam,
          enabled: enabledMap[cam.id] ?? true,
        }))
      );
    } catch {}
  }

  // auto-detect fisheye/mosaic mode from backend (no checkbox)
  useEffect(() => {
    if (!selectedCamera) return
    if (!selectedSource) return;

    let alive = true;

    (async () => {
      try {
        const url =
          selectedKind === "rtsp"
            ? `${API_BASE}/api/rtsp/meta/${selectedCamera}`
            : `${API_BASE}/api/offline/meta/${selectedCamera}`;

        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const meta = await res.json();

        if (!alive) return;

        const mosaic = !!meta?.is_fisheye;
        setIsMosaic(mosaic);
        setActiveView(mosaic ? "entrance" : "normal");
        setCurrentPoly([]);
      } catch {
        if (!alive) return;
        setIsMosaic(false);
        setActiveView("normal");
        setCurrentPoly([]);
      }
    })();

    return () => { alive = false; };
  }, [selectedCamera, selectedKind]);

  // load backend videos ONCE
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const [offline, rtsp] = await Promise.all([
          fetchOfflineSources(),
          fetchRtspSources(),
        ]);

        if (!alive) return;

        const merged = [...rtsp, ...offline];
        setVideoSources(merged);

        const prevId = selectedCamera; // capture current value
        const nextId =
          (prevId && merged.some(s => s.id === prevId))
            ? prevId
            : (merged[0]?.id ?? "");

        setSelectedCamera(nextId);

        const src = merged.find(s => s.id === nextId);
        if (src) setSelectedKind(src.kind);
      } catch {
        if (!alive) return;
        setVideoSources([]);
        setSelectedCamera("");
      }
    })();

    return () => { alive = false; };
  }, []);

  // build per-video settings when list updates
  useEffect(() => {
    setCameraSettings((prev) => {
      const prevMap = new Map(prev.map((p) => [p.id, p]));
      return videoSources.map((v) => {
        const old = prevMap.get(v.id);
        return {
          id: v.id,
          name: v.name,
          enabled: old?.enabled ?? false,
          dewarp: old?.dewarp ?? { roll: -105, pitch: -80, fov: 40 },
        };
      });
    });
  }, [videoSources]);

  useEffect(() => {
    if (!videoSources.length) return;

    let alive = true;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/attire/sources`);
        const data = await res.json();
        const enabledMap = (data?.sources || {}) as Record<string, boolean>;

        if (!alive) return;

        // merge into cameraSettings enabled
        setCameraSettings(prev =>
          prev.map(cam => ({
            ...cam,
            enabled: enabledMap[cam.id] ?? cam.enabled ?? true, // default ON
          }))
        );
      } catch {
        // ignore (fallback to current enabled state)
      }
    })();

    return () => { alive = false; };
  }, [videoSources]);

  useEffect(() => {
    const onChanged = () => loadEnabledSourcesIntoSettings();

    window.addEventListener("attire:sourcesChanged", onChanged);
    window.addEventListener("storage", onChanged);

    return () => {
      window.removeEventListener("attire:sourcesChanged", onChanged);
      window.removeEventListener("storage", onChanged);
    };
  }, []);

  useEffect(() => {
    if (activeTab !== "roi") return;
    if (!selectedCamera) return;

    if (isMosaic && roiMode === "dewarp") return;

    setPreviewNonce((n) => n + 1);
  }, [activeTab, selectedCamera, roiMode, isMosaic, activeView]);

  useEffect(() => {
    if (!isMosaic && roiMode === "dewarp") setRoiMode("roi");
  }, [isMosaic, roiMode]);

  useEffect(() => {
    if (!selectedCamera || !isMosaic) return;

    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/attire/dewarp/${selectedCamera}`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        const viewsRaw = Array.isArray(data?.views) ? data.views : DEFAULT_DEWARP_VIEWS;

        // normalize: ensure label exists
        const views: DewarpViewCfg[] = viewsRaw.map((v: any) => ({
          name: v.name,
          label: (v.label ?? v.name),
          roll_deg: Number(v.roll_deg),
          pitch_deg: Number(v.pitch_deg),
          fov_deg: Number(v.fov_deg),
        }));

        setDewarpViews(views);
        setActiveDewarpView("entrance");
      } catch {
        setDewarpViews(DEFAULT_DEWARP_VIEWS);
        setActiveDewarpView("entrance");
      }
    })();
  }, [selectedCamera, isMosaic]);

  const prevSourceRef = useRef<{ id: string; kind: SourceKind } | null>(null);

  useEffect(() => {
    const prev = prevSourceRef.current;
    if (prev && prev.id !== selectedCamera) {
      const closeUrl =
        prev.kind === "rtsp"
          ? `${API_BASE}/api/rtsp/close/${prev.id}`
          : `${API_BASE}/api/offline/close/${prev.id}`;

      fetch(closeUrl, { method: "POST" }).catch(() => {});
    }

    prevSourceRef.current = selectedCamera
      ? { id: selectedCamera, kind: selectedKind }
      : null;
  }, [selectedCamera, selectedKind]);

  function clampNum(v: number, min: number, max: number) {
    return Math.max(min, Math.min(max, v));
  }

  const nudge = (key: DewarpKey, delta: number) => {
    const limits: Record<DewarpKey, { min: number; max: number; step: number }> = {
      roll_deg:  { min: -180, max: 180, step: 1 },
      pitch_deg: { min: -90,  max: 90,  step: 1 },
      fov_deg:   { min: 10,   max: 120, step: 1 },
    };

    const { min, max } = limits[key];
    const cur = currentViewCfg[key];  
    setCurrentViewCfg({ [key]: clampNum(cur + delta, min, max) } as Pick<DewarpViewCfg, DewarpKey>);
  };

  const selectedCameraData = cameraSettings.find((cam) => cam.id === selectedCamera);

  // Snapshot preview (single JPEG) from backend
  const selectedCameraImage = selectedCamera
    ? (() => {
        if (selectedKind === "rtsp") {
          // RTSP supports both snapshot and snapshot_dewarp
          return isMosaic
            ? `${API_BASE}/api/rtsp/snapshot_dewarp/${selectedCamera}?ver=${previewNonce}`
            : `${API_BASE}/api/rtsp/snapshot/${selectedCamera}?ver=${previewNonce}`;
        }
        // offline
        return isMosaic
          ? `${API_BASE}/api/offline/snapshot_dewarp/${selectedCamera}?ver=${previewNonce}`
          : `${API_BASE}/api/offline/snapshot/${selectedCamera}?ver=${previewNonce}`;
      })()
    : "";

  const [streamFps, setStreamFps] = useState<number>(0);  // 0 = AUTO/native
  const [detectFps, setDetectFps] = useState<number>(2);  // YOLO inference rate
  const [violationTypes, setViolationTypes] = useState<ViolationTypeSettings[]>([
    { name: 'Sleeveless', enabled: true, icon: '👕' },
    { name: 'Shorts', enabled: true, icon: '🩳' },
    { name: 'Slippers', enabled: true, icon: '🩴' },
  ]);
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const enabled = await fetchViolationTypes();
        if (!alive) return;

        setViolationTypes((prev) =>
          prev.map((v) => ({
            ...v,
            enabled: enabled[UI_TO_KEY[v.name]] ?? true, // default ON
          }))
        );
      } catch {
        // ignore -> keep defaults
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const [notifCfg, setNotifCfg] = useState<AttireNotifConfig>({
    enabled: true,
    cooldown_sec: 30,
    toast_sec: 6,
    play_sound: false,
  });

  const [retentionEnabled, setRetentionEnabled] = useState<boolean>(true);
  const [retentionDays, setRetentionDays] = useState<number>(7);
  const [retentionSaving, setRetentionSaving] = useState(false);
  const [clearingEvents, setClearingEvents] = useState(false);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const cfg = await fetchRetentionConfig();
        if (!alive) return;

        setRetentionEnabled(Boolean(cfg?.enabled ?? true));
        setRetentionDays(
          clampRetentionDays(Number(cfg?.retention_days ?? 7))
        );
      } catch {
        // keep defaults
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const cfg = await fetchNotifConfig();
        if (!alive) return;
        setNotifCfg(cfg);
      } catch {
        // keep defaults
      }
    })();
    return () => { alive = false; };
  }, []);

  // Schedule-based detection settings
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [timeSchedules, setTimeSchedules] = useState<TimeSchedule[]>([
    {
      id: '1',
      startTime: '08:00',
      endTime: '18:00',
      enabled: true,
      days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
    }
  ]);

  useEffect(() => {
    if (selectedCameraData?.dewarp) setDewarp(selectedCameraData.dewarp);
  }, [selectedCamera, selectedCameraData]);

  useEffect(() => {
    if (!selectedCamera) return;

    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/attire/roi/${selectedCamera}`);
        const data = await res.json();

        const loaded = (data?.rois || {}) as RoiMap;
        setRois(loaded);
        setLastSavedRois(loaded); // ✅ snapshot from backend
      } catch {
        setRois({});
        setLastSavedRois({}); // ✅ snapshot also cleared
      }

      setCurrentPoly([]);
      // don’t force "normal" here because mode might be mosaic
      // activeView will be set by the meta effect
    })();
  }, [selectedCamera]);

  useEffect(() => {
    if (!selectedCamera) return;

    let alive = true;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/attire/fps/${selectedCamera}`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (!alive) return;

        setStreamFps(Number(data?.stream_fps ?? 12));
        setDetectFps(Number(data?.detect_fps ?? 2));
      } catch {
        if (!alive) return;
        setStreamFps(12);
        setDetectFps(2);
      }
    })();

    return () => {
      alive = false;
    };
  }, [selectedCamera]);

  useEffect(() => {
    if (activeTab !== "roi") return;
    if (!selectedCamera) return;
    if (!isMosaic) return;
    if (roiMode !== "dewarp") return;

    const myJob = ++previewJobRef.current;

    const timer = window.setTimeout(async () => {
      try {
        const viewsToSend = latestViewsRef.current; // ✅ always latest

        const res = await fetch(`${API_BASE}/api/attire/dewarp_preview/${selectedCamera}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ views: viewsToSend }),
        });
        if (!res.ok) return;

        const data = await res.json();

        // If a newer job started, ignore this one
        if (myJob !== previewJobRef.current) return;

        // ✅ use backend ver (no polling, no nonce++)
        setPreviewNonce(data.ver);
      } catch {
        // ignore
      }
    }, 80);

    return () => window.clearTimeout(timer);
  }, [activeTab, selectedCamera, isMosaic, roiMode, dewarpViews]);

  useEffect(() => {
    if (activeTab !== "roi") return;
    drawCanvas();
  }, [activeTab, rois, currentPoly, activeView, isMosaic, roiMode, previewNonce]);

  const drawCanvas = () => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // MJPEG image may not be ready yet
    if (!image.complete || image.naturalWidth === 0) return;

    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(image, 0, 0, w, h);

    const drawPoly = (
      poly: Point[],
      tile: { x0: number; y0: number; tw: number; th: number }
    ) => {
      if (poly.length < 2) return;

      ctx.beginPath();
      for (let i = 0; i < poly.length; i++) {
        const [xp, yp] = poly[i];
        const x = tile.x0 + (xp / 100) * tile.tw;
        const y = tile.y0 + (yp / 100) * tile.th;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();

      // fill ROI region with half opacity
      ctx.fillStyle = "rgba(249, 115, 22, 0.35)";
      ctx.fill();

      // keep orange outline
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#f97316";
      ctx.stroke();

      // keep vertex points
      for (const [xp, yp] of poly) {
        const x = tile.x0 + (xp / 100) * tile.tw;
        const y = tile.y0 + (yp / 100) * tile.th;
        ctx.fillStyle = "#f97316";
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const tiles = {
      entrance:    { x0: 0,    y0: 0,    tw: w / 2, th: h / 2 },
      corridor:    { x0: w / 2,y0: 0,    tw: w / 2, th: h / 2 },
      left_seats:  { x0: 0,    y0: h / 2,tw: w / 2, th: h / 2 },
      right_seats: { x0: w / 2,y0: h / 2,tw: w / 2, th: h / 2 },
      normal:      { x0: 0,    y0: 0,    tw: w,     th: h },
    } as const;

    // draw saved polys
    for (const [view, polys] of Object.entries(rois)) {
      const tile = (tiles as any)[view] || tiles.normal;
      for (const poly of polys || []) drawPoly(poly, tile);
    }

    // draw current poly (preview while drawing)
    if (currentPoly.length >= 1) {
      const tile = (tiles as any)[activeView] || tiles.normal;

      ctx.beginPath();
      currentPoly.forEach(([xp, yp], i) => {
        const x = tile.x0 + (xp / 100) * tile.tw;
        const y = tile.y0 + (yp / 100) * tile.th;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });

      ctx.lineWidth = 2;
      ctx.strokeStyle = "#f97316";
      ctx.stroke();

      // draw points
      currentPoly.forEach(([xp, yp]) => {
        const x = tile.x0 + (xp / 100) * tile.tw;
        const y = tile.y0 + (yp / 100) * tile.th;
        ctx.fillStyle = "#f97316";
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  };

  const handleToggleCamera = async (cameraId: string) => {
    // count how many are currently enabled
    const enabledCount = cameraSettings.filter(c => c.enabled).length;
    const cur = cameraSettings.find(c => c.id === cameraId);
    if (!cur) return;

    const nextEnabled = !cur.enabled;

    // enforce max 4 ON
    if (nextEnabled && enabledCount >= maxOfflineEnabled) {
      alert(`You can enable maximum ${maxOfflineEnabled} video source(s) for Live View (webcam slot reserved).`);
      return;
    }

    // optimistic UI update
    setCameraSettings(prev =>
      prev.map(cam => cam.id === cameraId ? { ...cam, enabled: nextEnabled } : cam)
    );

    try {
      const res = await fetch(`${API_BASE}/api/attire/sources/${cameraId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: nextEnabled }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      // optional: nudge other tabs/windows to refresh
      localStorage.setItem("attire:enabledSourcesVer", String(Date.now()));
      window.dispatchEvent(new Event("attire:sourcesChanged"));
    } catch (e: any) {
      alert(`Failed to save camera status: ${e?.message || e}`);

      // rollback UI if save fails
      setCameraSettings(prev =>
        prev.map(cam => cam.id === cameraId ? { ...cam, enabled: cur.enabled } : cam)
      );
    }
  };

  const handleToggleViolationType = (violationName: string) => {
    setViolationTypes(prev =>
      prev.map(violation =>
        violation.name === violationName
          ? { ...violation, enabled: !violation.enabled }
          : violation
      )
    );
  };

  const handleSaveNotificationsSettings = async () => {
    try {
      await saveNotifConfig(notifCfg);

      // notify App.tsx to refresh config (no reload)
      localStorage.setItem("attire:notifCfgVer", String(Date.now()));
      window.dispatchEvent(new Event("attire:notifChanged"));

      alert("Notification settings saved!");
    } catch (e: any) {
      alert(`Save notification settings failed: ${e?.message || e}`);
    }
  };

  const handleSaveViolationSettings = async () => {
    try {
      const enabledPayload = violationTypes.reduce((acc, v) => {
        acc[UI_TO_KEY[v.name]] = !!v.enabled;
        return acc;
      }, {} as Record<ViolationKey, boolean>);

      await saveViolationTypes(enabledPayload);

      // optional: notify other tabs/pages if you want
      localStorage.setItem("attire:violationTypesVer", String(Date.now()));

      alert("Violation settings saved");
    } catch (e: any) {
      alert(`Failed to save violation settings: ${e?.message || e}`);
    }
  };

  const handleSaveTimingSettings = async () => {
    // Apply to ALL videos (consistent behaviour)
    const ids = videoSources.map((v) => v.id).filter(Boolean);
    if (!ids.length) return;

    try {
      const results = await Promise.allSettled(
        ids.map((id) =>
          fetch(`${API_BASE}/api/attire/fps/${id}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              stream_fps: streamFps,
              detect_fps: detectFps,
            }),
          }).then(async (res) => {
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data?.detail || `HTTP ${res.status}`);
            return true;
          })
        )
      );

      const failed = results.filter((r) => r.status === "rejected").length;
      if (failed) {
        alert(`Timing saved, but ${failed} video(s) failed.`);
      } else {
        alert("Timing (FPS) saved for all videos");
      }
    } catch (e: any) {
      alert(`Save Timing failed: ${e?.message || e}`);
    }
  };

  const handleSaveRetentionSettings = async () => {
    setRetentionSaving(true);
    try {
      const safeDays = clampRetentionDays(retentionDays);
      setRetentionDays(safeDays);

      const data = await saveRetentionConfig(retentionEnabled, safeDays);

      localStorage.setItem("attire:retentionVer", String(Date.now()));
      localStorage.setItem("attire:eventsVer", String(Date.now()));
      window.dispatchEvent(new Event("attire:retentionChanged"));
      window.dispatchEvent(new Event("attire:eventsChanged"));

      if (!retentionEnabled) {
        alert("Data retention disabled. Past attire data will be kept until manually cleared.");
      } else {
        alert(
          data?.pruned_events > 0
            ? `Retention saved. ${data.pruned_events} old event(s) were removed.`
            : "Data retention settings saved."
        );
      }
    } catch (e: any) {
      alert(`Save data retention failed: ${e?.message || e}`);
    } finally {
      setRetentionSaving(false);
    }
  };

  const handleClearAllEvents = async () => {
    const ok = window.confirm(
      "Clear ALL attire events and evidence images?\n\nThis will permanently remove all event records, violation history, dashboard/report data, and saved evidence snapshots."
    );
    if (!ok) return;

    setClearingEvents(true);
    try {
      const data = await clearAllAttireEventsApi();

      localStorage.setItem("attire:eventsVer", String(Date.now()));
      localStorage.setItem("attire:dashboardVer", String(Date.now()));
      window.dispatchEvent(new Event("attire:eventsChanged"));
      window.dispatchEvent(new Event("attire:dashboardChanged"));

      alert(`All attire events cleared successfully. Removed ${data?.cleared_events ?? 0} event(s).`);
    } catch (e: any) {
      alert(`Clear all events failed: ${e?.message || e}`);
    } finally {
      setClearingEvents(false);
    }
  };

  // Schedule management functions
  const handleAddSchedule = () => {
    const newSchedule: TimeSchedule = {
      id: Date.now().toString(),
      startTime: '09:00',
      endTime: '17:00',
      enabled: true,
      days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
    };
    setTimeSchedules([...timeSchedules, newSchedule]);
  };

  useEffect(() => {
    if (!selectedCamera) return;

    let alive = true;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/attire/schedule/${selectedCamera}`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (!alive) return;

        setScheduleEnabled(!!data?.enabled);
        setTimeSchedules(Array.isArray(data?.schedules) ? data.schedules : []);
      } catch {
        if (!alive) return;
        setScheduleEnabled(false);
        setTimeSchedules([
          { id: "1", startTime: "08:00", endTime: "18:00", enabled: true, days: ["Mon","Tue","Wed","Thu","Fri"] }
        ]);
      }
    })();

    return () => {
      alive = false;
    };
  }, [selectedCamera]);

  const handleSaveScheduleSettings = async () => {
    const ids = videoSources.map(v => v.id).filter(Boolean);
    if (!ids.length) return;

    // optional: prevent saving invalid schedule (no days)
    if (scheduleEnabled) {
      const bad = timeSchedules.some(s => s.enabled && (!s.days || s.days.length === 0));
      if (bad) {
        alert("Each enabled schedule must have at least 1 active day.");
        return;
      }
    }

    try {
      const results = await Promise.allSettled(
        ids.map(id =>
          fetch(`${API_BASE}/api/attire/schedule/${id}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              enabled: scheduleEnabled,
              schedules: timeSchedules,
            }),
          }).then(async (res) => {
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data?.detail || `HTTP ${res.status}`);
            return true;
          })
        )
      );

      const failed = results.filter(r => r.status === "rejected").length;
      alert(failed ? `Schedule saved, but ${failed} video(s) failed.` : "Schedule saved for all videos");
    } catch (e: any) {
      alert(`Save schedule failed: ${e?.message || e}`);
    }
  };

  const saveScheduleConfigForAll = async (enabled: boolean, schedules: TimeSchedule[]) => {
    const ids = videoSources.map(v => v.id).filter(Boolean);
    if (!ids.length) return;

    try {
      const results = await Promise.allSettled(
        ids.map(id =>
          fetch(`${API_BASE}/api/attire/schedule/${id}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ enabled, schedules }),
          }).then(async (res) => {
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data?.detail || `HTTP ${res.status}`);
            return true;
          })
        )
      );

      const failed = results.filter(r => r.status === "rejected").length;
      if (failed) alert(`Schedule updated, but ${failed} video(s) failed.`);
    } catch (e: any) {
      alert(`Auto-save schedule failed: ${e?.message || e}`);
    }
  };

  const onToggleScheduleEnabled = async (nextEnabled: boolean) => {
    if (!nextEnabled) {
      setScheduleEnabled(false);
      setTimeSchedules([]);
      await saveScheduleConfigForAll(false, []);
      return;
    }

    // turning ON
    const nextSchedules =
      (timeSchedules && timeSchedules.length > 0)
        ? timeSchedules
        : [{ id: "1", startTime: "08:00", endTime: "18:00", enabled: true, days: ["Mon","Tue","Wed","Thu","Fri"] }];

    setScheduleEnabled(true);
    setTimeSchedules(nextSchedules);
    await saveScheduleConfigForAll(true, nextSchedules);
  };

  const handleFinishPolygon = () => {
    if (currentPoly.length < 3) {
      alert("Please add at least 3 points to finish the polygon.");
      return;
    }

    setRois((prev) => {
      const cur = prev[activeView] || [];
      return { ...prev, [activeView]: [...cur, currentPoly] };
    });
    setCurrentPoly([]);
  };

  const handleUndoPoint = () => {
    setCurrentPoly((prev) => prev.slice(0, -1));
  };

  const handleRevertLastSaved = () => {
    setCurrentPoly([]);
    setRois(lastSavedRois);
    setActiveView(isMosaic ? "entrance" : "normal");
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const xPctGlobal = ((e.clientX - rect.left) / rect.width) * 100;
    const yPctGlobal = ((e.clientY - rect.top) / rect.height) * 100;

    const { view, xPct, yPct } = getViewAndLocalPercent(xPctGlobal, yPctGlobal);

    setActiveView(view);
    setCurrentPoly((prev) => [...prev, [xPct, yPct]]);
  };

  const latestViewsRef = useRef<DewarpViewCfg[]>(dewarpViews);
  useEffect(() => {
    latestViewsRef.current = dewarpViews;
  }, [dewarpViews]);

  const previewJobRef = useRef(0);

  async function waitForImage(url: string, tries = 6, gapMs = 80) {
    for (let i = 0; i < tries; i++) {
      const ok = await new Promise<boolean>((resolve) => {
        const img = new Image();
        img.onload = () => resolve(true);
        img.onerror = () => resolve(false);
        img.src = url;
      });
      if (ok) return true;
      await new Promise((r) => setTimeout(r, gapMs));
    }
    return false;
  }

  function clamp(v: number, a: number, b: number) {
    return Math.max(a, Math.min(b, v));
  }

  // Return which tile was clicked + local percent within that tile
  function getViewAndLocalPercent(
    xPctGlobal: number,
    yPctGlobal: number
  ): { view: string; xPct: number; yPct: number } {
    // If fisheye mosaic, assume 2x2
    // top-left=entrance, top-right=corridor, bottom-left=left_seats, bottom-right=right_seats
    if (!isMosaic) return { view: "normal", xPct: xPctGlobal, yPct: yPctGlobal };

    const left = xPctGlobal < 50;
    const top = yPctGlobal < 50;

    const view =
      top && left ? "entrance" :
      top && !left ? "corridor" :
      !top && left ? "left_seats" :
      "right_seats";

    const xLocal = left ? (xPctGlobal / 50) * 100 : ((xPctGlobal - 50) / 50) * 100;
    const yLocal = top  ? (yPctGlobal / 50) * 100 : ((yPctGlobal - 50) / 50) * 100;

    return { view, xPct: clamp(xLocal, 0, 100), yPct: clamp(yLocal, 0, 100) };
  }

  const handleSaveDewarp = async () => {
    if (!selectedCamera) return;

    try {
      const res = await fetch(`${API_BASE}/api/attire/dewarp/${selectedCamera}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ views: dewarpViews }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.detail || `HTTP ${res.status}`);

      alert("Dewarp saved");
    } catch (e: any) {
      alert(`Save Dewarp failed: ${e?.message || e}`);
    }
  };

  const handleResetDewarp = () => {
    setDewarpViews(DEFAULT_DEWARP_VIEWS);
    setActiveDewarpView("entrance");
  };

  const handleSaveROI = async () => {
    if (!selectedCamera) return;

    // auto-commit current polygon if >= 3 points
    let roisToSave = rois;
    if (currentPoly.length >= 3) {
      roisToSave = {
        ...rois,
        [activeView]: [...(rois[activeView] || []), currentPoly],
      };
      setRois(roisToSave);
      setCurrentPoly([]);
    }

    try {
      const res = await fetch(`${API_BASE}/api/attire/roi/${selectedCamera}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rois: roisToSave }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setLastSavedRois(roisToSave); // ✅ update snapshot
      alert("ROI saved");
    } catch (e: any) {
      alert(`Save ROI failed: ${e?.message || e}`);
    }
  };

  const handleRemoveSchedule = (id: string) => {
    setTimeSchedules(timeSchedules.filter(schedule => schedule.id !== id));
  };

  const handleToggleSchedule = (id: string) => {
    setTimeSchedules(timeSchedules.map(schedule =>
      schedule.id === id ? { ...schedule, enabled: !schedule.enabled } : schedule
    ));
  };

  const handleUpdateScheduleTime = (id: string, field: 'startTime' | 'endTime', value: string) => {
    setTimeSchedules(timeSchedules.map(schedule =>
      schedule.id === id ? { ...schedule, [field]: value } : schedule
    ));
  };

  const handleToggleDay = (scheduleId: string, day: string) => {
    setTimeSchedules(timeSchedules.map(schedule => {
      if (schedule.id === scheduleId) {
        const days = schedule.days.includes(day)
          ? schedule.days.filter(d => d !== day)
          : [...schedule.days, day];
        return { ...schedule, days };
      }
      return schedule;
    }));
  };

  const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  return (
    <div className="flex-1 p-6 overflow-y-auto text-[15px]">
      {/* Page Header */}
      <div className="mb-6">
        <h2 className="text-white text-2xl font-semibold mb-1">Attire Compliance Settings</h2>
        <p className="text-slate-400 text-[15px]">
          Configure dress code compliance detection system
        </p>
      </div>

      {/* Tabs */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-lg mb-6">
        <div className="flex border-b border-slate-800">
          {[
            { id: 'sources', label: 'Video Sources', icon: Video },
            { id: 'roi', label: 'ROI Configuration', icon: Camera },
            { id: 'timing', label: 'Timing Control', icon: Clock },
            { id: 'violations', label: 'Violation Types', icon: Square },
            { id: 'notifications', label: 'Notifications', icon: Bell },
            { id: 'retention', label: 'Data Retention', icon: Trash2 },
          ].map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-6 py-4 text-[15px] font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-orange-500 text-white'
                    : 'border-transparent text-slate-400 hover:text-white'
                }`}
              >
                <Icon className="w-[18px] h-[18px]" />
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="p-6">
          {/* Video Sources Tab */}
          {activeTab === 'sources' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-white text-xl font-semibold mb-1">Video Sources Management</h3>
                <p className="text-slate-400 text-[15px]">
                  Add RTSP sources and manage which video feeds are enabled for the system
                </p>
              </div>

              {/* RTSP Manage */}
              <div className="border-t border-slate-700 pt-6">
                <div className="mb-4">
                  <h4 className="text-white text-lg font-semibold mb-1">RTSP Manage</h4>
                  <p className="text-slate-400 text-[15px]">
                    Add or update RTSP sources so they appear in Settings (rtsp-ready).
                  </p>
                </div>

                <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-5 space-y-4 max-w-4xl">
                  {/* Row 1: ID + Name */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-slate-300 text-sm mb-1.5">RTSP ID</label>
                      <input
                        value={rtspId}
                        onChange={(e) => setRtspId(e.target.value)}
                        placeholder="e.g. cam01"
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-[15px]"
                        disabled={rtspSaving}
                      />
                    </div>

                    <div>
                      <label className="block text-slate-300 text-sm mb-1.5">Name (optional)</label>
                      <input
                        value={rtspName}
                        onChange={(e) => setRtspName(e.target.value)}
                        placeholder="e.g. Lobby Entrance"
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-[15px]"
                        disabled={rtspSaving}
                      />
                    </div>
                  </div>

                  {/* Row 2: RTSP URL + buttons on right */}
                  <div className="flex flex-col md:flex-row md:items-end gap-4">
                    <div className="flex-1">
                      <label className="block text-slate-300 text-sm mb-1.5">RTSP URL</label>
                      <input
                        value={rtspUrl}
                        onChange={(e) => setRtspUrl(e.target.value)}
                        placeholder="rtsp://admin:password@ip:554/Streaming/Channels/102/"
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-[15px]"
                        disabled={rtspSaving}
                      />

                      <div className="mt-2 rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-3 text-xs text-slate-400 space-y-2">
                        <div>
                          <span className="text-slate-300 font-medium">Format:</span>
                          <div className="mt-1 font-mono text-[12px] text-slate-300 break-all">
                            rtsp://username:password@ip:port/Streaming/Channels/{"{channel}"}/
                          </div>
                        </div>

                        <div>
                          <span className="text-slate-300 font-medium">Notes:</span>
                          <ul className="mt-1 list-disc pl-5 space-y-1">
                            <li>Use Channel 102 for smoother real-time performance.</li>
                            <li>Channel 101 is higher definition but heavier to process.</li>
                            <li>If password contains '@', replace it with '%40'.</li>
                          </ul>
                        </div>

                        <div>
                          <span className="text-slate-300 font-medium">Example:</span>
                          <div className="mt-1 font-mono text-[12px] text-slate-300 break-all">
                            rtsp://admin:cctv%402268@10.123.41.192:554/Streaming/Channels/102/
                          </div>
                        </div>
                      </div>

                      {rtspUrl.includes("@") && !rtspUrl.includes("%40") && (
                        <div className="mt-2 text-xs text-yellow-400">
                          ⚠️ If your password contains '@', encode it as '%40'.
                        </div>
                      )}
                    </div>

                    <div className="flex items-end justify-end gap-2 shrink-0 md:pb-[1px]">
                      <button
                        onClick={addOrUpdateRtsp}
                        disabled={rtspSaving}
                        className="px-4 py-2.5 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white rounded-lg transition-colors text-[15px] font-medium"
                      >
                        {rtspSaving ? "Saving..." : "Add / Update RTSP"}
                      </button>

                      <button
                        onClick={() => {
                          setRtspId("");
                          setRtspName("");
                          setRtspUrl("");
                        }}
                        disabled={rtspSaving}
                        className="px-4 py-2.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white rounded-lg transition-colors text-[15px] font-medium"
                      >
                        Clear
                      </button>
                    </div>
                  </div>

                  <div className="pt-2">
                    <div className="text-slate-300 text-[15px] mb-2">Existing RTSP sources</div>

                    <div className="space-y-2">
                      {videoSources.filter(s => s.kind === "rtsp").length === 0 ? (
                        <div className="text-slate-500 text-sm">No RTSP sources yet.</div>
                      ) : (
                        videoSources
                          .filter(s => s.kind === "rtsp")
                          .map((s) => (
                            <div
                              key={s.id}
                              className="flex items-center justify-between bg-slate-900/40 border border-slate-700 rounded-lg p-3"
                            >
                              <div className="min-w-0">
                                <div className="text-white text-[15px] font-medium truncate">{s.name}</div>
                                <div className="text-slate-400 text-sm truncate">{s.id}</div>
                                <div className="text-slate-500 text-sm truncate">{s.url}</div>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                <button
                                  onClick={() => {
                                    setRtspId(s.id);
                                    setRtspName(s.name ?? "");
                                    setRtspUrl(s.url ?? "");
                                  }}
                                  disabled={rtspSaving}
                                  className="px-3 py-2.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white rounded-lg text-[15px]"
                                  title="Load into form"
                                >
                                  Edit
                                </button>

                                <button
                                  onClick={() => deleteRtsp(s.id)}
                                  disabled={rtspSaving}
                                  className="px-3 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg text-[15px]"
                                  title="Delete RTSP source"
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                          ))
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Camera Feed Status */}
              <div>
                <label className="block text-slate-400 text-sm mb-3">Camera Feed Status</label>
                <div className="space-y-2 max-w-2xl">
                  {cameraSettings.map((cam) => {
                    const isEditing = editingId === cam.id;
                    const isSaving = renameSavingId === cam.id;

                    return (
                      <div
                        key={cam.id}
                        className="flex items-center justify-between bg-slate-800/50 rounded-lg p-4"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <Camera className="w-5 h-5 text-slate-400" />
                          <div className="min-w-0">
                            {!isEditing ? (
                              <>
                                <div className="text-white truncate">{cam.name}</div>
                                <div className="text-slate-400 text-xs truncate">{cam.id}</div>
                              </>
                            ) : (
                              <div className="flex items-center gap-2">
                                <input
                                  value={editName}
                                  onChange={(e) => setEditName(e.target.value)}
                                  className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm w-64"
                                  disabled={isSaving}
                                  autoFocus
                                />

                                <button
                                  onClick={() => saveRename(cam.id)}
                                  disabled={isSaving}
                                  className="p-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 rounded-lg text-white"
                                  title="Save"
                                >
                                  <Check className="w-4 h-4" />
                                </button>

                                <button
                                  onClick={cancelRename}
                                  disabled={isSaving}
                                  className="p-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 rounded-lg text-white"
                                  title="Cancel"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => beginRename(cam.id, cam.name)}
                            disabled={isEditing || isSaving}
                            className="p-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 rounded-lg text-white"
                            title="Edit name"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>

                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={cam.enabled}
                              onChange={() => handleToggleCamera(cam.id)}
                              className="sr-only peer"
                              disabled={isSaving}
                            />
                            <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-600"></div>
                          </label>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ROI Configuration Tab */}
          {activeTab === 'roi' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-white mb-1">Region of Interest (ROI) Configuration</h3>
                <p className="text-slate-400 text-sm">
                  Draw a region on the camera feed to limit attire compliance detection to specific areas
                </p>
              </div>

              <div>
                <label className="block text-slate-400 text-sm mb-2">Select Camera</label>
                <select
                  value={selectedCamera}
                  onChange={(e) => setSelectedCamera(e.target.value)}
                  className="w-full max-w-md bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white"
                >
                  {videoSources.length === 0 ? (
                    <option value="">No uploaded videos found</option>
                  ) : (
                    videoSources.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.kind === "rtsp" ? `[RTSP] ${v.name}` : `[OFFLINE] ${v.name}`}
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div className="flex gap-2 mb-4">
              <button
                onClick={() => setRoiMode("roi")}
                className={`px-4 py-2 rounded ${roiMode === "roi" ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-400"}`}
              >
                ROI
              </button>

              <button
                disabled={!isMosaic}
                onClick={() => isMosaic && setRoiMode("dewarp")}
                className={`px-4 py-2 rounded ${
                  roiMode === "dewarp" ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-400"
                } ${!isMosaic ? "opacity-40 cursor-not-allowed" : ""}`}
                title={!isMosaic ? "Dewarp is only available for fisheye videos" : ""}
              >
                Dewarp
              </button>
            </div>

              {roiMode === "dewarp" && isMosaic && (
                <div className="space-y-4 max-w-xl">
                  <div className="flex gap-2 flex-wrap">
                    {(["entrance","corridor","left_seats","right_seats"] as DewarpViewName[]).map(vn => (
                      <button
                        key={vn}
                        onClick={() => setActiveDewarpView(vn)}
                        className={`px-3 py-2 rounded-lg text-sm ${
                          activeDewarpView === vn ? "bg-orange-600 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                        }`}
                      >
                        {dewarpViews.find(v => v.name === vn)?.label ?? vn}
                      </button>
                    ))}
                  </div>

                  <div className="space-y-1">
                    <label className="text-slate-400 text-sm">Area name</label>
                    <input
                      value={currentViewCfg?.label ?? currentViewCfg?.name ?? ""}
                      onChange={(e) => setCurrentViewCfg({ label: e.target.value })}
                      placeholder="e.g. Lab Entrance"
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
                    />
                    <p className="text-slate-500 text-xs">
                      Change area display label.
                    </p>
                  </div>

                  {[
                      { key: "roll_deg",  label: "Roll",  min: -180, max: 180, step: 10, leftRight: true },
                      { key: "pitch_deg", label: "Pitch", min: -90,  max: 90,  step: 10, upDown: true },
                      { key: "fov_deg",   label: "FoV",   min: 10,   max: 120, step: 5,  plusMinus: true }, // FoV usually nicer at 5
                    ].map(({ key, label, min, max, step, leftRight, upDown, plusMinus }) => (
                    <div key={key} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="text-slate-400 text-sm">{label}</label>
                        <div className="text-xs text-slate-500">
                          {currentViewCfg[key as DewarpKey]}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {/* DECREASE */}
                        <button
                          type="button"
                          onClick={() => nudge(key as any, -step)}
                          className="p-2 bg-slate-800 hover:bg-slate-700 rounded-md text-slate-200"
                        >
                          {leftRight && <ArrowRight className="w-4 h-4" />}
                          {upDown && <ArrowUp className="w-4 h-4" />}
                          {plusMinus && <Plus className="w-4 h-4" />}
                        </button>

                        <input
                          type="range"
                          min={min}
                          max={max}
                          step={step}
                          value={currentViewCfg[key as DewarpKey]}
                          onChange={(e) =>
                            setCurrentViewCfg({ [key as DewarpKey]: Number(e.target.value) } as Pick<DewarpViewCfg, DewarpKey>)
                          }
                          className="w-full"
                        />

                        {/* INCREASE */}
                        <button
                          type="button"
                          onClick={() => nudge(key as any, +step)}
                          className="p-2 bg-slate-800 hover:bg-slate-700 rounded-md text-slate-200"
                        >
                          {leftRight && <ArrowLeft className="w-4 h-4" />}
                          {upDown && <ArrowDown className="w-4 h-4" />}
                          {plusMinus && <Minus className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-3">
                <div className="flex items-start justify-between gap-4">
                  {/* LEFT: description */}
                  <div>
                    <label className="text-slate-400 text-sm">
                      {roiMode === "roi"
                        ? "Draw ROI (Click to add points)"
                        : "Dewarp Configuration (Select view + adjust sliders)"}
                    </label>

                    <div className="mt-3">
                      {roiMode === "roi" ? (
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={handleFinishPolygon}
                            disabled={currentPoly.length < 3}
                            className="flex items-center gap-2 px-3 py-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors text-sm"
                          >
                            <Check className="w-4 h-4" />
                            Create ROI
                          </button>

                          <button
                            type="button"
                            onClick={handleUndoPoint}
                            disabled={currentPoly.length === 0}
                            className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors text-sm"
                          >
                            <Undo2 className="w-4 h-4" />
                            Undo Point
                          </button>

                          <button
                            type="button"
                            onClick={handleRevertLastSaved}
                            className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors text-sm"
                          >
                            <RotateCcw className="w-4 h-4" />
                            Revert to Last Saved
                          </button>
                        </div>
                      ) : (
                        <p className="text-slate-500 text-xs">
                          Choose a view (entrance/corridor/left/right), then tune Roll/Pitch/FoV
                        </p>
                      )}
                    </div>
                  </div>

                  {/* RIGHT: action buttons (top-right) */}
                  <div className="flex items-center gap-2 shrink-0">
                    {roiMode === "roi" ? (
                      <>
                        <button
                          onClick={() => {
                            setCurrentPoly([]);
                            setRois({});
                            setActiveView(isMosaic ? "entrance" : "normal");
                          }}
                          className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors text-sm"
                        >
                          <RotateCcw className="w-4 h-4" />
                          Clear ROI
                        </button>

                        <button
                          onClick={handleSaveROI}
                          className="flex items-center gap-2 px-3 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg transition-colors text-sm"
                        >
                          <Save className="w-4 h-4" />
                          Save ROI
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={handleResetDewarp}
                          className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors text-sm"
                        >
                          <RotateCcw className="w-4 h-4" />
                          Reset Dewarp
                        </button>

                        <button
                          onClick={handleSaveDewarp}
                          className="flex items-center gap-2 px-3 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg transition-colors text-sm"
                        >
                          <Save className="w-4 h-4" />
                          Save Dewarp
                        </button>
                      </>
                    )}
                  </div>
                </div>
                
                <div className="flex justify-center">
                  <div className="w-full max-w-4xl">
                    <div className="relative bg-slate-950 rounded-lg overflow-hidden border border-slate-700 aspect-video">
                      <img
                        ref={imageRef}
                        src={selectedCameraImage}
                        alt="Camera feed"
                        className="absolute inset-0 w-full h-full object-cover opacity-0 pointer-events-none select-none"
                        onLoad={drawCanvas}
                        onError={() => {
                          if (!selectedCamera) return;

                          const fallback =
                            selectedKind === "rtsp"
                              ? `${API_BASE}/api/rtsp/snapshot/${selectedCamera}?ver=${previewNonce}`
                              : `${API_BASE}/api/offline/snapshot/${selectedCamera}?ver=${previewNonce}`;

                          if (imageRef.current) imageRef.current.src = fallback;
                        }}
                      />

                      <canvas
                        ref={canvasRef}
                        width={800}
                        height={450}
                        className={`absolute inset-0 w-full h-full z-10 ${
                          roiMode === "roi" ? "cursor-crosshair" : "cursor-default"
                        }`}
                        onMouseDown={roiMode === "roi" ? handleCanvasClick : undefined}
                      />
                    </div>
                  </div>
                </div>
                
                <div className="bg-orange-900/20 border border-orange-800 rounded-lg p-3">
                  <p className="text-orange-300 text-sm">
                    {roiMode === "roi" ? (
                      <>
                        💡 Click to add points. Use <b>Finish Polygon</b> to save the current shape,
                        <b>Undo Point</b> to remove the last point, and <b>Revert to Last Saved</b> to restore the saved ROI.
                      </>
                    ) : (
                      <>
                        🎛️ Dewarp mode: Select a view (entrance/corridor/left/right), then adjust <b>Roll</b>, <b>Pitch</b>, and <b>FoV</b>.
                        Click <b>Save Dewarp</b> to apply changes. Use <b>Reset Dewarp</b> to restore defaults.
                      </>
                    )}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Timing Control Tab */}
          {activeTab === 'timing' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-white mb-1">Detection Timing Control</h3>
                <p className="text-slate-400 text-sm">
                  Configure detection frequency and schedule-based detection behavior
                </p>
              </div>

              <div className="space-y-6">
                {/* 1) Stream / Preview FPS */}
                <div>
                  <label className="block text-slate-400 text-sm mb-2">
                    Live View FPS: {streamFps === 0 ? "Auto (native)" : `${streamFps.toFixed(0)} fps`}
                  </label>
                  <p className="text-slate-500 text-xs mb-2">
                    Controls how smooth the preview looks (video refresh rate). Higher = smoother, but more CPU/network usage.
                  </p>

                  <input
                    type="range"
                    min="0"
                    max="30"
                    step="1"
                    value={streamFps}
                    onChange={(e) => setStreamFps(parseInt(e.target.value))}
                    className="w-full max-w-md"
                  />
                  <div className="flex justify-between max-w-md text-slate-500 text-xs mt-1">
                    <span>5 fps (lighter)</span>
                    <span>30 fps (smooth)</span>
                  </div>
                </div>

                {/* 2) Detection FPS */}
                <div>
                  <label className="block text-slate-400 text-sm mb-2">
                    Detection FPS: {detectFps.toFixed(1)} fps
                  </label>
                  <p className="text-slate-500 text-xs mb-2">
                    Controls how often YOLO runs. Higher = faster detection response, but more GPU/CPU load.
                  </p>

                  <input
                    type="range"
                    min="0.5"
                    max="10"
                    step="0.5"
                    value={detectFps}
                    onChange={(e) => setDetectFps(parseFloat(e.target.value))}
                    className="w-full max-w-md"
                  />
                  <div className="flex justify-between max-w-md text-slate-500 text-xs mt-1">
                    <span>0.5 fps (light)</span>
                    <span>10 fps (heavy)</span>
                  </div>
                </div>
              </div>
              <div className="pt-4">
                <button
                  onClick={handleSaveTimingSettings}
                  className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg transition-colors"
                >
                  <Save className="w-4 h-4" />
                  Save Timing Settings
                </button>
              </div>

              {/* Schedule-based Detection */}
              <div className="border-t border-slate-700 pt-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h4 className="text-white mb-1">Schedule-Based Detection</h4>
                    <p className="text-slate-400 text-sm">
                      Only detect violations during specific time periods
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={scheduleEnabled}
                      onChange={(e) => onToggleScheduleEnabled(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-600"></div>
                  </label>
                </div>
                {!scheduleEnabled && (
                  <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-3 mt-3">
                    <p className="text-slate-300 text-sm">
                      ✅ Schedule-based detection is <b>OFF</b>. The system will <b>always detect</b> violations regardless of time.
                      (This setting is auto-saved.)
                    </p>
                  </div>
                )}
                {scheduleEnabled && (
                  <div className="space-y-4">
                    <div className="bg-orange-900/20 border border-orange-800 rounded-lg p-3 mb-4">
                      <p className="text-orange-300 text-sm">
                        ⏰ When schedule-based detection is enabled, violations will only be detected during the configured time periods. Outside these times, detection will be paused.
                      </p>
                    </div>

                    {timeSchedules.map((schedule, index) => (
                      <div
                        key={schedule.id}
                        className="bg-slate-800/50 rounded-lg p-4 space-y-4"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Clock className="w-5 h-5 text-orange-400" />
                            <span className="text-white">Schedule {index + 1}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <label className="relative inline-flex items-center cursor-pointer">
                              <input
                                type="checkbox"
                                checked={schedule.enabled}
                                onChange={() => handleToggleSchedule(schedule.id)}
                                className="sr-only peer"
                              />
                              <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-600"></div>
                            </label>
                            {timeSchedules.length > 1 && (
                              <button
                                onClick={() => handleRemoveSchedule(schedule.id)}
                                className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
                                title="Remove schedule"
                              >
                                <X className="w-4 h-4 text-red-400" />
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-slate-400 text-sm mb-2">Start Time</label>
                            <input
                              type="time"
                              value={schedule.startTime}
                              onChange={(e) => handleUpdateScheduleTime(schedule.id, 'startTime', e.target.value)}
                              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white"
                              disabled={!schedule.enabled}
                            />
                          </div>
                          <div>
                            <label className="block text-slate-400 text-sm mb-2">End Time</label>
                            <input
                              type="time"
                              value={schedule.endTime}
                              onChange={(e) => handleUpdateScheduleTime(schedule.id, 'endTime', e.target.value)}
                              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white"
                              disabled={!schedule.enabled}
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-slate-400 text-sm mb-2">Active Days</label>
                          <div className="flex flex-wrap gap-2">
                            {weekDays.map((day) => (
                              <button
                                key={day}
                                onClick={() => handleToggleDay(schedule.id, day)}
                                disabled={!schedule.enabled}
                                className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                                  schedule.days.includes(day)
                                    ? 'bg-orange-600 text-white'
                                    : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                                } ${!schedule.enabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                              >
                                {day}
                              </button>
                            ))}
                          </div>
                          {schedule.days.length === 0 && schedule.enabled && (
                            <p className="text-red-400 text-xs mt-2">⚠️ Select at least one day</p>
                          )}
                        </div>
                      </div>
                    ))}

                    <button
                      onClick={handleAddSchedule}
                      className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      Add Another Schedule
                    </button>

                    <button
                      onClick={handleSaveScheduleSettings}
                      className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg transition-colors"
                    >
                      <Save className="w-4 h-4" />
                      Save Schedule Settings
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Violation Types Tab */}
          {activeTab === 'violations' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-white mb-1">Violation Type Management</h3>
                <p className="text-slate-400 text-sm">
                  Enable or disable detection for specific dress code violations
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4 max-w-4xl">
                {violationTypes.map(violation => (
                  <div
                    key={violation.name}
                    className="flex items-center justify-between bg-slate-800/50 rounded-lg p-4"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-3xl">{violation.icon}</span>
                      <div>
                        <div className="text-white">{violation.name}</div>
                        <div className="text-slate-400 text-xs">
                          {violation.enabled ? 'Detection active' : 'Detection disabled'}
                        </div>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={violation.enabled}
                        onChange={() => handleToggleViolationType(violation.name)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-600"></div>
                    </label>
                  </div>
                ))}
              </div>

              <div className="bg-yellow-900/20 border border-yellow-800 rounded-lg p-4 max-w-4xl">
                <p className="text-yellow-300 text-sm">
                  ⚠️ Disabling violation types will prevent detection of those dress code violations in both live feeds and uploaded videos.
                </p>
              </div>

              <div className="pt-4">
                <button
                  onClick={handleSaveViolationSettings}
                  className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg transition-colors"
                >
                  <Save className="w-4 h-4" />
                  Save Violation Settings
                </button>
              </div>
            </div>
          )}

          {/* Notifications Tab */}
          {activeTab === "notifications" && (
            <div className="space-y-6">
              <div>
                <h3 className="text-white mb-1">Notification Settings</h3>
                <p className="text-slate-400 text-sm">
                  Configure alerts when dress code violations are detected
                </p>
              </div>

              <div className="max-w-2xl space-y-4">
                {/* Enable */}
                <div className="flex items-center justify-between bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                  <div className="flex items-center gap-3">
                    <Bell className="w-5 h-5 text-slate-400" />
                    <div>
                      <div className="text-white">Enable Notifications</div>
                      <div className="text-slate-400 text-xs">
                        Show toast alerts when violations are detected
                      </div>
                    </div>
                  </div>

                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={notifCfg.enabled}
                      onChange={(e) => setNotifCfg((p) => ({ ...p, enabled: e.target.checked }))}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-700 rounded-full peer peer-checked:bg-orange-600
                      after:content-[''] after:absolute after:top-[2px] after:left-[2px]
                      after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all
                      peer-checked:after:translate-x-full"></div>
                  </label>
                </div>

                {/* Cooldown */}
                <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-white text-sm">Cooldown (seconds)</div>
                      <div className="text-slate-400 text-xs">
                        Prevent spam: minimum time between notifications per camera+violation
                      </div>
                    </div>
                    <div className="text-slate-200 text-sm">{notifCfg.cooldown_sec}s</div>
                  </div>

                  <input
                    type="range"
                    min={5}
                    max={300}
                    step={5}
                    value={notifCfg.cooldown_sec}
                    onChange={(e) =>
                      setNotifCfg((p) => ({ ...p, cooldown_sec: Number(e.target.value) }))
                    }
                    className="w-full"
                    disabled={!notifCfg.enabled}
                  />
                </div>

                {/* Toast Duration */}
                <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-white text-sm">Toast Duration (seconds)</div>
                      <div className="text-slate-400 text-xs">
                        How long the toast stays on screen
                      </div>
                    </div>
                    <div className="text-slate-200 text-sm">{notifCfg.toast_sec}s</div>
                  </div>

                  <input
                    type="range"
                    min={3}
                    max={20}
                    step={1}
                    value={notifCfg.toast_sec}
                    onChange={(e) =>
                      setNotifCfg((p) => ({ ...p, toast_sec: Number(e.target.value) }))
                    }
                    className="w-full"
                    disabled={!notifCfg.enabled}
                  />
                </div>

                {/* Sound */}
                <div className="flex items-center justify-between bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                  <div>
                    <div className="text-white text-sm">Play Sound</div>
                    <div className="text-slate-400 text-xs">
                      Play a short sound when a notification arrives
                    </div>
                  </div>

                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={notifCfg.play_sound}
                      onChange={(e) =>
                        setNotifCfg((p) => ({ ...p, play_sound: e.target.checked }))
                      }
                      className="sr-only peer"
                      disabled={!notifCfg.enabled}
                    />
                    <div className="w-11 h-6 bg-slate-700 rounded-full peer peer-checked:bg-orange-600
                      after:content-[''] after:absolute after:top-[2px] after:left-[2px]
                      after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all
                      peer-checked:after:translate-x-full"></div>
                  </label>
                </div>

                <div className="bg-orange-900/20 border border-orange-800 rounded-lg p-4">
                  <p className="text-orange-300 text-sm">
                    🔔 This notification is in-app toast. Email/SMS can be added later.
                  </p>
                </div>
              </div>

              <div className="pt-4">
                <button
                  onClick={handleSaveNotificationsSettings}
                  className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg transition-colors"
                >
                  <Save className="w-4 h-4" />
                  Save Notification Settings
                </button>
              </div>
            </div>
          )}

          {/* Data Retention Tab */}
          {activeTab === "retention" && (
            <div className="space-y-6">
              <div>
                <h3 className="text-white mb-1">Data Retention Settings</h3>
                <p className="text-slate-400 text-sm">
                  Control how long attire violation events are kept in the system
                </p>
              </div>

              <div className="max-w-3xl space-y-6">
                {/* Retention master toggle */}
                <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700 space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-white text-sm font-medium">Enable Data Retention</div>
                      <div className="text-slate-400 text-xs mt-1">
                        When enabled, old attire event records and evidence images will be removed automatically.
                        When disabled, all past data will be kept unless manually cleared.
                      </div>
                    </div>

                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={retentionEnabled}
                        onChange={(e) => setRetentionEnabled(e.target.checked)}
                        className="sr-only peer"
                        disabled={retentionSaving || clearingEvents}
                      />
                      <div className="w-11 h-6 bg-slate-700 rounded-full peer peer-checked:bg-orange-600
                        after:content-[''] after:absolute after:top-[2px] after:left-[2px]
                        after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all
                        peer-checked:after:translate-x-full"></div>
                    </label>
                  </div>

                  {!retentionEnabled ? (
                    <div className="bg-green-900/20 border border-green-800 rounded-lg p-4">
                      <p className="text-green-300 text-sm">
                        ✅ Data retention is OFF. The system will keep all past attire events and evidence
                        until they are manually cleared.
                      </p>
                    </div>
                  ) : (
                    <div className="bg-orange-900/20 border border-orange-800 rounded-lg p-4">
                      <p className="text-orange-300 text-sm">
                        🕒 Data retention is ON. Events older than the selected period will be deleted automatically.
                      </p>
                    </div>
                  )}
                </div>

                {/* Retention days */}
                <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700 space-y-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="text-white text-sm font-medium">Violation Event Retention</div>
                      <div className="text-slate-400 text-xs">
                        Event records, dashboard/report history, and evidence images older than this period
                        will be removed automatically
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <input
                        type="number"
                        min={1}
                        max={MAX_RETENTION_DAYS}
                        step={1}
                        value={retentionDays}
                        onChange={(e) => {
                          const raw = e.target.value;
                          if (raw === "") {
                            setRetentionDays(1);
                            return;
                          }
                          setRetentionDays(clampRetentionDays(Number(raw)));
                        }}
                        className="w-24 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm"
                        disabled={!retentionEnabled || retentionSaving || clearingEvents}
                      />
                      <span className="text-slate-300 text-sm">day{retentionDays > 1 ? "s" : ""}</span>
                    </div>
                  </div>

                  <input
                    type="range"
                    min={1}
                    max={MAX_RETENTION_DAYS}
                    step={1}
                    value={retentionDays}
                    onChange={(e) => setRetentionDays(clampRetentionDays(Number(e.target.value)))}
                    className="w-full"
                    disabled={!retentionEnabled || retentionSaving || clearingEvents}
                  />

                  <div className="flex justify-between text-slate-500 text-xs">
                    <span>1 day</span>
                    <span>150 days</span>
                  </div>

                  <p className="text-slate-400 text-xs">
                    You can drag the slider or enter the value directly.
                  </p>
                </div>

                {/* Warning */}
                <div className="bg-yellow-900/20 border border-yellow-800 rounded-lg p-4">
                  <p className="text-yellow-300 text-sm">
                    ⚠️ Data retention is applied across the attire module, including Events, Dashboard,
                    Reports, CSV/PDF export, and evidence snapshots.
                  </p>
                </div>

                {/* Clear all */}
                <div className="bg-red-900/20 border border-red-800 rounded-lg p-4 space-y-3">
                  <div>
                    <div className="text-white text-sm font-medium">Clear All Events</div>
                    <div className="text-slate-400 text-xs mt-1">
                      Permanently delete all attire violation records and their saved evidence images from the system
                    </div>
                  </div>

                  <button
                    onClick={handleClearAllEvents}
                    disabled={clearingEvents || retentionSaving}
                    className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    {clearingEvents ? "Clearing..." : "Clear All Events"}
                  </button>
                </div>

                {/* Save button */}
                <div className="pt-2">
                  <button
                    onClick={handleSaveRetentionSettings}
                    disabled={retentionSaving || clearingEvents}
                    className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white rounded-lg transition-colors"
                  >
                    <Save className="w-4 h-4" />
                    {retentionSaving ? "Saving..." : "Save Data Retention Settings"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
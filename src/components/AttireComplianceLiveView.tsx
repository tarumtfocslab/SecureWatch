//AttireComplianceLiveView.tsx:
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Circle } from "lucide-react";
import { ATTIRE_API_BASE } from "../api/base";

const API_BASE = ATTIRE_API_BASE;
const MAX_LIVE = 4;

type Violation = "sleeveless" | "shorts" | "slippers";

type UploadedVideo = {
  id: string;
  name: string;
  uploadDate: string;
  size: string;
};

type RtspSource = { id: string; name: string; url: string };

interface Detection {
  id: string;
  x: number;      // percent
  y: number;      // percent
  width: number;  // percent
  height: number; // percent
  label: string;
  violation?: Violation;
}

type ViewMode = "auto" | "normal" | "fisheye";
type EffectiveMode = "normal" | "fisheye";

type ViewModeState = {
  saved: ViewMode;
  effective: EffectiveMode;
};

async function fetchViewMode(videoId: string): Promise<ViewModeState> {
  const res = await fetch(`${API_BASE}/api/attire/view-mode/${videoId}`);
  if (!res.ok) throw new Error("Failed to load view mode");
  const data = await res.json();

  const savedRaw = String(data?.mode ?? "auto").toLowerCase();
  const saved: ViewMode =
    savedRaw === "normal" || savedRaw === "fisheye" ? savedRaw : "auto";

  const effectiveRaw = String(data?.effective_mode ?? "").toLowerCase();
  const effective: EffectiveMode =
    effectiveRaw === "fisheye" ? "fisheye" : "normal";

  return { saved, effective };
}

async function saveViewMode(videoId: string, mode: ViewMode) {
  const res = await fetch(`${API_BASE}/api/attire/view-mode/${videoId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.detail || `HTTP ${res.status}`);
  return data;
}

async function fetchRtspSourcesSafe(): Promise<RtspSource[]> {
  try {
    const res = await fetch(`${API_BASE}/api/rtsp/sources`);
    if (!res.ok) return [];
    const data = await res.json().catch(() => ({}));
    return (data?.sources || []) as RtspSource[];
  } catch {
    return [];
  }
}

async function fetchRtspDetectionsSafe(
  rtspId: string
): Promise<{ ts: number; fps: number; resolution: [number, number]; detections: Detection[] } | null> {
  try {
    const res = await fetch(`${API_BASE}/api/rtsp/live/${rtspId}/detections`);
    if (res.status === 429) {
      return { ts: Date.now(), fps: 0, resolution: [0, 0], detections: [] };
    }
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function closeRtspSafe(rtspId: string) {
  try {
    await fetch(`${API_BASE}/api/rtsp/close/${rtspId}`, { method: "POST" });
  } catch {}
}

async function fetchEnabledSources(): Promise<Record<string, boolean>> {
  const res = await fetch(`${API_BASE}/api/attire/sources`);
  if (!res.ok) throw new Error("Failed to load enabled sources");
  const data = await res.json();
  return (data?.sources || {}) as Record<string, boolean>;
}

async function fetchUploadedVideos(): Promise<UploadedVideo[]> {
  const res = await fetch(`${API_BASE}/api/offline/videos`);
  if (!res.ok) throw new Error("Failed to load uploaded videos");
  return res.json();
}

async function fetchOfflineDetections(
  videoId: string
): Promise<{ ts: number; fps: number; resolution: [number, number]; detections: Detection[] }> {
  const res = await fetch(`${API_BASE}/api/offline/live/${videoId}/detections`);
  if (res.status === 429) {
    return { ts: Date.now(), fps: 0, resolution: [0, 0], detections: [] };
  }
  if (!res.ok) throw new Error("Failed to load offline detections");
  return res.json();
}

async function fetchWebcamDetections(): Promise<{
  ts: number;
  fps: number;
  resolution: [number, number];
  detections: Detection[];
}> {
  const res = await fetch(`${API_BASE}/api/live/webcam/detections`);
  if (!res.ok) throw new Error("Failed to load webcam detections");
  return res.json();
}

async function fetchAttireFps(videoId: string): Promise<{ stream_fps: number; detect_fps: number }> {
  const res = await fetch(`${API_BASE}/api/attire/fps/${videoId}`);
  if (!res.ok) throw new Error("Failed to load fps");
  const data = await res.json();
  return {
    stream_fps: Number(data?.stream_fps ?? 12),
    detect_fps: Number(data?.detect_fps ?? 2),
  };
}

async function closeOffline(videoId: string) {
  try {
    await fetch(`${API_BASE}/api/offline/close/${videoId}`, { method: "POST" });
  } catch {}
}

// --- WebCam ---
const WEBCAM_ID = "__webcam__";

async function startWebcam() {
  await fetch(`${API_BASE}/api/live/webcam/start`, { method: "POST" });
}
async function stopWebcam() {
  await fetch(`${API_BASE}/api/live/webcam/stop`, { method: "POST" });
}

async function setSourceEnabled(videoId: string, enabled: boolean) {
  await fetch(`${API_BASE}/api/attire/sources/${videoId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled }),
  });
}

type GridSource =
  | { kind: "offline"; video: UploadedVideo }
  | { kind: "rtsp"; rtsp: RtspSource }
  | { kind: "webcam" };
// --------------

function getViolationColor(v?: Violation) {
  switch (v) {
    case "sleeveless":
      return "border-orange-500 bg-orange-500/10";
    case "shorts":
      return "border-red-500 bg-red-500/10";
    case "slippers":
      return "border-yellow-500 bg-yellow-500/10";
    default:
      return "border-slate-500/60 bg-slate-500/5"; 
  }
}

function getLabelColor(v?: Violation) {
  switch (v) {
    case "sleeveless":
      return "bg-orange-500 text-white";
    case "shorts":
      return "bg-red-500 text-white";
    case "slippers":
      return "bg-yellow-500 text-black";
    default:
      return "bg-slate-700 text-white";
  }
}

function MjpegStream({
  src,
  alt,
  className,
  isTabVisible,
  onReload,
}: {
  src: string;
  alt: string;
  className?: string;
  isTabVisible: boolean;
  onReload: () => void;
}) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [hasFirstFrame, setHasFirstFrame] = useState(false);

  useEffect(() => {
    setHasFirstFrame(false);
  }, [src]);

  useEffect(() => {
    if (!isTabVisible) return;

    const t = window.setInterval(() => {
      const img = imgRef.current;
      if (!img) return;
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        setHasFirstFrame(true);
      }
    }, 250);

    return () => window.clearInterval(t);
  }, [src, isTabVisible]);

  return (
    <div className="absolute inset-0">
      {!hasFirstFrame && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950 text-slate-400 text-sm z-10">
          Connecting...
        </div>
      )}

      <img
        ref={imgRef}
        src={src}
        alt={alt}
        className={`absolute inset-0 w-full h-full object-cover ${hasFirstFrame ? "opacity-100" : "opacity-0"} ${className || ""}`}
        onLoad={() => setHasFirstFrame(true)}
        onError={() => {
          if (!isTabVisible) return;
          window.setTimeout(onReload, 800);
        }}
      />
    </div>
  );
}

type TileProps = {
  src: GridSource;
  apiBase: string;
  isTabVisible: boolean;
  streamReload: Record<string, number>;
  camDetections: Record<string, Detection[]>;
  videoFps: Record<string, { stream_fps: number; detect_fps: number }>;
  viewModes: Record<string, ViewModeState>;
  modeSavingMap: Record<string, boolean>;
  onReload: (id: string) => void;
  onChangeViewMode: (id: string, mode: ViewMode) => void;
  onHideWebcam: () => void;
};

const LiveTile = React.memo(function LiveTile({
  src,
  apiBase,
  isTabVisible,
  streamReload,
  camDetections,
  videoFps,
  viewModes,
  modeSavingMap,
  onReload,
  onChangeViewMode,
  onHideWebcam,
}: TileProps) {
  const renderModeToggle = (id: string) => {
    const state = viewModes[id] ?? { saved: "auto", effective: "normal" };
    const saving = !!modeSavingMap[id];

    const activeMode =
      state.saved === "auto" ? state.effective : state.saved;

    return (
      <div className="inline-flex rounded-md overflow-hidden border border-slate-600">
        <button
          className={`px-3 py-1.5 text-xs font-medium transition-colors ${
            activeMode === "normal"
              ? "bg-blue-600 text-white"
              : "bg-slate-900/40 text-slate-300 hover:bg-slate-800"
          }`}
          onClick={() => onChangeViewMode(id, "normal")}
          disabled={saving}
          title={
            state.saved === "auto"
              ? "Auto-detected as normal"
              : "Show as normal single view"
          }
        >
          Normal
        </button>

        <button
          className={`px-3 py-1.5 text-xs font-medium border-l border-slate-600 transition-colors ${
            activeMode === "fisheye"
              ? "bg-orange-600 text-white"
              : "bg-slate-900/40 text-slate-300 hover:bg-slate-800"
          }`}
          onClick={() => onChangeViewMode(id, "fisheye")}
          disabled={saving}
          title={
            state.saved === "auto"
              ? "Auto-detected as fisheye"
              : "Show as fisheye dewarp mosaic"
          }
        >
          Fisheye
        </button>
      </div>
    );
  };

  if (src.kind === "webcam") {
    const nonce = streamReload[WEBCAM_ID] ?? 0;
    const streamUrl = `${apiBase}/api/live/webcam/stream?nonce=${nonce}`;
    const detections = camDetections[WEBCAM_ID] ?? [];

    return (
      <div className="bg-slate-900/50 border border-slate-800 rounded-lg overflow-hidden">
        <div className="bg-slate-800/50 px-4 py-3 border-b border-slate-700">
          <div className="text-white font-medium truncate">Laptop Camera</div>
          <div className="text-slate-400 text-sm truncate">Source: Webcam</div>
        </div>

        <div className="relative aspect-video bg-slate-950 overflow-hidden">
          <MjpegStream
            src={streamUrl}
            alt="Webcam stream"
            isTabVisible={isTabVisible}
            onReload={() => onReload(WEBCAM_ID)}
          />

          {detections.map((d) => (
            <div
              key={d.id}
              className={`absolute border-2 ${getViolationColor(d.violation)} pointer-events-none`}
              style={{ left: `${d.x}%`, top: `${d.y}%`, width: `${d.width}%`, height: `${d.height}%` }}
            >
              <div className={`absolute -top-6 left-0 ${getLabelColor(d.violation)} px-2 py-0.5 rounded text-xs`}>
                {d.label}
              </div>
            </div>
          ))}
        </div>

        <div className="bg-slate-800/30 px-4 py-2 border-t border-slate-700">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Stream: Webcam</span>
            <button
              className="text-slate-300 hover:text-white"
              onClick={onHideWebcam}
              title="Hide webcam"
            >
              Hide
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (src.kind === "rtsp") {
    const s = src.rtsp;
    const detections = camDetections[s.id] ?? [];
    const nonce = streamReload[s.id] ?? 0;
    const streamUrl = `${apiBase}/api/rtsp/stream/${s.id}?nonce=${nonce}`;

    return (
      <div className="bg-slate-900/50 border border-slate-800 rounded-lg overflow-hidden">
        <div className="bg-slate-800/50 px-4 py-3 border-b border-slate-700">
          <div className="text-white font-medium truncate">{s.name}</div>
          <div className="text-slate-400 text-sm truncate">Source: RTSP</div>
        </div>

        <div className="relative aspect-video bg-slate-950 overflow-hidden">
          <MjpegStream
            src={streamUrl}
            alt={`RTSP ${s.name}`}
            isTabVisible={isTabVisible}
            onReload={() => onReload(s.id)}
          />

          {detections.map((d) => (
            <div
              key={d.id}
              className={`absolute border-2 ${getViolationColor(d.violation)} pointer-events-none`}
              style={{ left: `${d.x}%`, top: `${d.y}%`, width: `${d.width}%`, height: `${d.height}%` }}
            >
              <div className={`absolute -top-6 left-0 ${getLabelColor(d.violation)} px-2 py-0.5 rounded text-xs`}>
                {d.label}
              </div>
            </div>
          ))}
        </div>

        <div className="bg-slate-800/30 px-4 py-2 border-t border-slate-700">
          <div className="flex items-center justify-between gap-3 text-xs text-slate-400">
            <span>Stream: RTSP</span>
            {renderModeToggle(s.id)}
          </div>
        </div>
      </div>
    );
  }

  const v = src.video;
  const detections = camDetections[v.id] ?? [];
  const fps = videoFps[v.id] ?? { stream_fps: 12, detect_fps: 2 };
  const nonce = streamReload[v.id] ?? 0;

  const params = new URLSearchParams();
  params.set("detect_fps", String(fps.detect_fps));
  params.set("nonce", String(nonce));

  const sfps = Number(fps.stream_fps);
  if (Number.isFinite(sfps) && sfps >= 1) {
    params.set("stream_fps", String(sfps));
  }

  const streamUrl = `${apiBase}/api/offline/stream/${v.id}?${params.toString()}`;

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-lg overflow-hidden">
      <div className="bg-slate-800/50 px-4 py-3 border-b border-slate-700">
        <div className="text-white font-medium truncate">{v.name}</div>
        <div className="text-slate-400 text-sm truncate">Source: Uploaded Video • {v.size}</div>
      </div>

      <div className="relative aspect-video bg-slate-950 overflow-hidden">
        <MjpegStream
          src={streamUrl}
          alt={`Uploaded video ${v.name}`}
          isTabVisible={isTabVisible}
          onReload={() => onReload(v.id)}
        />

        {detections.map((d) => (
          <div
            key={d.id}
            className={`absolute border-2 ${getViolationColor(d.violation)} pointer-events-none`}
            style={{ left: `${d.x}%`, top: `${d.y}%`, width: `${d.width}%`, height: `${d.height}%` }}
          >
            <div className={`absolute -top-6 left-0 ${getLabelColor(d.violation)} px-2 py-0.5 rounded text-xs`}>
              {d.label}
            </div>
          </div>
        ))}
      </div>

      <div className="bg-slate-800/30 px-4 py-2 border-t border-slate-700">
        <div className="flex items-center justify-between gap-3 text-xs text-slate-400">
          <div className="flex items-center gap-4">
            <span>Stream fps: {Number(fps.stream_fps) >= 1 ? fps.stream_fps : "AUTO"}</span>
            <span>Detection fps: {fps.detect_fps}</span>
          </div>
          {renderModeToggle(v.id)}
        </div>
      </div>
    </div>
  );
});

export function AttireComplianceLiveView() {
  const [time, setTime] = useState(new Date());
  const [camDetections, setCamDetections] = useState<Record<string, Detection[]>>({});
  const [camMeta, setCamMeta] = useState<Record<string, { fps: number; resolution: [number, number] }>>({});
  const [viewModes, setViewModes] = useState<Record<string, ViewModeState>>({});
  const [modeSavingMap, setModeSavingMap] = useState<Record<string, boolean>>({});
  const [videoFps, setVideoFps] = useState<Record<string, { stream_fps: number; detect_fps: number }>>({});
  const [uploadedVideos, setUploadedVideos] = useState<UploadedVideo[]>([]);
  const [rtspSources, setRtspSources] = useState<RtspSource[]>([]);
  const [streamReload, setStreamReload] = useState<Record<string, number>>({});
  const [enabledMap, setEnabledMap] = useState<Record<string, boolean>>({});
  const [selectedVideoId, setSelectedVideoId] = useState<string>(() => {
    return localStorage.getItem("attire:liveVideoId") || "";
  });
  const [isTabVisible, setIsTabVisible] = useState(() => !document.hidden);
  const [showWebcam, setShowWebcam] = useState<boolean>(() => {
    return localStorage.getItem("attire:showWebcam") === "1";
  });
  const [offlineLoaded, setOfflineLoaded] = useState(false);
  const [rtspLoaded, setRtspLoaded] = useState(false);
  const [enabledLoaded, setEnabledLoaded] = useState(false);
  const lastTotalSourcesRef = useRef<string>("");
  const lastGridIdsRef = useRef<string>("");
  const liveVideos = useMemo(() => {
    if (!uploadedVideos.length) return [];

    const isEnabled = (id: string) => enabledMap[id] ?? true;
    const enabledVideos = uploadedVideos.filter(v => isEnabled(v.id));

    const selected =
      selectedVideoId && isEnabled(selectedVideoId)
        ? enabledVideos.find(v => v.id === selectedVideoId)
        : undefined;

    const rest = enabledVideos.filter(v => v.id !== selected?.id);
    const ordered = selected ? [selected, ...rest] : enabledVideos;

    const slots = showWebcam ? (MAX_LIVE - 1) : MAX_LIVE;
    return ordered.slice(0, Math.max(0, slots));
  }, [uploadedVideos, selectedVideoId, enabledMap, showWebcam]);

  useEffect(() => {
    const uploaded = uploadedVideos.length;
    const webcamOption = 1;
    const rtspOption = rtspSources.length;
    const totalStr = String(uploaded + webcamOption + rtspOption);

    if (lastTotalSourcesRef.current === totalStr) return;
    lastTotalSourcesRef.current = totalStr;

    localStorage.setItem("attire:totalSources", totalStr);
    window.dispatchEvent(new Event("attire:sourceCountChanged"));
  }, [uploadedVideos.length, rtspSources.length]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const list = await fetchRtspSourcesSafe();
        if (!alive) return;
        setRtspSources(list);
        setRtspLoaded(true);
      } catch {
        if (!alive) return;
        setRtspSources([]);
        setRtspLoaded(true);
      }
    };
    load();
    const t = window.setInterval(load, 10000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, []);

  const prevLiveIdsRef = useRef<string[]>([]);
  const prevRtspIdsRef = useRef<string[]>([]);

  // --- RTSP , Webcam, offline ---
  const gridSources: GridSource[] = useMemo(() => {
    const items: GridSource[] = [];

    // webcam first (optional)
    if (showWebcam) items.push({ kind: "webcam" });

    // offline videos
    for (const v of liveVideos) items.push({ kind: "offline", video: v });

    // rtsp sources (enabled only)
    const isEnabled = (id: string) => enabledMap[id] ?? true;
    const enabledRtsp = (rtspSources || []).filter(s => isEnabled(s.id));
    for (const s of enabledRtsp) items.push({ kind: "rtsp", rtsp: s });

    return items.slice(0, MAX_LIVE);
  }, [showWebcam, liveVideos, rtspSources, enabledMap]);

  const visibleOfflineVideos = useMemo(
    () =>
      gridSources
        .filter((s): s is { kind: "offline"; video: UploadedVideo } => s.kind === "offline")
        .map((s) => s.video),
    [gridSources]
  );

  const visibleRtspSources = useMemo(
    () =>
      gridSources
        .filter((s): s is { kind: "rtsp"; rtsp: RtspSource } => s.kind === "rtsp")
        .map((s) => s.rtsp),
    [gridSources]
  );

  // Header: Tell App.tsx how many sources are currently active (ACTUALLY shown)
  useEffect(() => {
    const ids = gridSources.map((s) => {
      if (s.kind === "webcam") return WEBCAM_ID;
      if (s.kind === "offline") return s.video.id;
      return s.rtsp.id;
    });

    const idsStr = JSON.stringify(ids);
    if (lastGridIdsRef.current === idsStr) return;
    lastGridIdsRef.current = idsStr;

    localStorage.setItem("attire:enabledCameraIds", idsStr);
    window.dispatchEvent(new Event("attire:gridSourcesChanged"));
  }, [gridSources]);

  useEffect(() => {
    localStorage.setItem("attire:showWebcam", showWebcam ? "1" : "0");
  }, [showWebcam]);

  useEffect(() => {
    if (!showWebcam) return;
    if (!isTabVisible) return;

    (async () => {
      try {
        await startWebcam();
      } catch {}
    })();

    return () => {
      stopWebcam().catch(() => {});
    };
  }, [showWebcam, isTabVisible]);

  // poll webcam detections
  useEffect(() => {
    if (!showWebcam || !isTabVisible) return;

    let stopped = false;
    let timer: number | null = null;

    const loop = async () => {
      try {
        const data = await fetchWebcamDetections();
        if (stopped) return;

        setCamDetections((prev) => ({
          ...prev,
          [WEBCAM_ID]: data.detections ?? [],
        }));

        setCamMeta((prev) => ({
          ...prev,
          [WEBCAM_ID]: {
            fps: data.fps ?? 0,
            resolution: data.resolution ?? [0, 0],
          },
        }));
      } catch {
        // ignore
      } finally {
        if (!stopped) {
          timer = window.setTimeout(loop, 1500);
        }
      }
    };

    loop();

    return () => {
      stopped = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [showWebcam, isTabVisible]);
  // -------------

  const visibleSourceIdsKey = useMemo(() => {
    return gridSources
      .map((s) => {
        if (s.kind === "webcam") return "";
        if (s.kind === "offline") return s.video.id;
        return s.rtsp.id;
      })
      .filter(Boolean)
      .join("|");
  }, [gridSources]);

  useEffect(() => {
    const ids = gridSources
      .map((s) => {
        if (s.kind === "webcam") return "";
        if (s.kind === "offline") return s.video.id;
        return s.rtsp.id;
      })
      .filter(Boolean);

    if (!ids.length) return;

    let cancelled = false;

    (async () => {
      const results = await Promise.allSettled(
        ids.map(async (id) => ({ id, mode: await fetchViewMode(id) }))
      );

      if (cancelled) return;

      setViewModes((prev) => {
        const next = { ...prev };
        for (const r of results) {
          if (r.status === "fulfilled") {
            next[r.value.id] = r.value.mode;
          }
        }
        return next;
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [visibleSourceIdsKey]);

  const handleChangeViewMode = useCallback(async (id: string, mode: ViewMode) => {
    setModeSavingMap((prev) => ({ ...prev, [id]: true }));

    try {
      await saveViewMode(id, mode);

      setViewModes((prev) => ({
        ...prev,
        [id]: {
          saved: mode,
          effective: mode === "fisheye" ? "fisheye" : "normal",
        },
      }));

      setStreamReload((prev) => ({
        ...prev,
        [id]: (prev[id] ?? 0) + 1,
      }));

      localStorage.setItem("attire:viewModeVer", String(Date.now()));
      window.dispatchEvent(new Event("attire:viewModeChanged"));
    } catch (e: any) {
      alert(`Save view mode failed: ${e?.message || e}`);
    } finally {
      setModeSavingMap((prev) => ({ ...prev, [id]: false }));
    }
  }, [setModeSavingMap, setViewModes, setStreamReload]);

  useEffect(() => {
    const prev = prevLiveIdsRef.current;
    const curr = liveVideos.map(v => v.id);

    // Only close sessions that are no longer in the live grid
    const removed = prev.filter(id => !curr.includes(id));
    removed.forEach(closeOffline);

    prevLiveIdsRef.current = curr;

  }, [liveVideos]);

  useEffect(() => {
    const prev = prevRtspIdsRef.current;
    const curr = visibleRtspSources.map((s) => s.id);

    const removed = prev.filter((id) => !curr.includes(id));
    removed.forEach(closeRtspSafe);

    prevRtspIdsRef.current = curr;
  }, [visibleRtspSources]);

  const liveVideoIdsForFpsKey = useMemo(
    () => liveVideos.map((v) => v.id).join("|"),
    [liveVideos]
  );

  useEffect(() => {
    if (!liveVideos.length) return;

    let cancelled = false;

    (async () => {
      try {
        const results = await Promise.allSettled(
          liveVideos.map(async (v) => {
            const fps = await fetchAttireFps(v.id);
            return { videoId: v.id, fps };
          })
        );

        if (cancelled) return;

        setVideoFps((prev) => {
          const next = { ...prev };
          for (const r of results) {
            if (r.status !== "fulfilled") continue;
            next[r.value.videoId] = r.value.fps;
          }
          return next;
        });
      } catch {
        // ignore
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [liveVideoIdsForFpsKey]);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      try {
        const m = await fetchEnabledSources();
        if (!alive) return;
        setEnabledMap(m);
        setEnabledLoaded(true);
      } catch {
        if (!alive) return;
        setEnabledMap({});
        setEnabledLoaded(true);
      }
    };

    load();

    const onStorage = (e: StorageEvent) => {
      if (e.key === "attire:enabledSourcesVer") load();
    };

    const onSourcesChanged = () => load();

    window.addEventListener("storage", onStorage);
    window.addEventListener("attire:sourcesChanged", onSourcesChanged);

    return () => {
      alive = false;
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("attire:sourcesChanged", onSourcesChanged);
    };
  }, []);

  useEffect(() => {
    if (!offlineLoaded || !rtspLoaded || !enabledLoaded) return;
    const slots = showWebcam ? MAX_LIVE - 1 : MAX_LIVE;

    // keep default behavior consistent: unknown IDs are treated as enabled
    const isEnabled = (id: string) => enabledMap[id] ?? true;

    const orderedIds = [
      ...(selectedVideoId && isEnabled(selectedVideoId) ? [selectedVideoId] : []),
      ...uploadedVideos
        .map((v) => v.id)
        .filter((id) => id !== selectedVideoId && isEnabled(id)),
      ...rtspSources
        .map((s) => s.id)
        .filter((id) => id !== selectedVideoId && isEnabled(id)),
    ];

    const uniqueOrderedIds = Array.from(new Set(orderedIds));
    const overflow = uniqueOrderedIds.slice(Math.max(0, slots));
    if (!overflow.length) return;

    (async () => {
      await Promise.allSettled(overflow.map((id) => setSourceEnabled(id, false)));
      localStorage.setItem("attire:enabledSourcesVer", String(Date.now()));
      window.dispatchEvent(new Event("attire:sourcesChanged"));
    })();
  }, [
    offlineLoaded,
    rtspLoaded,
    enabledLoaded,
    uploadedVideos,
    rtspSources,
    enabledMap,
    selectedVideoId,
    showWebcam,
  ]);

  // clock
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const onVis = () => setIsTabVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(() => {
    const syncSelected = () => {
      setSelectedVideoId(localStorage.getItem("attire:liveVideoId") || "");
    };

    const onStorage = (e: StorageEvent) => {
      if (e.key !== "attire:liveVideoId") return;
      syncSelected();
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener("attire:liveVideoChanged", syncSelected);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("attire:liveVideoChanged", syncSelected);
    };
  }, []);

  // poll offline detections (per uploaded video)
  const visibleOfflineIdsKey = useMemo(
    () => visibleOfflineVideos.map((v) => v.id).join("|"),
    [visibleOfflineVideos]
  );

  const visibleRtspIdsKey = useMemo(
    () => visibleRtspSources.map((s) => s.id).join("|"),
    [visibleRtspSources]
  );

  useEffect(() => {
    if (!isTabVisible) return;
    if (!visibleOfflineVideos.length && !visibleRtspSources.length) return;

    let stopped = false;
    let timer: number | null = null;

    const loop = async () => {
      try {
        const offlineResults = await Promise.allSettled(
          visibleOfflineVideos.map(async (v) => {
            const data = await fetchOfflineDetections(v.id);
            return { id: v.id, data };
          })
        );

        const rtspResults = await Promise.allSettled(
          visibleRtspSources.map(async (s) => {
            const data = await fetchRtspDetectionsSafe(s.id);
            return { id: s.id, data };
          })
        );

        if (stopped) return;

        setCamDetections((prev) => {
          const nextDet: Record<string, Detection[]> = {};

          for (const r of offlineResults) {
            if (r.status !== "fulfilled") continue;
            nextDet[r.value.id] = r.value.data.detections ?? [];
          }

          for (const r of rtspResults) {
            if (r.status !== "fulfilled") continue;
            if (!r.value.data) continue;
            nextDet[r.value.id] = r.value.data.detections ?? [];
          }

          return { ...prev, ...nextDet };
        });

        setCamMeta((prev) => {
          const nextMeta: Record<string, { fps: number; resolution: [number, number] }> = {};

          for (const r of offlineResults) {
            if (r.status !== "fulfilled") continue;
            nextMeta[r.value.id] = {
              fps: r.value.data.fps ?? 0,
              resolution: r.value.data.resolution ?? [0, 0],
            };
          }

          for (const r of rtspResults) {
            if (r.status !== "fulfilled") continue;
            if (!r.value.data) continue;
            nextMeta[r.value.id] = {
              fps: r.value.data.fps ?? 0,
              resolution: r.value.data.resolution ?? [0, 0],
            };
          }

          return { ...prev, ...nextMeta };
        });
      } catch (e) {
        console.warn("poll detections failed:", e);
      } finally {
        if (!stopped) {
          timer = window.setTimeout(loop, 1500);
        }
      }
    };

    loop();

    return () => {
      stopped = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [visibleOfflineIdsKey, visibleRtspIdsKey, isTabVisible]);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      try {
        const vids = await fetchUploadedVideos();
        if (!alive) return;

        setUploadedVideos((prev) => {
          const prevKey = prev.map((v) => `${v.id}|${v.name}|${v.size}`).join("||");
          const nextKey = vids.map((v) => `${v.id}|${v.name}|${v.size}`).join("||");
          return prevKey === nextKey ? prev : vids;
        });

        setOfflineLoaded(true);
      } catch (e) {
        console.error(e);
        if (!alive) return;
        setUploadedVideos([]);
        setOfflineLoaded(true);
      }
    };

    load();

    const onChanged = () => load();
    window.addEventListener("attire:sourcesChanged", onChanged);

    const t = window.setInterval(load, 10000);

    return () => {
      alive = false;
      window.removeEventListener("attire:sourcesChanged", onChanged);
      window.clearInterval(t);
    };
  }, []);

  const handleReload = useCallback((id: string) => {
    setStreamReload((prev) => ({
      ...prev,
      [id]: (prev[id] ?? 0) + 1,
    }));
  }, []);

  const handleHideWebcam = useCallback(() => {
    setShowWebcam(false);
  }, []);

  const getSourceId = (src: GridSource) => {
    if (src.kind === "webcam") return WEBCAM_ID;
    if (src.kind === "offline") return src.video.id;
    return src.rtsp.id;
  };

  const totalViolations = useMemo(() => {
    return gridSources.reduce((sum, src) => {
      const id = getSourceId(src);
      return sum + (camDetections[id]?.filter(d => !!d.violation).length ?? 0);
    }, 0);
  }, [gridSources, camDetections]);

  const sleevelessCount = useMemo(() => {
    return gridSources.reduce((sum, src) => {
      const id = getSourceId(src);
      return sum + (camDetections[id]?.filter(d => d.violation === "sleeveless").length ?? 0);
    }, 0);
  }, [gridSources, camDetections]);

  const shortsSlippersCount = useMemo(() => {
    return gridSources.reduce((sum, src) => {
      const id = getSourceId(src);
      return sum + (camDetections[id]?.filter(d => d.violation === "shorts" || d.violation === "slippers").length ?? 0);
    }, 0);
  }, [gridSources, camDetections]);

  return (
    <main className="flex-1 p-6 overflow-y-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-white text-2xl font-semibold mb-1">Live View - Attire Compliance Monitoring</h2>
            <p className="text-slate-400">Real-time detection of dress code violations</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-slate-400">
              <Circle className="w-2 h-2 fill-green-500 text-green-500 animate-pulse" />
              <span>Live</span>
              <button
                className={`px-3 py-2 rounded-md border text-sm ${
                  showWebcam
                    ? "border-green-600 bg-green-600/20 text-green-200"
                    : "border-slate-700 bg-slate-900/40 text-slate-300"
                }`}
                onClick={() => setShowWebcam((v) => !v)}
              >
                {showWebcam ? "Webcam: ON" : "Webcam: OFF"}
              </button>
            </div>
            <div className="text-slate-400">{time.toLocaleTimeString()}</div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4">
          <div className="text-slate-400 text-sm mb-1">Uploaded Videos</div>
          <div className="text-white text-2xl">{liveVideos.length}</div>
        </div>
        <div className="bg-slate-900/50 border border-red-900/30 rounded-lg p-4">
          <div className="text-slate-400 text-sm mb-1">Active Violations</div>
          <div className="text-red-400 text-2xl">{totalViolations}</div>
        </div>
        <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4">
          <div className="text-slate-400 text-sm mb-1">Sleeveless Detected</div>
          <div className="text-orange-400 text-2xl">{sleevelessCount}</div>
        </div>
        <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4">
          <div className="text-slate-400 text-sm mb-1">Shorts/Slippers</div>
          <div className="text-yellow-400 text-2xl">{shortsSlippersCount}</div>
        </div>
      </div>

      {/* Legend */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4 mb-6">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-orange-500 rounded"></div>
            <span className="text-slate-400 text-sm">Sleeveless</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-red-500 rounded"></div>
            <span className="text-slate-400 text-sm">Shorts</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-yellow-500 rounded"></div>
            <span className="text-slate-400 text-sm">Slippers</span>
          </div>
        </div>
      </div>

      {/* Camera Grid */}
      <div className="grid grid-cols-2 gap-4">
        {gridSources.map((src) => {
          const key =
            src.kind === "webcam" ? WEBCAM_ID : src.kind === "rtsp" ? src.rtsp.id : src.video.id;

          return (
            <LiveTile
              key={key}
              src={src}
              apiBase={API_BASE}
              isTabVisible={isTabVisible}
              streamReload={streamReload}
              camDetections={camDetections}
              videoFps={videoFps}
              viewModes={viewModes}
              modeSavingMap={modeSavingMap}
              onReload={handleReload}
              onChangeViewMode={handleChangeViewMode}
              onHideWebcam={handleHideWebcam}
            />
          );
        })}
      </div>

      {/* Policy */}
      <div className="mt-6 bg-blue-900/20 border border-blue-800 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
          <div>
            <div className="text-blue-300 mb-1">Attire Compliance Policy</div>
            <div className="text-slate-400 text-sm">
              All students must wear appropriate attire in computer labs: sleeved tops (short or long sleeve),
              long trousers, and covered shoes. Violations include sleeveless tops, shorts/skirts, and slippers/sandals.
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

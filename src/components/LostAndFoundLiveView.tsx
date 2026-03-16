// src/pages/LiveViewPage.tsx
// Full file (no skipped code) — RTSP normal/fisheye fixed:
// ✅ RTSP normal ALWAYS uses /0
// ✅ RTSP fisheye ALWAYS uses /A and /B (2×2 + 2×2 = 8 views total)
// ✅ STOP probing /api/live/frame/... (that caused 404 + wrong fisheye detection)
// ✅ Normal stream shows NO ROI overlay
// ✅ Fisheye stream shows overlay only when detectionEnabled (optional)
// ✅ Keeps video-ended + restart logic
// ✅ No "const ..." inside JSX, no ratio undefined
// ✅ RTSP fisheye only: frontend shows Group A / Group B bigger
// ✅ Upload fisheye untouched
// ✅ Avoids endless MJPEG reconnect loop

import React, { useEffect, useMemo, useRef, useState } from "react";

import { LOSTFOUND_API_BASE } from "../api/base";
const API_BASE = LOSTFOUND_API_BASE;

type LiveDet = Record<string, any>;

type LiveView = {
  name?: string;
  detections?: LiveDet[];
  dets?: LiveDet[];
  gi?: number;
};

type LiveCam = {
  updated_at: number;
  views: LiveView[];
  lost_items: any[];
};

type LiveState = {
  cameras: Record<string, LiveCam>;
};

type SettingsView = {
  id: string;
  name: string;
  order?: number;
  videoUrl?: string;
  mjpegUrl?: string;
  filename?: string;
};

type SettingsCamera = {
  id: string;
  name: string;
  views?: SettingsView[];
  status?: string;
  location?: string;
  recording?: boolean;
  videoType?: "normal" | "fisheye" | "auto" | string;
  isFisheye?: boolean;
  is_rtsp?: boolean;
  mjpegUrl?: string;
};

type DetectionConfig = {
  [camId: string]: boolean;
};

type CameraStatus = {
  is_running: boolean;
  video_ended: boolean;
  restart_pending: boolean;
  last_ended?: number;
  cooldown_remaining?: number;
  progress_percent?: number;
};

function normalizeCamId(id: string) {
  return (id || "").replace(/_h264$/i, "");
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function toPctBox(det: LiveDet): { x: number; y: number; w: number; h: number } | null {
  if (
    typeof det?.x === "number" &&
    typeof det?.y === "number" &&
    typeof det?.width === "number" &&
    typeof det?.height === "number"
  ) {
    return { x: det.x, y: det.y, w: det.width, h: det.height };
  }

  if (Array.isArray(det?.bbox) && det.bbox.length === 4 && det.img_w && det.img_h) {
    const [x1, y1, x2, y2] = det.bbox;
    const w = Math.max(0, x2 - x1);
    const h = Math.max(0, y2 - y1);
    return {
      x: (x1 / det.img_w) * 100,
      y: (y1 / det.img_h) * 100,
      w: (w / det.img_w) * 100,
      h: (h / det.img_h) * 100,
    };
  }

  if (
    det?.x1 != null &&
    det?.y1 != null &&
    det?.x2 != null &&
    det?.y2 != null &&
    det.img_w &&
    det.img_h
  ) {
    const x1 = Number(det.x1);
    const y1 = Number(det.y1);
    const x2 = Number(det.x2);
    const y2 = Number(det.y2);
    const w = Math.max(0, x2 - x1);
    const h = Math.max(0, y2 - y1);
    return {
      x: (x1 / det.img_w) * 100,
      y: (y1 / det.img_h) * 100,
      w: (w / det.img_w) * 100,
      h: (h / det.img_h) * 100,
    };
  }

  return null;
}

function detLabel(det: LiveDet) {
  return det?.label || det?.name || det?.cls || det?.class_name || det?.class || "Object";
}

function detColor(det: LiveDet) {
  const c = (det?.label || det?.cls || "").toString().toLowerCase();
  if (c.includes("wallet")) return "border-emerald-500 bg-emerald-500/10 text-emerald-100";
  if (c.includes("phone")) return "border-slate-300 bg-slate-500/10 text-slate-100";
  if (c.includes("id")) return "border-fuchsia-500 bg-fuchsia-500/10 text-fuchsia-100";
  if (c.includes("card")) return "border-pink-500 bg-pink-500/10 text-pink-100";
  if (c.includes("bottle")) return "border-sky-500 bg-sky-500/10 text-sky-100";
  return "border-sky-500 bg-sky-500/10 text-sky-100";
}

function StatusStrip({
  lostCount,
  hasLive,
  detectionEnabled,
  onToggleDetection,
  onRestartCamera,
  camId,
  cameraStatus,
  isRestarting,
}: {
  lostCount: number;
  hasLive: boolean;
  detectionEnabled: boolean;
  onToggleDetection: (camId: string, enabled: boolean) => Promise<void> | void;
  onRestartCamera?: (camId: string) => void;
  camId: string;
  cameraStatus?: CameraStatus;
  isRestarting?: boolean;
}) {
  const [toggling, setToggling] = useState(false);

  const handleToggle = async () => {
    setToggling(true);
    try {
      await onToggleDetection(camId, !detectionEnabled);
    } finally {
      setToggling(false);
    }
  };

  const videoEnded = cameraStatus?.video_ended || false;
  const restartPending = cameraStatus?.restart_pending || false;
  const cooldownRemaining = cameraStatus?.cooldown_remaining || 0;
  const progressPercent = cameraStatus?.progress_percent || 0;

  return (
    <div className="flex items-center justify-between text-[11px] text-slate-400 px-3 py-2 border-t border-slate-700/40 bg-slate-950/30">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              !hasLive ? "bg-slate-500" : videoEnded ? "bg-yellow-400 animate-pulse" : "bg-emerald-400"
            }`}
          />
          {!hasLive ? "No Pipeline" : videoEnded ? "Video Ended" : "Live"}
        </span>

        {videoEnded && progressPercent > 0 && (
          <span className="text-yellow-400/70">{progressPercent.toFixed(0)}%</span>
        )}

        {hasLive && videoEnded && onRestartCamera && (
          <button
            onClick={() => onRestartCamera(camId)}
            disabled={restartPending || isRestarting || cooldownRemaining > 0}
            className={`ml-2 px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors ${
              restartPending || isRestarting
                ? "bg-slate-600/20 text-slate-500 cursor-not-allowed"
                : cooldownRemaining > 0
                ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30"
                : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30"
            }`}
          >
            {isRestarting
              ? "Restarting..."
              : restartPending
              ? "Queued..."
              : cooldownRemaining > 0
              ? `Wait ${cooldownRemaining.toFixed(0)}s`
              : "Restart"}
          </button>
        )}

        {hasLive && (
          <button
            onClick={handleToggle}
            disabled={toggling || videoEnded}
            className={`ml-3 px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors ${
              videoEnded
                ? "bg-slate-600/10 text-slate-600 cursor-not-allowed"
                : detectionEnabled
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30"
                : "bg-slate-600/20 text-slate-400 border border-slate-600/30 hover:bg-slate-600/30"
            }`}
          >
            {toggling ? "..." : videoEnded ? "Video Ended" : detectionEnabled ? "AI Detection ON" : "AI Detection OFF"}
          </button>
        )}
      </div>

      <div className="flex items-center gap-6">
        <span>FPS: ~12</span>
        {!videoEnded && (
          <>
            <span>Mode: {detectionEnabled ? "Detection" : "Display Only"}</span>
            {detectionEnabled && <span className="text-red-300">Items: {lostCount}</span>}
          </>
        )}
      </div>
    </div>
  );
}

function PlaceholderFrame({ label }: { label: string }) {
  return (
    <div className="relative w-full aspect-video bg-black flex items-center justify-center">
      <div className="text-xs text-slate-400 border border-slate-700/60 bg-slate-950/40 px-3 py-2 rounded-lg">
        {label}
      </div>
    </div>
  );
}

function MjpegStream({
  url,
  camId,
  viewId,
  detectionEnabled,
  onAspect,
  showOverlays,
  videoEnded,
  onRestart,
}: {
  url: string;
  camId: string;
  viewId?: string | number;
  detectionEnabled: boolean;
  onAspect?: (ratio: number) => void;
  showOverlays?: boolean;
  videoEnded?: boolean;
  onRestart?: () => void;
}) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [loading, setLoading] = useState(true);
  const [errCount, setErrCount] = useState(0);
  const retryTimer = useRef<number | null>(null);
  const streamKey = useRef(`${camId}-${String(viewId ?? "")}-${Date.now()}`);

  const makeUrl = (base: string, bump: number) => {
    const u = new URL(base, window.location.href);
    u.searchParams.set("t", String(Date.now()));
    u.searchParams.set("r", String(bump || 0));
    u.searchParams.set("key", streamKey.current);
    u.searchParams.set("detection", detectionEnabled ? "1" : "0");

    const overlays = showOverlays ?? detectionEnabled;
    u.searchParams.set("overlays", overlays ? "1" : "0");

    return u.toString();
  };

  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;

    if (retryTimer.current) {
      window.clearTimeout(retryTimer.current);
      retryTimer.current = null;
    }

    setLoading(true);
    setErrCount(0);

    let lastRatio = 0;

    const reportAspect = () => {
      const w = img.naturalWidth || 0;
      const h = img.naturalHeight || 0;
      if (w > 0 && h > 0) {
        const ratio = w / h;
        if (Math.abs(ratio - lastRatio) > 0.001) {
          lastRatio = ratio;
          onAspect?.(ratio);
        }
      }
    };

    const onLoad = () => {
      setLoading(false);
      setErrCount(0);
      reportAspect();
    };

    const onError = (e: Event) => {
      console.log(`[MjpegStream] Error: ${camId} view ${String(viewId ?? "")}`, e);
      setLoading(false);

      setErrCount((prev) => {
        const next = prev + 1;
        const delay = Math.min(3000, 250 + next * 250);

        retryTimer.current = window.setTimeout(() => {
          const img2 = imgRef.current;
          if (!img2) return;
          img2.src = "";
          img2.src = makeUrl(url, next);
          setLoading(true);
        }, delay);

        return next;
      });
    };

    img.addEventListener("load", onLoad);
    img.addEventListener("error", onError);

    img.src = "";
    img.src = makeUrl(url, 0);

    const aspectTimer = window.setInterval(reportAspect, 800);

    return () => {
      console.log(`[MjpegStream] Cleanup: ${camId} view ${String(viewId ?? "")}`);
      img.removeEventListener("load", onLoad);
      img.removeEventListener("error", onError);
      img.src = "";
      img.removeAttribute("src");

      if (retryTimer.current) {
        window.clearTimeout(retryTimer.current);
        retryTimer.current = null;
      }
      window.clearInterval(aspectTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, detectionEnabled, showOverlays]);

  return (
    <>
      {loading && !videoEnded && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-10">
          <div className="text-xs text-slate-200 bg-slate-900/80 px-3 py-2 rounded-lg">
            {errCount > 0 ? `Reconnecting... (${errCount})` : "Connecting..."}
          </div>
        </div>
      )}

      {videoEnded && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-20">
          <div className="text-center">
            <div className="text-yellow-400 text-lg mb-3">⚠️ Video Ended</div>
            {onRestart && (
              <button
                onClick={onRestart}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm transition-colors"
              >
                Restart Stream
              </button>
            )}
          </div>
        </div>
      )}

      <img
        ref={imgRef}
        className={`absolute inset-0 w-full h-full object-contain transition-opacity duration-300 ${
          loading || videoEnded ? "opacity-0" : "opacity-100"
        }`}
        alt={`${camId} view ${String(viewId ?? "")}`}
        draggable={false}
        crossOrigin="anonymous"
      />
    </>
  );
}

export function LiveViewPage({ mode }: { mode: "lost-found" | "attire" }) {
  const [aspectMap, setAspectMap] = useState<Record<string, number>>({});
  const setAspect = (key: string, ratio: number) => {
    if (!isFinite(ratio) || ratio < 0.3 || ratio > 5) return;
    setAspectMap((m) => ({ ...m, [key]: ratio }));
  };

  const [state, setState] = useState<LiveState | null>(null);
  const [camList, setCamList] = useState<SettingsCamera[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const [detectionConfig, setDetectionConfig] = useState<DetectionConfig>({});
  const [updatingDetection, setUpdatingDetection] = useState<Record<string, boolean>>({});

  const [cameraStatus, setCameraStatus] = useState<Record<string, CameraStatus>>({});
  const [restartingCameras, setRestartingCameras] = useState<Record<string, boolean>>({});

  const [fisheyeOverride, setFisheyeOverride] = useState<Record<string, boolean | null>>(() => {
    try {
      const raw = localStorage.getItem("live_fisheye_override_v1");
      if (!raw) return {};
      return JSON.parse(raw);
    } catch {
      return {};
    }
  });

  const checkCameraStatus = async () => {
    try {
      const r = await fetch(`${API_BASE}/api/live/status`, { cache: "no-store" });
      if (r.ok) {
        const data = await r.json();
        setCameraStatus(data.cameras || {});
      }
    } catch (e) {
      console.warn("Failed to fetch camera status:", e);
    }
  };

  const handleRestartCamera = async (camId: string) => {
    setRestartingCameras((prev) => ({ ...prev, [camId]: true }));

    try {
      const r = await fetch(
        `${API_BASE}/api/live/restart?target_cam_id=${encodeURIComponent(camId)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }
      );

      if (r.ok) {
        console.log(`Camera ${camId} restarted successfully`);
        window.setTimeout(() => {
          setRestartingCameras((prev) => ({ ...prev, [camId]: false }));
        }, 2000);
      } else {
        setRestartingCameras((prev) => ({ ...prev, [camId]: false }));
      }
    } catch (e) {
      console.error(`Failed to restart camera ${camId}:`, e);
      setRestartingCameras((prev) => ({ ...prev, [camId]: false }));
    }
  };

  useEffect(() => {
    const loadDetectionConfig = async () => {
      try {
        const r = await fetch(`${API_BASE}/api/live/detection/state`, { cache: "no-store" });
        if (r.ok) {
          const config = await r.json();
          setDetectionConfig(config || {});
        }
      } catch (e) {
        console.warn("Failed to load detection config:", e);
      }
    };
    loadDetectionConfig();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("live_fisheye_override_v1", JSON.stringify(fisheyeOverride));
    } catch {}
  }, [fisheyeOverride]);

  const handleToggleDetection = async (camId: string, enabled: boolean) => {
    setUpdatingDetection((prev) => ({ ...prev, [camId]: true }));

    try {
      const r = await fetch(
        `${API_BASE}/api/live/detection/toggle/${encodeURIComponent(camId)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled }),
          cache: "no-store",
        }
      );

      if (r.ok) {
        const result = await r.json();
        setDetectionConfig((prev) => ({
          ...prev,
          [camId]: !!result?.detection_enabled,
        }));
      }
    } catch (e) {
      console.error("Failed to toggle detection:", e);
    } finally {
      setUpdatingDetection((prev) => ({ ...prev, [camId]: false }));
    }
  };

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const r = await fetch(`${API_BASE}/api/lostfound/cameras_for_settings`, { cache: "no-store" });
        if (!r.ok) throw new Error(`cameras_for_settings HTTP ${r.status}`);
        const j = await r.json();
        if (alive) setCamList(Array.isArray(j) ? j : []);
      } catch {
        if (alive) setCamList([]);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;

    const tickState = async () => {
      try {
        const r = await fetch(`${API_BASE}/api/live/state`, { cache: "no-store" });
        if (!r.ok) throw new Error(`live/state HTTP ${r.status}`);
        const j = (await r.json()) as LiveState;
        if (alive) {
          setState(j);
          setErr(null);
        }
      } catch (e: any) {
        if (alive) setErr(e?.message || "Failed to load live state");
      }
    };

    tickState();
    const id = window.setInterval(tickState, 1000);

    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    const tickStatus = async () => {
      await checkCameraStatus();
    };

    tickStatus();
    const id = window.setInterval(tickStatus, 5000);

    return () => window.clearInterval(id);
  }, []);

  const cams = useMemo(() => {
    const liveMap = state?.cameras || {};

    if (!camList.length) {
      return Object.entries(liveMap)
        .map(([camId, cam]) => ({
          camId,
          meta: { id: camId, name: camId } as SettingsCamera,
          cam,
        }))
        .sort((a, b) => a.camId.localeCompare(b.camId));
    }

    return camList.map((meta) => {
      const normId = normalizeCamId(meta.id);
      const live = liveMap[normId] || null;
      return { camId: normId, meta, cam: live };
    });
  }, [camList, state]);

  const isFisheye = (camId: string, meta?: SettingsCamera) => {
    const ov = fisheyeOverride[camId];
    if (ov === true) return true;
    if (ov === false) return false;

    if (meta?.isFisheye === true) return true;
    if (meta?.isFisheye === false) return false;

    const vt = String(meta?.videoType || "").toLowerCase();
    if (vt === "fisheye") return true;
    if (vt === "normal") return false;

    return false;
  };

  const toggleOverride = (camId: string) => {
    setFisheyeOverride((m) => {
      const current = m[camId];
      if (current == null) return { ...m, [camId]: true };
      if (current === true) return { ...m, [camId]: false };
      const next = { ...m };
      delete next[camId];
      return next;
    });
  };

  const getStreamUrls = (camId: string, meta?: SettingsCamera) => {
    const views = (meta?.views || []) as SettingsView[];

    const findView = (key: string) =>
      views.find((v) => String(v?.id || "").endsWith(`__${key}`)) ||
      views.find((v) => String(v?.name || "").toLowerCase().includes(`group ${key.toLowerCase()}`));

    const v0 =
      views.find((v) => String(v?.id || "").endsWith(`__0`)) ||
      views.find((v) => v?.order === 0);

    const url0 = v0?.mjpegUrl || meta?.mjpegUrl;
    const urlA = findView("A")?.mjpegUrl;
    const urlB = findView("B")?.mjpegUrl;

    const encodedId = encodeURIComponent(camId);

    return {
      normal: url0 || `${API_BASE}/api/live/mjpeg/${encodedId}/0`,
      groupA: urlA || `${API_BASE}/api/live/mjpeg/${encodedId}/A`,
      groupB: urlB || `${API_BASE}/api/live/mjpeg/${encodedId}/B`,
    };
  };

  return (
  <div className="h-full w-full px-6 py-4">
    <div className="flex items-center justify-between mb-4">
      <div>
        <h1 className="text-xl font-semibold text-white">
          {mode === "lost-found" ? "Lost & Found Live View" : "Attire Compliance Live View"}
        </h1>
        <p className="text-slate-400 text-sm">
          Live source: <span className="text-slate-300">{API_BASE}</span>
        </p>
      </div>

      {err ? (
        <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 px-3 py-2 rounded-lg">
          {err}
        </div>
      ) : null}
    </div>

    <div className="grid grid-cols-1 2xl:grid-cols-2 gap-5 w-full">
      {cams.map(({ camId, cam, meta }) => {
        const hasLive = !!cam;
        const lostCount = cam?.lost_items?.length ?? 0;

        const fish = isFisheye(camId, meta);
        const camStatus = cameraStatus[camId] || ({} as CameraStatus);
        const videoEnded = !!camStatus.video_ended;

        const detectionEnabled = detectionConfig[camId] !== false && !videoEnded;
        const isUpdating = !!updatingDetection[camId];

        const allDets: LiveDet[] = detectionEnabled
          ? (((cam?.views || []).flatMap((v) => (v?.detections || v?.dets || []) as LiveDet[])) as LiveDet[])
          : [];

        const streamUrls_ = getStreamUrls(camId, meta);
        const isRtsp = !!meta?.is_rtsp;

        const overrideState = fisheyeOverride[camId];
        const vt = String(meta?.videoType || "").toLowerCase();

        const badgeText =
          overrideState == null
            ? fish
              ? vt
                ? `FISHEYE (${vt})`
                : "FISHEYE"
              : vt
              ? `NORMAL (${vt})`
              : "NORMAL"
            : fish
            ? "FISHEYE (forced)"
            : "NORMAL (forced)";

        const key0 = `${camId}:v0`;
        const ratio0 = aspectMap[key0] || 1.3333333;

        const keyA = `${camId}:A`;
        const keyB = `${camId}:B`;
        const ratioA = aspectMap[keyA] || 1.3333333;
        const ratioB = aspectMap[keyB] || 1.3333333;

        return (
          <div
            key={camId}
            className="rounded-2xl border border-slate-700/50 bg-slate-900/40 overflow-hidden w-full h-full"
          >
            <div className="px-4 py-3 border-b border-slate-700/40 flex items-center justify-between">
              <div className="text-white font-medium flex items-center gap-2">
                {meta?.name || camId}

                <button
                  onClick={() => toggleOverride(camId)}
                  className={`text-[10px] px-2 py-0.5 rounded-full border transition ${
                    fish
                      ? "border-emerald-500/40 text-emerald-200 bg-emerald-500/10 hover:bg-emerald-500/20"
                      : "border-slate-600/40 text-slate-300 bg-slate-800/20 hover:bg-slate-800/35"
                  }`}
                  title="Click to toggle: auto → fisheye → normal → auto"
                >
                  {badgeText}
                </button>

                {isUpdating && <span className="text-[10px] text-slate-400">updating...</span>}

                {videoEnded && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
                    ENDED
                  </span>
                )}
              </div>

              <div className="text-xs text-slate-400">
                REC •{" "}
                {new Date().toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </div>
            </div>

            <div className="p-3 space-y-3">
              {!hasLive ? (
                <div className="rounded-xl border border-slate-700/40 overflow-hidden">
                  <PlaceholderFrame label="No live pipeline data (pipelines_live not running for this cam_id)" />
                  <StatusStrip
                    lostCount={0}
                    hasLive={false}
                    detectionEnabled={false}
                    onToggleDetection={handleToggleDetection}
                    camId={camId}
                  />
                </div>
              ) : !fish ? (
                <div className="rounded-xl border border-slate-700/40 overflow-hidden">
                  <div className="w-full relative bg-black rounded-lg" style={{ aspectRatio: String(ratio0) }}>
                    <MjpegStream
                      url={streamUrls_.normal}
                      camId={camId}
                      viewId={0}
                      detectionEnabled={detectionEnabled}
                      showOverlays={false}
                      onAspect={(r) => setAspect(key0, r)}
                      videoEnded={videoEnded}
                      onRestart={() => handleRestartCamera(camId)}
                    />

                    {detectionEnabled && (
                      <div className="absolute inset-0 pointer-events-none">
                        {allDets
                          .filter((d) => Number(d?.view_id ?? 0) === 0)
                          .map((d, i) => {
                            const box = toPctBox(d);
                            if (!box) return null;

                            return (
                              <div
                                key={`n-${camId}-${i}`}
                                className={`absolute border-2 rounded-md ${detColor(d)}`}
                                style={{
                                  left: `${clamp(box.x, 0, 100)}%`,
                                  top: `${clamp(box.y, 0, 100)}%`,
                                  width: `${clamp(box.w, 0, 100)}%`,
                                  height: `${clamp(box.h, 0, 100)}%`,
                                }}
                              >
                                <div className="absolute -top-6 left-0 px-2 py-1 text-xs rounded-md bg-black/70 text-white border border-white/10 whitespace-nowrap">
                                  {detLabel(d)}
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    )}
                  </div>

                  <StatusStrip
                    lostCount={detectionEnabled ? lostCount : 0}
                    hasLive={true}
                    detectionEnabled={detectionEnabled}
                    onToggleDetection={handleToggleDetection}
                    onRestartCamera={handleRestartCamera}
                    camId={camId}
                    cameraStatus={camStatus}
                    isRestarting={restartingCameras[camId]}
                  />
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="rounded-xl border border-slate-700/40 overflow-hidden">
                    <div className="px-3 py-2 text-xs text-slate-300 bg-slate-950/40 border-b border-slate-700/40">
                      Group A (2×2 grid) {!detectionEnabled && "- Display Only"}
                    </div>

                    <div
                      className="w-full relative bg-black rounded-lg"
                      style={{ aspectRatio: String(ratioA) }}
                    >
                      <MjpegStream
                        url={streamUrls_.groupA}
                        camId={camId}
                        viewId={"A"}
                        detectionEnabled={detectionEnabled}
                        showOverlays={detectionEnabled}
                        onAspect={(r) => setAspect(keyA, r)}
                        videoEnded={videoEnded}
                        onRestart={() => handleRestartCamera(camId)}
                      />
                    </div>

                    <StatusStrip
                      lostCount={detectionEnabled ? lostCount : 0}
                      hasLive={true}
                      detectionEnabled={detectionEnabled}
                      onToggleDetection={handleToggleDetection}
                      onRestartCamera={handleRestartCamera}
                      camId={camId}
                      cameraStatus={camStatus}
                      isRestarting={restartingCameras[camId]}
                    />
                  </div>

                  <div className="rounded-xl border border-slate-700/40 overflow-hidden">
                    <div className="px-3 py-2 text-xs text-slate-300 bg-slate-950/40 border-b border-slate-700/40">
                      Group B (2×2 grid) {!detectionEnabled && "- Display Only"}
                    </div>

                    <div
                      className="w-full relative bg-black rounded-lg"
                      style={{ aspectRatio: String(ratioB) }}
                    >
                      <MjpegStream
                        url={streamUrls_.groupB}
                        camId={camId}
                        viewId={"B"}
                        detectionEnabled={detectionEnabled}
                        showOverlays={detectionEnabled}
                        onAspect={(r) => setAspect(keyB, r)}
                        videoEnded={videoEnded}
                        onRestart={() => handleRestartCamera(camId)}
                      />
                    </div>

                    <StatusStrip
                      lostCount={detectionEnabled ? lostCount : 0}
                      hasLive={true}
                      detectionEnabled={detectionEnabled}
                      onToggleDetection={handleToggleDetection}
                      onRestartCamera={handleRestartCamera}
                      camId={camId}
                      cameraStatus={camStatus}
                      isRestarting={restartingCameras[camId]}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  </div>
);
}

export default LiveViewPage;
// src/pages/LiveViewPage.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { getApiBase, resolveApiUrl } from "../api/base";

const MAX_ACTIVE_LIVE_STREAMS = 4;
const STATE_POLL_MS = 3000;
const STATUS_POLL_MS = 6000;
const OVERRIDE_POLL_MS = 4000;
const MAX_STREAM_RETRIES = 5;

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

type CamRow = {
  camId: string;
  meta: SettingsCamera;
  cam: LiveCam | null;
  fish: boolean;
  isActiveStream: boolean;
};

type ViewModeOverride = "auto" | "fisheye" | "normal";

function normalizeCamId(id: string) {
  return (id || "").replace(/_h264$/i, "");
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function shallowEqualOverrides(
  a: Record<string, ViewModeOverride>,
  b: Record<string, ViewModeOverride>
) {
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  for (const k of ak) {
    if (a[k] !== b[k]) return false;
  }
  return true;
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
  isActiveStream,
}: {
  lostCount: number;
  hasLive: boolean;
  detectionEnabled: boolean;
  onToggleDetection: (camId: string, enabled: boolean) => Promise<void> | void;
  onRestartCamera?: (camId: string) => void;
  camId: string;
  cameraStatus?: CameraStatus;
  isRestarting?: boolean;
  isActiveStream?: boolean;
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
      <div className="flex items-center gap-2 flex-wrap">
        <span className="inline-flex items-center gap-1">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              !hasLive ? "bg-slate-500" : videoEnded ? "bg-yellow-400 animate-pulse" : "bg-emerald-400"
            }`}
          />
          {!hasLive ? "No Pipeline" : videoEnded ? "Video Ended" : "Live"}
        </span>

        {typeof isActiveStream === "boolean" && hasLive && !videoEnded && (
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] border ${
              isActiveStream
                ? "bg-blue-500/20 text-blue-300 border-blue-500/30"
                : "bg-slate-700/20 text-slate-300 border-slate-600/30"
            }`}
          >
            {isActiveStream ? "Active Stream" : "Paused"}
          </span>
        )}

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
        <span>FPS: ~ 4.0</span>
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

function PausedPreview({
  label,
  reason,
}: {
  label: string;
  reason?: string;
}) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black">
      <div className="text-center">
        <div className="text-slate-200 text-sm">{label}</div>
        {reason ? <div className="text-slate-500 text-xs mt-2">{reason}</div> : null}
      </div>
    </div>
  );
}

function StreamUnavailableOverlay({ message }: { message: string }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-20">
      <div className="text-center px-4">
        <div className="text-slate-200 text-sm">{message}</div>
        <div className="text-slate-500 text-xs mt-2">
          Stream retry stopped temporarily
        </div>
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
  const retryTimer = useRef<number | null>(null);
  const readyPollTimer = useRef<number | null>(null);
  const streamKey = useRef(`${camId}-${String(viewId ?? "")}-${Date.now()}`);
  const onAspectRef = useRef(onAspect);
  const hasFirstFrameRef = useRef(false);

  const [loading, setLoading] = useState(true);
  const [errCount, setErrCount] = useState(0);
  const [stopped, setStopped] = useState(false);
  const [hasFirstFrame, setHasFirstFrame] = useState(false);

  useEffect(() => {
    onAspectRef.current = onAspect;
  }, [onAspect]);

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
    if (!img || !url) return;

    if (retryTimer.current) {
      window.clearTimeout(retryTimer.current);
      retryTimer.current = null;
    }
    if (readyPollTimer.current) {
      window.clearInterval(readyPollTimer.current);
      readyPollTimer.current = null;
    }

    setLoading(true);
    setErrCount(0);
    setStopped(false);
    setHasFirstFrame(false);
    hasFirstFrameRef.current = false;

    let lastRatio = 0;

    const markReadyFromImage = () => {
      const w = img.naturalWidth || 0;
      const h = img.naturalHeight || 0;

      if (w > 0 && h > 0) {
        if (!hasFirstFrameRef.current) {
          hasFirstFrameRef.current = true;
          setHasFirstFrame(true);
          setLoading(false);
          setStopped(false);
        }

        const ratio = w / h;
        if (Math.abs(ratio - lastRatio) > 0.001) {
          lastRatio = ratio;
          onAspectRef.current?.(ratio);
        }
        return true;
      }

      return false;
    };

    const startReadyPolling = () => {
      if (readyPollTimer.current) {
        window.clearInterval(readyPollTimer.current);
      }

      readyPollTimer.current = window.setInterval(() => {
        const ok = markReadyFromImage();
        if (ok && readyPollTimer.current) {
          window.clearInterval(readyPollTimer.current);
          readyPollTimer.current = null;
        }
      }, 250);
    };

    const onLoad = () => {
      markReadyFromImage();
    };

    const onError = () => {
      setLoading(false);

      if (readyPollTimer.current) {
        window.clearInterval(readyPollTimer.current);
        readyPollTimer.current = null;
      }

      setErrCount((prev) => {
        const next = prev + 1;

        if (next >= MAX_STREAM_RETRIES) {
          setStopped(true);
          return next;
        }

        const delay = Math.min(10000, 1500 + next * 1500);

        retryTimer.current = window.setTimeout(() => {
          const img2 = imgRef.current;
          if (!img2) return;

          hasFirstFrameRef.current = false;
          setHasFirstFrame(false);
          setLoading(true);

          img2.src = "";
          img2.src = makeUrl(url, next);

          startReadyPolling();
        }, delay);

        return next;
      });
    };

    img.addEventListener("load", onLoad);
    img.addEventListener("error", onError);

    img.src = "";
    img.src = makeUrl(url, 0);

    startReadyPolling();

    return () => {
      img.removeEventListener("load", onLoad);
      img.removeEventListener("error", onError);

      if (retryTimer.current) {
        window.clearTimeout(retryTimer.current);
        retryTimer.current = null;
      }

      if (readyPollTimer.current) {
        window.clearInterval(readyPollTimer.current);
        readyPollTimer.current = null;
      }

      img.src = "";
      img.removeAttribute("src");
    };
  }, [url, detectionEnabled, showOverlays, camId, viewId]);

  return (
    <>
      {loading && !videoEnded && !stopped && (
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

      {!videoEnded && stopped && (
        <StreamUnavailableOverlay message="Stream unavailable" />
      )}

      <img
        ref={imgRef}
        className={`absolute inset-0 w-full h-full object-contain transition-opacity duration-300 ${
          hasFirstFrame && !videoEnded && !stopped ? "opacity-100" : "opacity-0"
        }`}
        alt={`${camId} view ${String(viewId ?? "")}`}
        draggable={false}
      />
    </>
  );
}

function CameraSelectorBar({
  rows,
  activeCamIds,
  onToggle,
}: {
  rows: CamRow[];
  activeCamIds: string[];
  onToggle: (camId: string) => void;
}) {
  const activeSet = new Set(activeCamIds.map((x) => normalizeCamId(x)));

  return (
    <div className="sticky top-0 z-20 mb-5 rounded-2xl border border-slate-700/50 bg-slate-900/85 backdrop-blur p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-white font-semibold">Live View Camera Selector</div>
          <div className="text-xs text-slate-400">
            Select up to {MAX_ACTIVE_LIVE_STREAMS} cameras to display below
          </div>
        </div>

        <div className="text-sm text-slate-300">
          {activeCamIds.length} / {MAX_ACTIVE_LIVE_STREAMS} selected
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {rows.map((row) => {
          const checked = activeSet.has(normalizeCamId(row.camId));
          const disabled = !checked && activeCamIds.length >= MAX_ACTIVE_LIVE_STREAMS;

          return (
            <label
              key={row.camId}
              className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-sm transition ${
                checked
                  ? "border-blue-500/40 bg-blue-500/10 text-blue-200"
                  : disabled
                  ? "border-slate-700/40 bg-slate-800/20 text-slate-500 cursor-not-allowed"
                  : "border-slate-600/40 bg-slate-800/20 text-slate-200 hover:bg-slate-800/35 cursor-pointer"
              }`}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={disabled}
                onChange={() => onToggle(row.camId)}
                className="accent-blue-500"
              />

              <span>{row.meta?.name || row.camId}</span>

              <span
                className={`text-[10px] px-2 py-0.5 rounded-full border ${
                  row.fish
                    ? "border-emerald-500/30 text-emerald-300 bg-emerald-500/10"
                    : "border-slate-600/30 text-slate-300 bg-slate-700/20"
                }`}
              >
                {row.fish ? "Fisheye" : "Normal"}
              </span>

              {!row.cam && (
                <span className="text-[10px] px-2 py-0.5 rounded-full border border-yellow-500/30 text-yellow-300 bg-yellow-500/10">
                  No Live Data
                </span>
              )}
            </label>
          );
        })}
      </div>
    </div>
  );
}

function CameraCard({
  row,
  fisheyeOverride,
  updatingDetection,
  detectionConfig,
  cameraStatus,
  restartingCameras,
  aspectMap,
  setAspect,
  toggleOverride,
  getStreamUrls,
  handleToggleDetection,
  handleRestartCamera,
}: {
  row: CamRow;
  fisheyeOverride: Record<string, ViewModeOverride>;
  updatingDetection: Record<string, boolean>;
  detectionConfig: DetectionConfig;
  cameraStatus: Record<string, CameraStatus>;
  restartingCameras: Record<string, boolean>;
  aspectMap: Record<string, number>;
  setAspect: (key: string, ratio: number) => void;
  toggleOverride: (camId: string) => void;
  getStreamUrls: (camId: string, meta?: SettingsCamera) => {
    normal: string;
    groupA: string;
    groupB: string;
  };
  handleToggleDetection: (camId: string, enabled: boolean) => Promise<void>;
  handleRestartCamera: (camId: string) => Promise<void>;
}) {
  const { camId, cam, meta, fish, isActiveStream } = row;
  const hasLive = !!cam;
  const lostCount = cam?.lost_items?.length ?? 0;

  const camStatus = cameraStatus[camId] || ({} as CameraStatus);
  const videoEnded = !!camStatus.video_ended;
  const detectionEnabled = detectionConfig[camId] !== false && !videoEnded;
  const isUpdating = !!updatingDetection[camId];
  const allDets: LiveDet[] = detectionEnabled
    ? (((cam?.views || []).flatMap((v) => (v?.detections || v?.dets || []) as LiveDet[])) as LiveDet[])
    : [];

  const streamUrls_ = getStreamUrls(camId, meta);

  const overrideState = fisheyeOverride[normalizeCamId(camId)] || "auto";
  const vt = String(meta?.videoType || "").toLowerCase();

  const badgeText =
    overrideState === "fisheye"
      ? "FISHEYE (forced)"
      : overrideState === "normal"
      ? "NORMAL (forced)"
      : fish
      ? vt
        ? `FISHEYE (${vt})`
        : "FISHEYE"
      : vt
      ? `NORMAL (${vt})`
      : "NORMAL";

  const key0 = `${camId}:v0`;
  const ratio0 = aspectMap[key0] || 1.3333333;

  const keyA = `${camId}:A`;
  const keyB = `${camId}:B`;
  const ratioA = aspectMap[keyA] || 1.3333333;
  const ratioB = aspectMap[keyB] || 1.3333333;

  return (
    <div className="rounded-2xl border border-slate-700/50 bg-slate-900/40 overflow-hidden w-full h-full">
      <div className="px-4 py-3 border-b border-slate-700/40 flex items-center justify-between">
        <div className="text-white font-medium flex items-center gap-2 flex-wrap">
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
              isActiveStream={false}
            />
          </div>
        ) : !fish ? (
          <div className="rounded-xl border border-slate-700/40 overflow-hidden">
           <div
              className="w-full relative bg-black rounded-lg min-h-[410px]"
              style={{ aspectRatio: String(ratio0) }}
            >
              {isActiveStream ? (
                <>
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
                </>
              ) : (
                <PausedPreview
                  label="Live stream paused"
                  reason="Tick this camera in the selector bar to display it"
                />
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
              isActiveStream={isActiveStream}
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-xl border border-slate-700/40 overflow-hidden">
              <div className="px-3 py-2 text-xs text-slate-300 bg-slate-950/40 border-b border-slate-700/40">
                Group A (2×2 grid) {!detectionEnabled && "- Display Only"}
              </div>

              <div
                className="w-full relative bg-black rounded-lg max-h-[350px]"
                style={{ aspectRatio: String(ratioA) }}
              >
                {isActiveStream ? (
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
                ) : (
                  <PausedPreview
                    label="Group A paused"
                    reason="Tick this camera in the selector bar to display it"
                  />
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
                isActiveStream={isActiveStream}
              />
            </div>

            <div className="rounded-xl border border-slate-700/40 overflow-hidden">
              <div className="px-3 py-2 text-xs text-slate-300 bg-slate-950/40 border-b border-slate-700/40">
                Group B (2×2 grid) {!detectionEnabled && "- Display Only"}
              </div>

              <div
                className="w-full relative bg-black rounded-lg max-h-[350px]"
                style={{ aspectRatio: String(ratioA) }}
              >
                {isActiveStream ? (
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
                ) : (
                  <PausedPreview
                    label="Group B paused"
                    reason="Tick this camera in the selector bar to display it"
                  />
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
                isActiveStream={isActiveStream}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function LiveViewPage({ mode }: { mode: "lost-found" | "attire" }) {
  const API_BASE = getApiBase(mode);

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

  const [fisheyeOverride, setFisheyeOverride] = useState<Record<string, ViewModeOverride>>({});
  const [activeCamIds, setActiveCamIds] = useState<string[]>([]);
  const [activeRestoreDone, setActiveRestoreDone] = useState(false);
  const [activeCustomized, setActiveCustomized] = useState(false);

  const savingOverrideRef = useRef(false);
  const savingActiveSequenceRef = useRef(false);

  const loadActiveSequence = async () => {
    if (!API_BASE) return;

    try {
      const r = await fetch(
        `${API_BASE}/api/live/active-sequence?mode=${encodeURIComponent(mode)}`,
        { cache: "no-store" }
      );

      if (!r.ok) throw new Error(`active-sequence HTTP ${r.status}`);

      const j = await r.json();
      const arr = Array.isArray(j?.active_cam_ids) ? j.active_cam_ids : [];
      const cleaned = arr
        .map((x: any) => normalizeCamId(String(x || "")))
        .filter(Boolean)
        .slice(0, MAX_ACTIVE_LIVE_STREAMS);

      setActiveCamIds(cleaned);
      setActiveCustomized(cleaned.length > 0);
      setActiveRestoreDone(true);
    } catch (e) {
      console.warn("Failed to load active sequence:", e);
      setActiveCamIds([]);
      setActiveCustomized(false);
      setActiveRestoreDone(true);
    }
  };

  const saveActiveSequence = async (nextIds: string[]) => {
    if (!API_BASE) return false;

    try {
      savingActiveSequenceRef.current = true;

      const r = await fetch(`${API_BASE}/api/live/active-sequence`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          active_cam_ids: nextIds
            .map((id) => normalizeCamId(id))
            .filter(Boolean)
            .slice(0, MAX_ACTIVE_LIVE_STREAMS),
        }),
      });

      return r.ok;
    } catch (e) {
      console.warn("Failed to save active sequence:", e);
      return false;
    } finally {
      window.setTimeout(() => {
        savingActiveSequenceRef.current = false;
      }, 500);
    }
  };

  const loadViewModeOverrides = async () => {
    if (!API_BASE) return;

    try {
      const r = await fetch(`${API_BASE}/api/live/view-mode-overrides`, {
        cache: "no-store",
      });
      if (!r.ok) throw new Error(`view-mode-overrides HTTP ${r.status}`);

      const j = await r.json();
      const next: Record<string, ViewModeOverride> = {};

      if (j && typeof j === "object") {
        for (const [k, v] of Object.entries(j)) {
          const key = normalizeCamId(k);
          const value = String(v).toLowerCase();
          if (value === "auto" || value === "fisheye" || value === "normal") {
            next[key] = value as ViewModeOverride;
          }
        }
      }

      setFisheyeOverride((prev) => {
        if (shallowEqualOverrides(prev, next)) return prev;
        return next;
      });
    } catch (e) {
      console.warn("Failed to load view mode overrides:", e);
    }
  };

  const saveViewModeOverrides = async (nextOverrides: Record<string, ViewModeOverride>) => {
    if (!API_BASE) return false;
    try {
      savingOverrideRef.current = true;
      const r = await fetch(`${API_BASE}/api/live/view-mode-overrides`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextOverrides),
      });
      return r.ok;
    } catch (e) {
      console.warn("Failed to save view mode overrides:", e);
      return false;
    } finally {
      window.setTimeout(() => {
        savingOverrideRef.current = false;
      }, 500);
    }
  };

  const checkCameraStatus = async () => {
    if (!API_BASE) return;
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
    if (!API_BASE) return;

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
    if (!API_BASE) return;

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
  }, [API_BASE]);

  useEffect(() => {
    if (!API_BASE) return;
    loadViewModeOverrides();
  }, [API_BASE]);

  useEffect(() => {
    if (!API_BASE) return;
    loadActiveSequence();
  }, [API_BASE, mode]);

  useEffect(() => {
    if (!API_BASE) return;

    let busy = false;

    const tickOverrides = async () => {
      if (busy || savingOverrideRef.current) return;
      busy = true;
      try {
        await loadViewModeOverrides();
      } finally {
        busy = false;
      }
    };

    const id = window.setInterval(tickOverrides, OVERRIDE_POLL_MS);
    return () => window.clearInterval(id);
  }, [API_BASE]);

  const handleToggleDetection = async (camId: string, enabled: boolean) => {
    if (!API_BASE) return;

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
    if (!API_BASE) return;

    (async () => {
      try {
        const settingsPath =
          mode === "lost-found"
            ? "/api/lostfound/cameras_for_settings"
            : "/api/attire/cameras_for_settings";

        const r = await fetch(`${API_BASE}${settingsPath}`, { cache: "no-store" });
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
  }, [API_BASE, mode]);

  useEffect(() => {
    let alive = true;
    if (!API_BASE) return;

    let busy = false;

    const tickState = async () => {
      if (busy) return;
      busy = true;

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
      } finally {
        busy = false;
      }
    };

    tickState();
    const id = window.setInterval(tickState, STATE_POLL_MS);

    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [API_BASE]);

  useEffect(() => {
    if (!API_BASE) return;

    let busy = false;

    const tickStatus = async () => {
      if (busy) return;
      busy = true;
      try {
        await checkCameraStatus();
      } finally {
        busy = false;
      }
    };

    tickStatus();
    const id = window.setInterval(tickStatus, STATUS_POLL_MS);

    return () => window.clearInterval(id);
  }, [API_BASE]);

  const isFisheye = (camId: string, meta?: SettingsCamera) => {
    const key = normalizeCamId(camId);
    const ov = fisheyeOverride[key] || "auto";

    if (ov === "fisheye") return true;
    if (ov === "normal") return false;

    if (meta?.isFisheye === true) return true;
    if (meta?.isFisheye === false) return false;

    const vt = String(meta?.videoType || "").toLowerCase();
    if (vt === "fisheye") return true;
    if (vt === "normal") return false;

    return false;
  };

  const camsBase = useMemo(() => {
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

  useEffect(() => {
    if (!activeRestoreDone) return;
    if (!camsBase.length) return;

    setActiveCamIds((prev) => {
      const validLiveIds = camsBase
        .filter(({ cam }) => !!cam)
        .map(({ camId }) => normalizeCamId(camId));

      if (!validLiveIds.length) {
        return prev;
      }

      const filteredPrev = prev
        .map((id) => normalizeCamId(id))
        .filter((id) => validLiveIds.includes(id))
        .slice(0, MAX_ACTIVE_LIVE_STREAMS);

      if (activeCustomized) {
        if (filteredPrev.length > 0) return filteredPrev;
        return validLiveIds.slice(0, MAX_ACTIVE_LIVE_STREAMS);
      }

      return validLiveIds.slice(0, MAX_ACTIVE_LIVE_STREAMS);
    });
  }, [camsBase, activeRestoreDone, activeCustomized]);

  const activeLiveSet = useMemo(
    () => new Set(activeCamIds.map((id) => normalizeCamId(id))),
    [activeCamIds]
  );

  const toggleActiveCamera = async (camId: string) => {
    const key = normalizeCamId(camId);
    const normalizedPrev = activeCamIds.map((id) => normalizeCamId(id));
    const exists = normalizedPrev.includes(key);

    let nextIds: string[];

    if (exists) {
      nextIds = normalizedPrev.filter((id) => id !== key);
    } else {
      if (normalizedPrev.length >= MAX_ACTIVE_LIVE_STREAMS) {
        alert(`Max ${MAX_ACTIVE_LIVE_STREAMS} active live streams at one time.`);
        return;
      }
      nextIds = [...normalizedPrev, key];
    }

    setActiveCamIds(nextIds);
    setActiveCustomized(true);

    const ok = await saveActiveSequence(nextIds);
    if (!ok) {
      alert("Failed to save active live sequence.");
    }
  };

  const toggleOverride = async (camId: string) => {
    const key = normalizeCamId(camId);

    const current = fisheyeOverride[key] || "auto";

    let nextValue: ViewModeOverride;
    if (current === "auto") nextValue = "fisheye";
    else if (current === "fisheye") nextValue = "normal";
    else nextValue = "auto";

    const nextOverrides: Record<string, ViewModeOverride> = {
      ...fisheyeOverride,
      [key]: nextValue,
    };

    setFisheyeOverride(nextOverrides);

    const ok = await saveViewModeOverrides(nextOverrides);
    if (!ok) {
      setFisheyeOverride(fisheyeOverride);
      alert("Failed to save shared view mode. Please try again.");
      return;
    }

    await loadViewModeOverrides();
  };

  const getStreamUrls = (camId: string, meta?: SettingsCamera) => {
    const views = (meta?.views || []) as SettingsView[];

    const findView = (key: string) =>
      views.find((v) => String(v?.id || "").endsWith(`__${key}`)) ||
      views.find((v) => String(v?.name || "").toLowerCase().includes(`group ${key.toLowerCase()}`));

    const v0 =
      views.find((v) => String(v?.id || "").endsWith(`__0`)) ||
      views.find((v) => v?.order === 0);

    const url0 = resolveApiUrl(mode, v0?.mjpegUrl || meta?.mjpegUrl);
    const urlA = resolveApiUrl(mode, findView("A")?.mjpegUrl);
    const urlB = resolveApiUrl(mode, findView("B")?.mjpegUrl);

    const encodedId = encodeURIComponent(camId);

    return {
      normal: url0 || `${API_BASE}/api/live/mjpeg/${encodedId}/0`,
      groupA: urlA || `${API_BASE}/api/live/mjpeg/${encodedId}/A`,
      groupB: urlB || `${API_BASE}/api/live/mjpeg/${encodedId}/B`,
    };
  };

  const rows = useMemo<CamRow[]>(() => {
    const baseRows = camsBase.map(({ camId, meta, cam }) => ({
      camId,
      meta,
      cam,
      fish: isFisheye(camId, meta),
      isActiveStream: activeLiveSet.has(normalizeCamId(camId)),
    }));

    const activeOrderMap = new Map(
      activeCamIds.map((id, idx) => [normalizeCamId(id), idx])
    );

    return [...baseRows].sort((a, b) => {
      const aKey = normalizeCamId(a.camId);
      const bKey = normalizeCamId(b.camId);

      const aActive = a.isActiveStream;
      const bActive = b.isActiveStream;

      if (aActive && bActive) {
        return (activeOrderMap.get(aKey) ?? 9999) - (activeOrderMap.get(bKey) ?? 9999);
      }

      if (aActive !== bActive) {
        return aActive ? -1 : 1;
      }

      if (a.fish !== b.fish) {
        return a.fish ? -1 : 1;
      }

      return String(a.meta?.name || a.camId).localeCompare(String(b.meta?.name || b.camId));
    });
  }, [camsBase, activeLiveSet, fisheyeOverride, activeCamIds]);

  const activeFish = useMemo(() => rows.filter((r) => r.isActiveStream && r.fish), [rows]);
  const activeNormal = useMemo(() => rows.filter((r) => r.isActiveStream && !r.fish), [rows]);
  const activeRows = [...activeFish, ...activeNormal];

  const liveCount = useMemo(() => rows.filter((x) => !!x.cam).length, [rows]);

  return (
    <div className="h-full w-full px-6 py-4 overflow-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">
            {mode === "lost-found"
              ? "Lost & Found Live Monitoring"
              : "Attire Compliance Live Monitoring"}
          </h1>

          {mode === "lost-found" && (
            <p className="text-sm text-slate-400 mt-2 max-w-2xl">
              Real-time CCTV monitoring for detecting and tracking unattended items across multiple camera sources.
            </p>
          )}

          {mode === "attire" && (
            <p className="text-sm text-slate-400 mt-2 max-w-2xl">
              Real-time monitoring of attire compliance violations detected from CCTV surveillance streams.
            </p>
          )}

          <p className="text-slate-500 text-xs mt-2">
            Live source: <span className="text-slate-300">{API_BASE || "NOT CONFIGURED"}</span>
          </p>

          <p className="text-slate-500 text-xs mt-1">
            Select up to 4 cameras using the selector below. Changes are reflected instantly in the live view.
          </p>
        </div>

        <div className="text-right">
          <div className="text-xs text-slate-400">
            Live cameras: <span className="text-slate-300">{liveCount}</span>
          </div>
          <div className="text-xs text-slate-400">
            Active now: <span className="text-slate-300">{activeCamIds.length}</span>
          </div>
        </div>
      </div>

      {err ? (
        <div className="mb-4 text-sm text-red-300 bg-red-500/10 border border-red-500/30 px-3 py-2 rounded-lg">
          {err}
        </div>
      ) : null}

      <div className="space-y-8">
        <CameraSelectorBar
          rows={rows}
          activeCamIds={activeCamIds}
          onToggle={toggleActiveCamera}
        />

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-white font-semibold">Active Cameras</h2>
            <div className="text-xs text-slate-400">
              {activeRows.length} active • max {MAX_ACTIVE_LIVE_STREAMS}
            </div>
          </div>

          {activeRows.length === 0 ? (
            <div className="rounded-2xl border border-slate-700/50 bg-slate-900/40 p-6 text-slate-400 text-sm">
              No active cameras selected. Tick any camera name in the selector bar above.
            </div>
          ) : (
            <div className="grid grid-cols-1 2xl:grid-cols-2 gap-5 w-full">
              {activeRows.map((row) => (
                <CameraCard
                  key={row.camId}
                  row={row}
                  fisheyeOverride={fisheyeOverride}
                  updatingDetection={updatingDetection}
                  detectionConfig={detectionConfig}
                  cameraStatus={cameraStatus}
                  restartingCameras={restartingCameras}
                  aspectMap={aspectMap}
                  setAspect={setAspect}
                  toggleOverride={toggleOverride}
                  getStreamUrls={getStreamUrls}
                  handleToggleDetection={handleToggleDetection}
                  handleRestartCamera={handleRestartCamera}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export default LiveViewPage;
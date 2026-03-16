import { useEffect, useMemo, useRef, useState } from "react";
import {
  Circle,
  AlertTriangle,
  WifiOff,
} from "lucide-react";
import type { Camera } from "../App";

interface CameraFeedProps {
  camera: Camera;
  groupViews?: Camera[];
  isSelected: boolean;
  onSelect: () => void;
  onRecordingToggle: (cameraId: string) => void;
  onStatusChange?: (cameraId: string, status: Camera["status"]) => void;
  isFullscreen?: boolean;
  gridContain?: boolean;
  cycleSeconds?: number;
}

function toSameOrigin(url?: string) {
  if (!url) return url;
  try {
    const u = new URL(url, window.location.origin);
    return u.pathname + u.search;
  } catch {
    return url;
  }
}

function withBust(url?: string, token?: number | string) {
  if (!url) return "";
  if (token === undefined || token === null) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}t=${token}`;
}

function isLiveMjpegUrl(url?: string) {
  if (!url) return false;
  return (
    url.includes("/api/live/mjpeg/") ||
    url.includes("/api/live/mjpeg_dashboard/")
  );
}

function overlayParam(url: string, overlay: 0 | 1) {
  try {
    const u = new URL(url, window.location.origin);
    u.searchParams.set("overlay", String(overlay));
    return u.pathname + u.search;
  } catch {
    const hasOverlay = /([?&])overlay=\d/.test(url);
    if (hasOverlay) {
      return url.replace(/([?&])overlay=\d/, `$1overlay=${overlay}`);
    }
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}overlay=${overlay}`;
  }
}

function toDashboardMjpeg(url?: string) {
  if (!url) return "";
  try {
    const u = new URL(url, window.location.origin);
    u.pathname = u.pathname.replace(
      "/api/live/mjpeg/",
      "/api/live/mjpeg_dashboard/"
    );
    u.searchParams.delete("overlay");
    return u.pathname + u.search;
  } catch {
    let out = url.replace(
      "/api/live/mjpeg/",
      "/api/live/mjpeg_dashboard/"
    );
    out = out.replace(/([?&])overlay=\d/g, "");
    out = out.replace(/[?&]$/, "");
    return out;
  }
}

function toDashboardSnapshot(url?: string) {
  if (!url) return "";
  try {
    const u = new URL(url, window.location.origin);
    u.pathname = u.pathname
      .replace("/api/live/mjpeg_dashboard/", "/api/live/dashboard_frame/")
      .replace("/api/live/mjpeg/", "/api/live/dashboard_frame/");
    u.searchParams.delete("overlay");
    return u.pathname + u.search;
  } catch {
    let out = url
      .replace("/api/live/mjpeg_dashboard/", "/api/live/dashboard_frame/")
      .replace("/api/live/mjpeg/", "/api/live/dashboard_frame/");
    out = out.replace(/([?&])overlay=\d/g, "");
    out = out.replace(/[?&]$/, "");
    return out;
  }
}

function toNormalCleanMjpeg(url?: string) {
  if (!url) return "";
  return overlayParam(url, 0);
}

function detectIsFisheye(cam: any): boolean {
  const candidates = [
    cam?.videoType,
    cam?.video_type,
    cam?.sourceVideoType,
    cam?.source_video_type,
    cam?.type,
    cam?.cameraType,
    cam?.camera_type,
    cam?.mode,
  ];

  for (const v of candidates) {
    const s = String(v || "").trim().toLowerCase();
    if (s === "fisheye" || s === "fish") return true;
    if (s === "normal") return false;
  }

  const nameBlob = [
    cam?.name,
    cam?.location,
    cam?.filename,
    cam?.id,
    cam?.mjpegUrl,
    cam?.videoUrl,
  ]
    .map((x) => String(x || "").toLowerCase())
    .join(" ");

  if (nameBlob.includes("fisheye")) return true;
  return false;
}

function stableOffsetFromId(id: string | number | undefined) {
  const s = String(id ?? "");
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  }
  return hash % 12;
}

export function CameraFeed({
  camera,
  groupViews,
  isSelected,
  onSelect,
  onRecordingToggle,
  onStatusChange,
  isFullscreen = false,
  gridContain = false,
  cycleSeconds = 30,
}: CameraFeedProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const warnTimerRef = useRef<number | null>(null);
  const retryTimerRef = useRef<number | null>(null);
  const snapshotStartTimerRef = useRef<number | null>(null);
  const hasPlayedRef = useRef(false);

  const [videoFailed, setVideoFailed] = useState(false);
  const [retryToken, setRetryToken] = useState<number>(0);
  const [snapshotTick, setSnapshotTick] = useState<number>(0);
  const [playbackState, setPlaybackState] = useState<
    "playing" | "loading" | "buffering" | "paused" | "offline" | "error"
  >("loading");

  const backendViews = (((camera as any).views as any[]) ?? []) as any[];

  const derivedViews: Camera[] = useMemo(() => {
    if (groupViews && groupViews.length > 0) return groupViews;
    if (!backendViews || backendViews.length === 0) return [];

    return backendViews.map((vv, idx) => ({
      ...camera,
      ...vv,
      id: vv.id ?? `${camera.id}__v${idx}`,
      name: vv.name ?? `${camera.name} (View ${idx + 1})`,
      videoUrl: vv.videoUrl || vv.video_url || "",
      mjpegUrl: vv.mjpegUrl || vv.mjpeg_url || "",
      filename: vv.filename,
      order: typeof vv.order === "number" ? vv.order : idx,
    })) as any;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera.id, groupViews, backendViews.length]);

  const viewsSorted = useMemo(() => {
    const arr = (derivedViews.length > 0 ? derivedViews : [camera]).slice();
    arr.sort((a: any, b: any) => {
      const ao = typeof a.order === "number" ? a.order : 0;
      const bo = typeof b.order === "number" ? b.order : 0;
      return ao - bo;
    });
    return arr;
  }, [camera, derivedViews]);

  const pageCount = viewsSorted.length > 1 ? viewsSorted.length : 1;
  const [pageIdx, setPageIdx] = useState(0);

  useEffect(() => {
    setPageIdx(0);
    hasPlayedRef.current = false;
    setVideoFailed(false);
    setPlaybackState("loading");
    setRetryToken(0);
    setSnapshotTick(Date.now());

    if (warnTimerRef.current) {
      window.clearTimeout(warnTimerRef.current);
      warnTimerRef.current = null;
    }
    if (retryTimerRef.current) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    if (snapshotStartTimerRef.current) {
      window.clearTimeout(snapshotStartTimerRef.current);
      snapshotStartTimerRef.current = null;
    }
  }, [camera.id]);

  useEffect(() => {
    if (pageCount <= 1) return;
    const ms = Math.max(5, cycleSeconds) * 1000;
    const t = window.setInterval(() => {
      setPageIdx((p) => (p + 1) % pageCount);
    }, ms);
    return () => window.clearInterval(t);
  }, [pageCount, cycleSeconds]);

  useEffect(() => {
    hasPlayedRef.current = false;
    setVideoFailed(false);
    setPlaybackState("loading");
    setRetryToken(0);
    setSnapshotTick(Date.now());

    if (warnTimerRef.current) {
      window.clearTimeout(warnTimerRef.current);
      warnTimerRef.current = null;
    }
    if (retryTimerRef.current) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    if (snapshotStartTimerRef.current) {
      window.clearTimeout(snapshotStartTimerRef.current);
      snapshotStartTimerRef.current = null;
    }
  }, [pageIdx]);

  const activeCam = useMemo(() => {
    if (pageCount <= 1) return camera;
    return viewsSorted[pageIdx] ?? viewsSorted[0] ?? camera;
  }, [camera, pageCount, pageIdx, viewsSorted]);

  const reportStatus = (id: string, status: Camera["status"]) => {
    if (typeof onStatusChange === "function") onStatusChange(id, status);
  };

  const mp4Src = toSameOrigin((activeCam as any).videoUrl || activeCam.videoUrl);
  const mjpegRaw = toSameOrigin(
    (activeCam as any).mjpegUrl ||
      (camera as any).mjpegUrl ||
      (activeCam as any).mjpeg_url ||
      (camera as any).mjpeg_url
  );

  const isRtspStream = isLiveMjpegUrl(mjpegRaw);
  const isFisheye = detectIsFisheye(activeCam) || detectIsFisheye(camera);

  const mjpegBase = useMemo(() => {
    if (!isRtspStream || !mjpegRaw) return mjpegRaw || "";
    return isFisheye
      ? toDashboardMjpeg(mjpegRaw)
      : toNormalCleanMjpeg(mjpegRaw);
  }, [isRtspStream, mjpegRaw, isFisheye]);

  const useLiveMjpeg = isRtspStream && (isSelected || isFullscreen);

  const mjpegSrc = useMemo(() => {
    if (!mjpegBase) return "";
    return withBust(mjpegBase, retryToken || undefined);
  }, [mjpegBase, retryToken]);

  const snapshotBase = useMemo(() => {
    if (!mjpegBase) return "";
    return toDashboardSnapshot(mjpegBase);
  }, [mjpegBase]);

  const snapshotSrc = useMemo(() => {
    if (!snapshotBase) return "";
    return withBust(snapshotBase, snapshotTick || Date.now());
  }, [snapshotBase, snapshotTick]);

  useEffect(() => {
    if (warnTimerRef.current) {
      window.clearTimeout(warnTimerRef.current);
      warnTimerRef.current = null;
    }

    if (!mp4Src && !mjpegRaw) {
      setPlaybackState("offline");
      reportStatus(camera.id, "offline");
      return;
    }

    setPlaybackState("loading");
    reportStatus(camera.id, "warning");

    warnTimerRef.current = window.setTimeout(() => {
      const v = videoRef.current;
      const hasData = !!v && v.readyState >= 2;

      if (!isRtspStream && !hasData && !videoFailed && !hasPlayedRef.current) {
        setPlaybackState("offline");
        reportStatus(camera.id, "offline");
      }
    }, 30000);

    if (!isRtspStream && videoRef.current) {
      try {
        videoRef.current.load();
        videoRef.current.play().catch(() => {});
      } catch {}
    }

    return () => {
      if (warnTimerRef.current) {
        window.clearTimeout(warnTimerRef.current);
        warnTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mp4Src, mjpegRaw, pageIdx, camera.id, isRtspStream, videoFailed]);

  useEffect(() => {
    return () => {
      if (warnTimerRef.current) {
        window.clearTimeout(warnTimerRef.current);
        warnTimerRef.current = null;
      }
      if (retryTimerRef.current) {
        window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      if (snapshotStartTimerRef.current) {
        window.clearTimeout(snapshotStartTimerRef.current);
        snapshotStartTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!isRtspStream || useLiveMjpeg) return;

    if (retryTimerRef.current) {
      window.clearInterval(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    if (snapshotStartTimerRef.current) {
      window.clearTimeout(snapshotStartTimerRef.current);
      snapshotStartTimerRef.current = null;
    }

    const refreshMs = 700;
    const offset = stableOffsetFromId(activeCam?.id ?? camera.id) * 60;

    snapshotStartTimerRef.current = window.setTimeout(() => {
      setSnapshotTick(Date.now());

      retryTimerRef.current = window.setInterval(() => {
        setSnapshotTick(Date.now());
      }, refreshMs) as unknown as number;
    }, offset);

    return () => {
      if (retryTimerRef.current) {
        window.clearInterval(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      if (snapshotStartTimerRef.current) {
        window.clearTimeout(snapshotStartTimerRef.current);
        snapshotStartTimerRef.current = null;
      }
    };
  }, [isRtspStream, useLiveMjpeg, activeCam?.id, camera.id]);

  const getStatusColor = () => {
    switch (camera.status) {
      case "online":
        return "text-green-400";
      case "warning":
        return "text-yellow-400";
      case "offline":
        return "text-red-400";
      default:
        return "text-slate-400";
    }
  };

  const getStatusIcon = () => {
    switch (camera.status) {
      case "online":
        return <Circle className="w-3 h-3 fill-current" />;
      case "warning":
        return <AlertTriangle className="w-4 h-4" />;
      case "offline":
        return <WifiOff className="w-4 h-4" />;
      default:
        return <Circle className="w-3 h-3 fill-current" />;
    }
  };

  const mediaClass = "absolute inset-0 w-full h-full object-contain bg-black";
  const topLabel =
    pageCount > 1 ? `${camera.name} (${pageIdx + 1}/${pageCount})` : camera.name;
  const viewSubtitle = pageCount > 1 ? `View: ${activeCam.name}` : "";

  return (
    <div
      onClick={onSelect}
      className={`group relative rounded-lg overflow-hidden border-2 transition-all cursor-pointer ${
        isSelected
          ? "border-blue-500 shadow-lg shadow-blue-500/20"
          : "border-slate-700 hover:border-slate-600"
      } ${isFullscreen ? "h-full flex flex-col" : gridContain ? "h-full" : ""}`}
    >
      <div
        className={`relative w-full bg-slate-950 overflow-hidden ${
          isFullscreen ? "h-full" : gridContain ? "h-full" : "h-[150px]"
        }`}
      >
        {camera.status === "offline" ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <WifiOff className="w-10 h-10 text-slate-600 mx-auto mb-2" />
              <p className="text-slate-500 text-sm">No Signal</p>
            </div>
          </div>
        ) : isRtspStream ? (
          videoFailed ? (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-950">
              <div className="text-center px-3">
                <p className="text-slate-300 text-sm">Stream can’t load</p>
                <a
                  className="text-blue-400 text-xs underline"
                  href={useLiveMjpeg ? mjpegSrc : snapshotSrc}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                >
                  Open stream in new tab
                </a>
              </div>
            </div>
          ) : useLiveMjpeg ? (
            <img
              className={mediaClass}
              src={mjpegSrc}
              alt="rtsp-live"
              onLoad={() => {
                hasPlayedRef.current = true;
                setPlaybackState("playing");
                setVideoFailed(false);
                reportStatus(camera.id, "online");
                if (warnTimerRef.current) {
                  window.clearTimeout(warnTimerRef.current);
                  warnTimerRef.current = null;
                }
              }}
              onError={(e) => {
                console.error("MJPEG ERROR:", activeCam.name, mjpegSrc, e);
                setVideoFailed(true);
                setPlaybackState("error");
                reportStatus(camera.id, "offline");

                if (retryTimerRef.current) {
                  window.clearTimeout(retryTimerRef.current);
                }

                retryTimerRef.current = window.setTimeout(() => {
                  setVideoFailed(false);
                  setPlaybackState("loading");
                  setRetryToken(Date.now());
                }, 2500);
              }}
            />
          ) : (
            <img
              className={mediaClass}
              src={snapshotSrc}
              alt="rtsp-snapshot"
              onLoad={() => {
                hasPlayedRef.current = true;
                setPlaybackState("playing");
                setVideoFailed(false);
                reportStatus(camera.id, "online");
                if (warnTimerRef.current) {
                  window.clearTimeout(warnTimerRef.current);
                  warnTimerRef.current = null;
                }
              }}
              onError={(e) => {
                setPlaybackState("buffering");
                reportStatus(camera.id, "warning");
              }}
            />
          )
        ) : mp4Src ? (
          videoFailed ? (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-950">
              <div className="text-center px-3">
                <p className="text-slate-300 text-sm">Video can’t play</p>
                <a
                  className="text-blue-400 text-xs underline"
                  href={mp4Src}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                >
                  Open video in new tab
                </a>
              </div>
            </div>
          ) : (
            <video
              ref={videoRef}
              key={`${camera.id}-p${pageIdx}`}
              src={mp4Src}
              className={mediaClass}
              autoPlay
              loop
              muted
              playsInline
              preload="auto"
              controls={false}
              onPlaying={() => {
                hasPlayedRef.current = true;
                setPlaybackState("playing");
                setVideoFailed(false);
                reportStatus(camera.id, "online");
                if (warnTimerRef.current) {
                  window.clearTimeout(warnTimerRef.current);
                  warnTimerRef.current = null;
                }
              }}
              onWaiting={() => {
                setPlaybackState("buffering");
                if (!videoFailed) reportStatus(camera.id, "warning");
              }}
              onStalled={() => {
                setPlaybackState("buffering");
                if (!videoFailed) reportStatus(camera.id, "warning");
              }}
              onPause={() => {
                if (!videoFailed) setPlaybackState("paused");
              }}
              onError={(e) => {
                console.error("VIDEO ERROR:", activeCam.name, mp4Src, e);
                setVideoFailed(true);
                setPlaybackState("error");
                reportStatus(camera.id, "offline");
              }}
            />
          )
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-slate-500 text-sm">No Preview</p>
          </div>
        )}

        {camera.recording && camera.status !== "offline" && (
          <div className="absolute top-3 right-3 flex items-center gap-2 bg-red-500/90 backdrop-blur-sm px-2 py-1 rounded z-20">
            <Circle className="w-2 h-2 fill-current animate-pulse" />
            <span className="text-xs">REC</span>
          </div>
        )}

        <div className="absolute top-3 right-[70px] bg-black/60 backdrop-blur-sm px-2 py-1 rounded text-xs z-20">
          {camera.status === "offline"
            ? "OFFLINE"
            : videoFailed
            ? "ERROR"
            : playbackState === "playing"
            ? useLiveMjpeg
              ? "LIVE"
              : "SNAPSHOT"
            : playbackState === "buffering"
            ? "BUFFERING"
            : playbackState === "paused"
            ? "PAUSED"
            : "LOADING"}
        </div>

        <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-sm px-2 py-1 rounded text-xs z-20">
          {topLabel.toUpperCase()}
        </div>

        <div
          className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent z-20 ${
            gridContain ? "p-2" : "p-4"
          }`}
        >
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-white">{camera.name}</h3>
              {viewSubtitle && (
                <p className="text-slate-300 text-xs mt-0.5">{viewSubtitle}</p>
              )}
              <p className="text-slate-300 text-sm mt-1">{camera.location}</p>
            </div>
            <div className={`flex items-center gap-1.5 ${getStatusColor()}`}>
              {getStatusIcon()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
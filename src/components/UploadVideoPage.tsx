// UploadVideoPage.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Upload,
  FileVideo,
  CheckCircle,
  AlertCircle,
  Play,
  Trash2,
} from "lucide-react";
import { ATTIRE_API_BASE, LOSTFOUND_API_BASE } from "../api/base";

type AnalysisMode = "lost-found" | "attire";
type VideoStatus = "processing" | "ready" | "failed" | "queued";
type AnalysisStatus = "queued" | "processing" | "done" | "failed" | null | undefined;

type UploadedVideo = {
  id: string;
  name: string;
  size: string;
  duration: string;
  uploadDate: Date;
  status: VideoStatus;
  backendPath?: string;

  // lostfound-specific
  error?: string | null;
  h264_ready?: boolean;
  h264_name?: string;
  roi_ready?: boolean;
  analysis_status?: AnalysisStatus;
  analysis_error?: string | null;
  is_analyzing?: boolean;
};

interface UploadVideoPageProps {
  onProcessingComplete?: () => void;
  onOpenLostFoundSettings?: (offlineStem: string) => void;
}

function getApiBase(mode: AnalysisMode) {
  return mode === "attire" ? ATTIRE_API_BASE : LOSTFOUND_API_BASE;
}

function getDeleteUrl(mode: AnalysisMode, videoId: string) {
  const API_BASE = getApiBase(mode);
  return mode === "attire"
    ? `${API_BASE}/api/offline/videos/${encodeURIComponent(videoId)}`
    : `${API_BASE}/api/offline/video/${encodeURIComponent(videoId)}`;
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function describeUploadError(err: any, apiBase: string) {
  const raw = String(err?.message || err || "Unknown upload error");

  if (
    raw.includes("Failed to fetch") ||
    raw.includes("NetworkError") ||
    raw.includes("Load failed")
  ) {
    return `Upload request failed to ${apiBase}. The Lost & Found backend is reachable only intermittently or the Cloudflare tunnel/public URL is unstable. Please check that the backend is running and the tunnel URL is still active.`;
  }

  if (raw.toLowerCase().includes("timeout") || raw.toLowerCase().includes("aborted")) {
    return `Upload timed out while sending the video to ${apiBase}. This usually happens when the tunnel is slow or the video file is large. Try a smaller file first, or restart the backend/tunnel and try again.`;
  }

  return raw;
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = 120000
): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timer);
  }
}

async function uploadToBackend(file: File, mode: AnalysisMode) {
  const API_BASE = getApiBase(mode);
  const url = `${API_BASE}/api/offline/upload`;

  console.log("[UPLOAD] mode =", mode);
  console.log("[UPLOAD] API_BASE =", API_BASE);
  console.log("[UPLOAD] URL =", url);
  console.log("[UPLOAD] file =", {
    name: file.name,
    size: file.size,
    type: file.type,
  });

  const form = new FormData();
  form.append("file", file);

  let lastError: any = null;

  for (let attempt = 1; attempt <= (mode === "lost-found" ? 2 : 1); attempt++) {
    try {
      const res = await fetchWithTimeout(
        url,
        {
          method: "POST",
          body: form,
        },
        mode === "lost-found" ? 180000 : 120000
      );

      const text = await res.text();

      console.log("[UPLOAD] attempt =", attempt);
      console.log("[UPLOAD] status =", res.status);
      console.log("[UPLOAD] body =", text);

      if (!res.ok) {
        let detail = text;

        try {
          const parsed = JSON.parse(text);
          detail = parsed?.detail || parsed?.message || text;
        } catch {
          // keep original text
        }

        throw new Error(`Upload failed: ${res.status} ${detail}`);
      }

      try {
        const json = JSON.parse(text);
        console.log("[UPLOAD] parsed json =", json);
        return json;
      } catch {
        throw new Error(`Backend returned non-JSON response: ${text}`);
      }
    } catch (err: any) {
      lastError = err;
      console.error("[UPLOAD] fetch/upload error:", err);

      const aborted = err?.name === "AbortError";
      const transient =
        aborted ||
        String(err?.message || "").includes("Failed to fetch") ||
        String(err?.message || "").includes("NetworkError") ||
        String(err?.message || "").includes("Load failed");

      if (attempt < (mode === "lost-found" ? 2 : 1) && transient) {
        await sleep(1200);
        continue;
      }

      throw new Error(describeUploadError(err, API_BASE));
    }
  }

  throw new Error(describeUploadError(lastError, API_BASE));
}

async function fetchAttireEnabledSources(): Promise<Record<string, boolean>> {
  const res = await fetch(`${ATTIRE_API_BASE}/api/attire/sources`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load attire enabled sources");
  const data = await res.json();
  return (data?.sources || {}) as Record<string, boolean>;
}

async function fetchAttireOfflineVideos(): Promise<Array<{ id: string; name: string }>> {
  const res = await fetch(`${ATTIRE_API_BASE}/api/offline/videos`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load attire offline videos");
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

async function fetchAttireRtspSources(): Promise<Array<{ id: string; name: string }>> {
  const res = await fetch(`${ATTIRE_API_BASE}/api/rtsp/sources`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load attire RTSP sources");
  const data = await res.json();
  return Array.isArray(data?.sources) ? data.sources : [];
}

async function setAttireSourceEnabled(sourceId: string, enabled: boolean) {
  const res = await fetch(`${ATTIRE_API_BASE}/api/attire/sources/${encodeURIComponent(sourceId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.detail || `HTTP ${res.status}`);
  return data;
}

async function openAttireOfflineInLive(videoId: string) {
  const showWebcam = localStorage.getItem("attire:showWebcam") === "1";
  const MAX_LIVE = 4;
  const slots = showWebcam ? (MAX_LIVE - 1) : MAX_LIVE;

  const [enabledMap, offlineVideos, rtspSources] = await Promise.all([
    fetchAttireEnabledSources(),
    fetchAttireOfflineVideos(),
    fetchAttireRtspSources(),
  ]);

  const offlineIds = offlineVideos.map((v) => v.id);
  const rtspIds = rtspSources.map((s) => s.id);
  const allIds = [...offlineIds, ...rtspIds];

  const isEnabled = (id: string) => enabledMap[id] ?? true;

  const currentlyEnabled = allIds.filter((id) => isEnabled(id));

  const orderedEnabled = [
    videoId,
    ...currentlyEnabled.filter((id) => id !== videoId),
  ];

  const keep = orderedEnabled.slice(0, slots);
  const disable = orderedEnabled.slice(slots);

  if (!isEnabled(videoId)) {
    await setAttireSourceEnabled(videoId, true);
  }

  await Promise.allSettled(
    disable.map((id) => setAttireSourceEnabled(id, false))
  );

  localStorage.setItem("attire:liveVideoId", videoId);
  localStorage.setItem("nav:lastPage", "live-attire");
  localStorage.setItem("attire:enabledSourcesVer", String(Date.now()));

  window.dispatchEvent(new Event("attire:sourcesChanged"));
  window.dispatchEvent(new Event("storage"));
}

export function UploadVideoPage({
  onProcessingComplete,
  onOpenLostFoundSettings,
}: UploadVideoPageProps) {
  const nav = useNavigate();
  const loc = useLocation();
  const pollRef = useRef<number | null>(null);

  const MODE_STORAGE_KEY = "upload:offlineMode";
  const [mode, setMode] = useState<AnalysisMode>(() => {
    const saved = localStorage.getItem(MODE_STORAGE_KEY);
    return saved === "lost-found" || saved === "attire" ? saved : "attire";
  });

  const [dragActive, setDragActive] = useState(false);
  const [uploadedVideos, setUploadedVideos] = useState<UploadedVideo[]>([]);

  const focusId = useMemo(() => {
    const q = new URLSearchParams(loc.search);
    return (q.get("focus") || "").trim();
  }, [loc.search]);

  const openLostFoundSettings = (stem: string) => {
    const cleanStem = String(stem || "").trim();
    if (!cleanStem) return;

    if (onOpenLostFoundSettings) {
      onOpenLostFoundSettings(cleanStem);
      return;
    }

    nav(`/lostfound/settings?offline=${encodeURIComponent(cleanStem)}`);
  };

  useEffect(() => {
    localStorage.setItem(MODE_STORAGE_KEY, mode);
  }, [mode]);

  const totalSizeLabel = useMemo(() => {
    const totalMB = uploadedVideos.reduce((sum, v) => {
      const m = String(v.size).match(/([\d.]+)\s*MB/i);
      return sum + (m ? parseFloat(m[1]) : 0);
    }, 0);
    return `${Math.round(totalMB)} MB`;
  }, [uploadedVideos]);

  const processingCount = uploadedVideos.filter(
    (v) =>
      v.status === "processing" ||
      v.status === "queued" ||
      v.analysis_status === "processing" ||
      v.analysis_status === "queued"
  ).length;

  const readyCount = uploadedVideos.filter((v) => v.status === "ready").length;

  const normalizeVideos = (targetMode: AnalysisMode, raw: any): UploadedVideo[] => {
    const items = Array.isArray(raw) ? raw : Array.isArray(raw?.videos) ? raw.videos : [];

    return items.map((x: any) => {
      let uploadDate: Date;

      if (typeof x.uploadDate === "number") {
        uploadDate = new Date(x.uploadDate * 1000);
      } else {
        uploadDate = new Date(x.uploadDate ?? Date.now());
      }

      return {
        id: String(x.id ?? ""),
        name: String(x.name ?? ""),
        size: String(x.size ?? "0 MB"),
        duration: String(x.duration ?? "00:00:00"),
        uploadDate,
        status: (x.status as VideoStatus) ?? "processing",
        backendPath: x.path ?? x.backendPath,

        error: x.error ?? null,
        h264_ready: !!x.h264_ready,
        h264_name: x.h264_name ?? undefined,
        roi_ready: !!x.roi_ready,
        analysis_status: (x.analysis_status as AnalysisStatus) ?? null,
        analysis_error: x.analysis_error ?? null,
        is_analyzing: !!x.is_analyzing,
      };
    });
  };

  const refreshVideos = async (targetMode: AnalysisMode = mode) => {
    try {
      const API_BASE = getApiBase(targetMode);
      const url = `${API_BASE}/api/offline/videos`;

      console.log("[REFRESH] mode =", targetMode);
      console.log("[REFRESH] API_BASE =", API_BASE);
      console.log("[REFRESH] URL =", url);

      const res = await fetchWithTimeout(
        url,
        { cache: "no-store" },
        targetMode === "lost-found" ? 30000 : 20000
      );

      console.log("[REFRESH] status =", res.status);

      if (!res.ok) throw new Error("Failed to load videos");

      const data = await res.json();
      console.log("[REFRESH] body =", data);

      setUploadedVideos(normalizeVideos(targetMode, data));
    } catch (err) {
      console.error("[REFRESH] error =", err);
      setUploadedVideos([]);
    }
  };

  useEffect(() => {
    let cancelled = false;

    setUploadedVideos([]);

    const run = async () => {
      try {
        const API_BASE = getApiBase(mode);
        const res = await fetchWithTimeout(
          `${API_BASE}/api/offline/videos`,
          { cache: "no-store" },
          mode === "lost-found" ? 30000 : 20000
        );

        if (!res.ok) throw new Error("Failed to load videos");

        const data = await res.json();
        if (!cancelled) {
          setUploadedVideos(normalizeVideos(mode, data));
        }
      } catch (err) {
        console.error("[REFRESH] error =", err);
        if (!cancelled) setUploadedVideos([]);
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [mode]);

  useEffect(() => {
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }

    const hasProcessing = uploadedVideos.some(
      (v) =>
        v.status === "processing" ||
        v.status === "queued" ||
        v.analysis_status === "processing" ||
        v.analysis_status === "queued"
    );

    if (!hasProcessing) return;

    pollRef.current = window.setInterval(() => {
      refreshVideos(mode);
    }, mode === "lost-found" ? 1500 : 15000);

    return () => {
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [uploadedVideos, mode]);

  const isValidVideoFile = (file: File) => {
    const okMime = file.type.startsWith("video/");
    const okExt = /\.(mp4|avi|mov|mkv)$/i.test(file.name);
    return okMime || okExt;
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
    if (e.type === "dragleave") setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      handleFiles(e.target.files);
    }

    e.currentTarget.value = "";
  };

  const handleFiles = async (files: FileList) => {
    const uploadMode = mode;
    const file = files[0];
    if (!file) return;

    if (!isValidVideoFile(file)) {
      alert("Invalid format. Please upload MP4, AVI, MOV, or MKV video.");
      return;
    }

    const tempId = `vid-${Date.now()}`;

    setUploadedVideos((prev) => [
      {
        id: tempId,
        name: file.name,
        size: `${(file.size / (1024 * 1024)).toFixed(0)} MB`,
        duration: "00:00:00",
        uploadDate: new Date(),
        status: "processing",
        roi_ready: false,
        h264_ready: false,
        analysis_status: null,
        is_analyzing: false,
        error: null,
      },
      ...prev,
    ]);

    try {
      const saved = await uploadToBackend(file, uploadMode);

      setUploadedVideos((prev) =>
        prev.map((v) =>
          v.id === tempId
            ? {
                ...v,
                id: saved.id ?? v.id,
                name: saved.name ?? file.name,
                status: saved.status ?? "ready",
                backendPath: saved.path,
                h264_ready: saved.h264_ready ?? v.h264_ready,
                roi_ready: saved.roi_ready ?? v.roi_ready,
                analysis_status: saved.analysis_status ?? v.analysis_status,
                is_analyzing: saved.is_analyzing ?? v.is_analyzing,
                error: null,
              }
            : v
        )
      );

      await refreshVideos(uploadMode);

      if (uploadMode === "lost-found") {
        const stem = String(saved?.id || "").trim();
        if (stem) {
          openLostFoundSettings(stem);
        }
      }

      onProcessingComplete?.();
    } catch (e: any) {
      console.error(e);

      const msg = String(e?.message || e || "Upload failed");

      setUploadedVideos((prev) =>
        prev.map((v) =>
          v.id === tempId
            ? {
                ...v,
                status: "failed",
                error: msg,
              }
            : v
        )
      );

      alert(`Upload failed: ${msg}`);
    }
  };

  const handleDelete = async (videoId: string) => {
    const deleteMode = mode;

    try {
      const url = getDeleteUrl(deleteMode, videoId);

      console.log("[DELETE] mode =", deleteMode);
      console.log("[DELETE] url =", url);

      if (deleteMode === "lost-found") {
        const ok = window.confirm(`Delete ${videoId}? This will remove file + manifest + outputs.`);
        if (!ok) return;
      }

      const res = await fetch(url, {
        method: "DELETE",
      });

      const text = await res.text();
      console.log("[DELETE] status:", res.status, "body:", text);

      if (!res.ok) {
        throw new Error(`Delete failed: ${res.status} ${text}`);
      }
    } catch (e) {
      console.warn("Backend delete failed", e);
      alert(`Delete failed: ${String(e)}`);
    }

    await refreshVideos(deleteMode);
  };

  const handleAnalyze = async (video: UploadedVideo) => {
    if (mode !== "lost-found") return;

    if (!video.h264_ready || !video.roi_ready || video.status !== "ready") {
      openLostFoundSettings(video.id);
      return;
    }

    if (
      video.is_analyzing ||
      video.analysis_status === "processing" ||
      video.analysis_status === "queued"
    ) {
      return;
    }

    try {
      const r = await fetch(`${LOSTFOUND_API_BASE}/api/offline/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: video.id }),
      });

      const raw = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(raw?.detail || "Analyze failed");

      await refreshVideos("lost-found");
      onProcessingComplete?.();
    } catch (e: any) {
      alert(String(e?.message || e || "Analyze error"));
      await refreshVideos("lost-found");
    }
  };

  const getStatusBadge = (status: VideoStatus) => {
    switch (status) {
      case "ready":
        return (
          <div className="flex items-center gap-1.5 text-green-400 bg-green-400/10 px-2 py-1 rounded text-xs">
            <CheckCircle className="w-3 h-3" />
            <span>Ready</span>
          </div>
        );
      case "processing":
        return (
          <div className="flex items-center gap-1.5 text-yellow-400 bg-yellow-400/10 px-2 py-1 rounded text-xs">
            <div className="w-3 h-3 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
            <span>Processing</span>
          </div>
        );
      case "queued":
        return (
          <div className="flex items-center gap-1.5 text-blue-300 bg-blue-400/10 px-2 py-1 rounded text-xs">
            <span>Queued</span>
          </div>
        );
      case "failed":
        return (
          <div className="flex items-center gap-1.5 text-red-400 bg-red-400/10 px-2 py-1 rounded text-xs">
            <AlertCircle className="w-3 h-3" />
            <span>Failed</span>
          </div>
        );
    }
  };

  const getAnalysisBadge = (a: AnalysisStatus) => {
    if (!a) return null;

    if (a === "processing" || a === "queued") {
      return (
        <div className="flex items-center gap-1.5 text-blue-300 bg-blue-400/10 px-2 py-1 rounded text-xs">
          <div className="w-3 h-3 border-2 border-blue-300 border-t-transparent rounded-full animate-spin" />
          <span>{a === "queued" ? "Queued" : "Analyzing"}</span>
        </div>
      );
    }

    if (a === "done") {
      return (
        <div className="flex items-center gap-1.5 text-green-300 bg-green-400/10 px-2 py-1 rounded text-xs">
          <CheckCircle className="w-3 h-3" />
          <span>Done</span>
        </div>
      );
    }

    if (a === "failed") {
      return (
        <div className="flex items-center gap-1.5 text-red-300 bg-red-500/10 px-2 py-1 rounded text-xs">
          <AlertCircle className="w-3 h-3" />
          <span>Analysis Failed</span>
        </div>
      );
    }

    return null;
  };

  return (
    <main className="flex-1 p-6 overflow-y-auto">
      <div className="mb-6">
        <h2 className="text-white mb-1">Upload Video</h2>
        <p className="text-slate-400">Upload offline CCTV footage for analysis</p>
      </div>

      <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4 mb-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="text-white">Offline Processing Mode</div>
            <div className="text-slate-400 text-sm">
              Choose which module to use for offline upload and analysis.
            </div>
          </div>

          <div className="flex items-center gap-2 bg-slate-800/30 p-1 rounded-lg w-fit">
            <button
              onClick={() => setMode("lost-found")}
              className={`px-5 py-2 rounded-md transition-colors ${
                mode === "lost-found" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"
              }`}
            >
              Lost &amp; Found
            </button>
            <button
              onClick={() => setMode("attire")}
              className={`px-5 py-2 rounded-md transition-colors ${
                mode === "attire" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"
              }`}
            >
              Attire Compliance
            </button>
          </div>
        </div>
      </div>

      <div
        className={`border-2 border-dashed rounded-lg p-12 mb-6 transition-colors ${
          dragActive ? "border-blue-500 bg-blue-500/5" : "border-slate-700 bg-slate-900/30 hover:border-slate-600"
        }`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <div className="text-center">
          <div className="w-16 h-16 bg-blue-600/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <Upload className="w-8 h-8 text-blue-400" />
          </div>

          <h3 className="text-white mb-2">
            {mode === "lost-found" ? "Drop video file here" : "Drop video files here"}
          </h3>

          <p className="text-slate-400 mb-4">
            {mode === "lost-found"
              ? "After upload, you may continue to ROI setup and analysis."
              : "Upload offline CCTV footage for attire analysis."}
          </p>

          <label className="inline-block">
            <input
              type="file"
              className="hidden"
              accept="video/*"
              onChange={handleChange}
              multiple={mode === "attire"}
            />
            <span className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg cursor-pointer transition-colors">
              <Upload className="w-4 h-4" />
              {mode === "lost-found" ? "Select File" : "Select Files"}
            </span>
          </label>

          <div className="mt-4 text-sm text-slate-500">Supported: MP4, AVI, MOV, MKV</div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4">
          <div className="text-slate-400 text-sm mb-1">Total Uploaded</div>
          <div className="text-white text-2xl">{uploadedVideos.length}</div>
        </div>
        <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4">
          <div className="text-slate-400 text-sm mb-1">Processing</div>
          <div className="text-yellow-400 text-2xl">{processingCount}</div>
        </div>
        <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4">
          <div className="text-slate-400 text-sm mb-1">Ready</div>
          <div className="text-green-400 text-2xl">{readyCount}</div>
        </div>
        <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4">
          <div className="text-slate-400 text-sm mb-1">Total Size</div>
          <div className="text-white text-2xl">{totalSizeLabel}</div>
        </div>
      </div>

      <div className="bg-slate-900/50 border border-slate-800 rounded-lg">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <h3 className="text-white">
            {mode === "lost-found" ? "Uploaded Videos (offline only)" : "Uploaded Videos"}
          </h3>
          <div className="text-slate-400 text-sm">
            Current module:{" "}
            <span className="text-white font-medium">
              {mode === "lost-found" ? "Lost & Found" : "Attire Compliance"}
            </span>
          </div>
        </div>

        <div className="divide-y divide-slate-800">
          {uploadedVideos.length === 0 ? (
            <div className="p-12 text-center">
              <FileVideo className="w-12 h-12 text-slate-700 mx-auto mb-3" />
              <p className="text-slate-500">No videos uploaded yet</p>
            </div>
          ) : (
            uploadedVideos.map((video) => {
              const analyzing =
                video.is_analyzing ||
                video.analysis_status === "processing" ||
                video.analysis_status === "queued";

              const canAnalyze =
                mode === "lost-found" &&
                video.status === "ready" &&
                !!video.h264_ready &&
                !!video.roi_ready &&
                !analyzing;

              return (
                <div
                  key={video.id}
                  className={`p-4 hover:bg-slate-800/30 transition-colors ${
                    focusId === video.id ? "bg-blue-500/5" : ""
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-24 h-16 bg-slate-800 rounded flex items-center justify-center flex-shrink-0">
                      <FileVideo className="w-8 h-8 text-slate-600" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2 flex-wrap">
                        <h4 className="text-white truncate">{video.name}</h4>
                        {getStatusBadge(video.status)}
                        {mode === "lost-found" && getAnalysisBadge(video.analysis_status)}
                        {mode === "lost-found" && (
                          <div className="text-xs text-slate-400">
                            ROI:{" "}
                            <span className={video.roi_ready ? "text-green-300" : "text-yellow-300"}>
                              {video.roi_ready ? "Saved" : "Not Set"}
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-4 text-sm text-slate-400">
                        <span>{video.size}</span>
                        <span>•</span>
                        <span>{video.duration}</span>
                        <span>•</span>
                        <span>{video.uploadDate.toLocaleString()}</span>
                      </div>

                      {mode === "lost-found" && video.status === "failed" && video.error && (
                        <div className="mt-2 text-xs text-red-300 bg-red-500/10 border border-red-500/20 px-3 py-2 rounded">
                          {video.error}
                        </div>
                      )}

                      {mode === "lost-found" &&
                        video.analysis_status === "failed" &&
                        video.analysis_error && (
                          <div className="mt-2 text-xs text-red-300 bg-red-500/10 border border-red-500/20 px-3 py-2 rounded">
                            Analysis error: {video.analysis_error}
                          </div>
                        )}
                    </div>

                    <div className="flex items-center gap-2">
                      {mode === "lost-found" && !video.roi_ready && (
                        <button
                          onClick={() => openLostFoundSettings(video.id)}
                          className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg transition-colors"
                          title="Draw ROI first"
                        >
                          Set ROI
                        </button>
                      )}

                      {mode === "lost-found" ? (
                        <button
                          onClick={() => handleAnalyze(video)}
                          disabled={!canAnalyze}
                          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors disabled:opacity-60"
                          title={
                            canAnalyze
                              ? "Analyze"
                              : analyzing
                              ? "Analysis already running"
                              : !video.h264_ready
                              ? "Wait for processing to finish"
                              : "ROI must be saved first"
                          }
                        >
                          <Play className="w-4 h-4" />
                          <span>{analyzing ? "Analyzing..." : "Analyze"}</span>
                        </button>
                      ) : (
                        video.status === "ready" && (
                          <button
                            onClick={async () => {
                              try {
                                await openAttireOfflineInLive(video.id);
                              } catch (e: any) {
                                alert(`Failed to open in live view: ${e?.message || e}`);
                              }
                            }}
                            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
                          >
                            <Play className="w-4 h-4" />
                            <span>Open Live</span>
                          </button>
                        )
                      )}

                      <button
                        onClick={() => handleDelete(video.id)}
                        className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition-colors"
                        title="Delete video"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </main>
  );
}
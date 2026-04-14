// src/components/LostAndFoundSettingsPage.tsx
// ✅ FULL SETTINGS PAGE (Dark Navy theme)
// - Supports BOTH Live + Offline modes
// - ROI drawing for Normal + Fisheye (8 views, Group A/B)
// - Notifications toggle (global) + sound toggle
// - RTSP Sources Management (CRUD + enabled toggle)
// - ✅ Upload-folder Live Sources list comes from backend scan:
//     GET  /api/lostfound/upload_sources  -> { sources: [{id,name,filename,enabled,video_type,is_fisheye,views_count}] }
//     POST /api/lostfound/cameras_enabled/toggle/:camId body: { enabled: boolean }
// - Live dropdown shows ALL live sources = uploadSources + rtspSources
// - ✅ NEW TAB: Dewarp (per-camera fisheye yaw/pitch/fov/rotate edit)
//     GET  /api/lostfound/fisheye_configs/:camId
//     POST /api/lostfound/fisheye_configs/:camId   body: { configs: [...] }
//     POST /api/lostfound/fisheye_configs/:camId/reset
// - ✅ Dewarp preview
//     GET /api/lostfound/fisheye_preview/:camId/:viewIdx
// - ✅ Debounced auto-apply while editing dewarp params
//
// ✅ IMPORTANT FIX
// - Uses ONE source-type decision flow only
// - No longer guesses fisheye from cam.views length
// - No longer lets old fisheye state contaminate normal sources
// - Live + Offline both use metadata-only source typing

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { LOSTFOUND_API_BASE } from "../api/base";
import {
  Settings,
  Shapes,
  Bell,
  Trash2,
  RefreshCw,
  Save,
  PlayCircle,
  Video,
  Cctv,
  CheckCircle2,
  XCircle,
  Undo2,
  Eraser,
  MousePointerClick,
  Info,
  Plus,
  Pencil,
  Link2,
  Power,
  PowerOff,
  Folder,
  Eye,
} from "lucide-react";

const API_BASE = LOSTFOUND_API_BASE;

type Mode = "live" | "offline";

type CameraView = {
  id: string;
  name: string;
  videoUrl?: string;
  filename?: string;
  order?: number;
};

type CameraItem = {
  id: string;
  name: string;
  groupId?: string;
  classroomId?: string;
  location?: string;
  status?: string;
  recording?: boolean;
  videoUrl?: string;
  filename?: string;
  views?: CameraView[];
};

type OfflineVideoItem = {
  id: string;
  name: string;
  size?: string;
  uploadDate?: number;
  status?: string;
  h264_ready?: boolean;
  h264Url?: string | null;
  originalUrl?: string;
  duration?: string;
  video_type?: "fisheye" | "normal";
  is_fisheye?: boolean;
  views_count?: number;
  roi_ready?: boolean;
  analysis_status?: string | null;
  analysis_error?: string | null;
  is_analyzing?: boolean;
};

type LFSettings = {
  notifications_enabled: boolean;
  notifications_sound_enabled?: boolean;
  data_retention_enabled?: boolean;
  data_retention_days?: number;
  cameras_enabled?: Record<string, boolean>;
};

type XY = { x: number; y: number };

type RoiObj = {
  bounding_polygons: { x: number; y: number }[][];
  fisheye_polygons:
    | Record<string, { x: number; y: number }[][]>
    | Record<"A" | "B", Record<string, { x: number; y: number }[][]>>;
};

type VideoType = "fisheye" | "normal";

function normalizeVideoType(v: any): VideoType | undefined {
  return v === "fisheye" || v === "normal" ? v : undefined;
}

const FISHEYE_GROUPS: { A: string[]; B: string[] } = {
  A: ["middle_row", "front_right_row", "front_left_row", "front_corridor"],
  B: ["back_right_row", "back_left_row", "back_corridor", "entrance"],
};

const FISHEYE_ORDER = [...FISHEYE_GROUPS.A, ...FISHEYE_GROUPS.B];

const FISHEYE_VIEW_ID_TO_NAME: Record<number, string> = {
  0: "middle_row",
  1: "front_right_row",
  2: "front_left_row",
  3: "front_corridor",
  4: "back_right_row",
  5: "back_left_row",
  6: "back_corridor",
  7: "entrance",
};

const FISHEYE_NAME_TO_VIEW_ID: Record<string, number> = Object.fromEntries(
  Object.entries(FISHEYE_VIEW_ID_TO_NAME).map(([k, v]) => [v, Number(k)])
);

const GROUP_A_VIEW_IDS = [0, 1, 2, 3];
const GROUP_B_VIEW_IDS = [4, 5, 6, 7];

type FisheyeViewCfg = {
  view_id: number;
  name: string;
  yaw: number;
  pitch: number;
  fov: number;
  rotate: number;
};

const PAGE_BG = "bg-[#0b1120]";
const TOP_BG = "bg-[#0b1120]/90";
const CARD_BG = "bg-[#0f172a]";
const BORDER = "border-slate-800";
const MUTED = "text-slate-300";
const MUTED2 = "text-slate-400";
const TEXT = "text-white";

const selectCls =
  "mt-1 w-full px-3 py-2 rounded-xl border border-slate-700 bg-slate-900/60 text-slate-100 " +
  "focus:outline-none focus:ring-2 focus:ring-emerald-600/40";

const inputCls =
  "mt-1 w-full px-3 py-2 rounded-xl border border-slate-700 bg-slate-900/60 text-slate-100 " +
  "focus:outline-none focus:ring-2 focus:ring-blue-600/40";

const softBtn =
  "px-3 py-2 rounded-xl border border-slate-700 bg-slate-900/50 hover:bg-slate-800/60 " +
  "text-slate-100 text-sm flex items-center gap-2";

const primaryBtn =
  "px-3 py-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-60 " +
  "text-sm flex items-center gap-2";

const greenBtn =
  "px-3 py-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60 " +
  "text-sm flex items-center gap-2";

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function prettyViewName(v: string) {
  return v.replaceAll("_", " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

function sanitizeNum(v: number, fallback: number) {
  return Number.isFinite(v) ? v : fallback;
}

function getViewNameById(viewId: number) {
  return FISHEYE_VIEW_ID_TO_NAME[viewId] || `view_${viewId}`;
}

function getGroupByViewId(viewId: number): "A" | "B" {
  return GROUP_A_VIEW_IDS.includes(viewId) ? "A" : "B";
}

function getFirstViewIdOfGroup(group: "A" | "B") {
  return group === "A" ? 0 : 4;
}

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function apiPost<T>(path: string, body: any): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function apiDelete<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "DELETE",
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function useImageNaturalSize(src: string | null) {
  const [size, setSize] = useState<{ w: number; h: number }>({
    w: 640,
    h: 480,
  });

  useEffect(() => {
    if (!src) return;
    const img = new Image();
    img.onload = () =>
      setSize({
        w: (img as any).naturalWidth || 640,
        h: (img as any).naturalHeight || 480,
      });
    img.src = src;
  }, [src]);

  return size;
}

function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

function polygonsEqualApprox(
  a: { x: number; y: number }[],
  b: { x: number; y: number }[],
  tol = 2
) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;

  const toPts = (p: { x: number; y: number }[]) =>
    p.map((q) => ({ x: Number(q.x), y: Number(q.y) }));
  const pa = toPts(a);
  const pb = toPts(b);

  const minIdx = (p: { x: number; y: number }[]) => {
    let mi = 0;
    for (let i = 1; i < p.length; i++) {
      const A = p[i];
      const M = p[mi];
      if (A.x < M.x || (A.x === M.x && A.y < M.y)) mi = i;
    }
    return mi;
  };

  const rot = (p: { x: number; y: number }[], start: number) =>
    p.slice(start).concat(p.slice(0, start));

  const ra = rot(pa, minIdx(pa));
  const rb = rot(pb, minIdx(pb));

  for (let i = 0; i < ra.length; i++) {
    if (
      Math.abs(ra[i].x - rb[i].x) > tol ||
      Math.abs(ra[i].y - rb[i].y) > tol
    ) {
      return false;
    }
  }
  return true;
}

function ensureFlatFisheyePolys(
  obj: RoiObj["fisheye_polygons"]
): Record<string, { x: number; y: number }[][]> {
  if (!obj || typeof obj !== "object") return {};
  const anyObj: any = obj;

  const isGrouped = !!(anyObj.A || anyObj.B);
  if (!isGrouped) return anyObj as Record<string, { x: number; y: number }[][]>;

  const flat: Record<string, { x: number; y: number }[][]> = {};
  for (const g of ["A", "B"] as const) {
    const part = anyObj[g];
    if (!part || typeof part !== "object") continue;
    for (const k of Object.keys(part)) {
      const v = part[k];
      if (!Array.isArray(v)) continue;
      flat[k] = (flat[k] || []).concat(v as { x: number; y: number }[][]);
    }
  }
  return flat;
}

function normalizePolyPoints(
  poly: { x: number; y: number }[],
  W: number,
  H: number
): { x: number; y: number }[] {
  const pts = (poly || [])
    .map((p) => ({
      x: clamp(Number(p.x), 0, W),
      y: clamp(Number(p.y), 0, H),
    }))
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));

  const out: { x: number; y: number }[] = [];
  const eps2 = 1 * 1;
  for (const p of pts) {
    if (out.length === 0) out.push(p);
    else {
      const q = out[out.length - 1];
      const dx = p.x - q.x;
      const dy = p.y - q.y;
      if (dx * dx + dy * dy > eps2) out.push(p);
    }
  }

  if (out.length >= 2) {
    const a = out[0];
    const b = out[out.length - 1];
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    if (dx * dx + dy * dy <= eps2) out.pop();
  }
  return out;
}

type RoiCanvasProps = {
  imgUrl: string | null;
  canvasW: number;
  canvasH: number;
  polygons: { x: number; y: number }[][];
  activePolyIdx: number | null;
  draft: { x: number; y: number }[];
  onAddPoint: (pt: { x: number; y: number }) => void;
  onCloseDraft: () => void;
  onUndo: () => void;
  onClearDraft: () => void;
  onSelectPoly: (idx: number) => void;
  onDeletePoly: (idx: number) => void;
  onClearAll: () => void;
  hintTitle?: string;
  previewMaxWidth?: number;
};

function RoiCanvas(props: RoiCanvasProps) {
  const {
    imgUrl,
    canvasW,
    canvasH,
    polygons,
    activePolyIdx,
    draft,
    onAddPoint,
    onCloseDraft,
    onUndo,
    onClearDraft,
    onSelectPoly,
    onDeletePoly,
    onClearAll,
    hintTitle,
    previewMaxWidth = 420,
  } = props;

  const wrapRef = useRef<HTMLDivElement | null>(null);

  const handleClick = (e: React.MouseEvent) => {
    if (!wrapRef.current) return;

    const rect = wrapRef.current.getBoundingClientRect();
    const x = clamp(e.clientX - rect.left, 0, rect.width);
    const y = clamp(e.clientY - rect.top, 0, rect.height);

    const px = (x / rect.width) * canvasW;
    const py = (y / rect.height) * canvasH;

    onAddPoint({ x: px, y: py });
  };

  return (
    <div className="w-full">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div className={`flex items-center gap-2 text-sm ${MUTED2}`}>
          <MousePointerClick className="w-4 h-4" />
          <span>
            Click to add points • Close polygon when ready •{" "}
            {hintTitle ? hintTitle : "Green = saved, Yellow = draft"}
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button className={softBtn} onClick={onUndo} type="button">
            <Undo2 className="w-4 h-4" /> Undo
          </button>
          <button className={softBtn} onClick={onClearDraft} type="button">
            <Eraser className="w-4 h-4" /> Clear Draft
          </button>
          <button className={softBtn} onClick={onCloseDraft} type="button">
            <CheckCircle2 className="w-4 h-4" /> Close
          </button>
          <button
            className={
              "px-3 py-2 rounded-xl border border-rose-700/50 bg-rose-950/20 hover:bg-rose-950/35 " +
              "text-rose-200 text-sm flex items-center gap-2"
            }
            onClick={onClearAll}
            type="button"
          >
            <Trash2 className="w-4 h-4" /> Clear All
          </button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_360px] gap-4 items-start">
        <div
          className={`rounded-2xl border ${BORDER} ${CARD_BG} overflow-hidden shadow-sm`}
        >
          <div
            className={`p-3 border-b ${BORDER} flex items-center justify-between`}
          >
            <div
              className={`text-sm font-semibold ${TEXT} flex items-center gap-2`}
            >
              <Shapes className="w-4 h-4" />
              ROI Preview
            </div>
            <div className={`text-xs ${MUTED2}`}>
              Canvas: {Math.round(canvasW)}×{Math.round(canvasH)}
            </div>
          </div>

          <div className="p-3">
            <div className="w-full flex items-start justify-center">
              <div
                ref={wrapRef}
                className="relative rounded-xl overflow-hidden bg-slate-900/60 select-none"
                style={{
                  width: `min(100%, ${previewMaxWidth}px)`,
                  aspectRatio: `${canvasW} / ${canvasH}`,
                  maxHeight: "calc(100vh - 280px)",
                }}
                onClick={handleClick}
                title="Click to add points"
              >
                {imgUrl ? (
                  <img
                    src={imgUrl}
                    alt="ROI frame"
                    className="absolute inset-0 w-full h-full object-fill"
                    draggable={false}
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-sm">
                    No frame loaded
                  </div>
                )}

                <svg
                  viewBox={`0 0 ${canvasW} ${canvasH}`}
                  className="absolute inset-0 w-full h-full pointer-events-none"
                >
                  {polygons.map((poly, idx) => {
                    const pts = poly.map((p) => `${p.x},${p.y}`).join(" ");
                    const isActive = activePolyIdx === idx;

                    return (
                      <g key={`poly-${idx}`}>
                        <polygon
                          points={pts}
                          fill={
                            isActive
                              ? "rgba(34,197,94,0.20)"
                              : "rgba(34,197,94,0.10)"
                          }
                          stroke={
                            isActive
                              ? "rgba(34,197,94,1)"
                              : "rgba(34,197,94,0.85)"
                          }
                          strokeWidth={isActive ? 3 : 2}
                        />
                        {poly.map((p, i) => (
                          <circle
                            key={`pt-${idx}-${i}`}
                            cx={p.x}
                            cy={p.y}
                            r={3}
                            fill="rgba(34,197,94,1)"
                          />
                        ))}
                      </g>
                    );
                  })}

                  {draft.length > 0 && (
                    <g>
                      <polyline
                        points={draft.map((p) => `${p.x},${p.y}`).join(" ")}
                        fill="none"
                        stroke="rgba(234,179,8,1)"
                        strokeWidth={3}
                      />
                      {draft.map((p, i) => (
                        <circle
                          key={`draft-${i}`}
                          cx={p.x}
                          cy={p.y}
                          r={4}
                          fill="rgba(234,179,8,1)"
                        />
                      ))}
                    </g>
                  )}
                </svg>
              </div>
            </div>
          </div>
        </div>

        <div
          className={`rounded-2xl border ${BORDER} ${CARD_BG} shadow-sm overflow-hidden self-start`}
          style={{ maxHeight: "calc(100vh - 280px)" }}
        >
          <div
            className={`p-3 border-b ${BORDER} flex items-center justify-between`}
          >
            <div className={`text-sm font-semibold ${TEXT}`}>Polygons</div>
            <div className={`text-xs ${MUTED2}`}>{polygons.length} saved</div>
          </div>

          <div
            className="p-3 space-y-2 overflow-y-auto"
            style={{ maxHeight: "calc(100vh - 360px)" }}
          >
            {polygons.length === 0 ? (
              <div className={`text-sm ${MUTED2} flex items-start gap-2`}>
                <Info className="w-4 h-4 mt-[2px]" />
                Draw a polygon on the image, then click{" "}
                <b className="text-slate-100">Close</b>.
              </div>
            ) : (
              polygons.map((poly, idx) => (
                <div
                  key={`list-${idx}`}
                  className={
                    "p-2 rounded-xl border flex items-center justify-between gap-2 " +
                    (activePolyIdx === idx
                      ? "border-emerald-700 bg-emerald-900/15"
                      : "border-slate-700 bg-slate-900/30")
                  }
                >
                  <button
                    type="button"
                    className="text-left flex-1"
                    onClick={() => onSelectPoly(idx)}
                    title="Highlight polygon"
                  >
                    <div className="text-sm font-semibold text-slate-100">
                      Polygon #{idx + 1}
                    </div>
                    <div className="text-xs text-slate-400">
                      {poly.length} points
                    </div>
                  </button>

                  <button
                    type="button"
                    className="p-2 rounded-lg border border-rose-700/40 hover:bg-rose-950/30 text-rose-200"
                    onClick={() => onDeletePoly(idx)}
                    title="Delete polygon"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function makeId() {
  return `rtsp_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function isProbablyRtspUrl(u: string) {
  const s = (u || "").trim().toLowerCase();
  return (
    s.startsWith("rtsp://") ||
    s.startsWith("rtsps://") ||
    s.startsWith("http://") ||
    s.startsWith("https://")
  );
}

function detectIsFisheyeSource(args: {
  mode: Mode;
  src?: {
    video_type?: "fisheye" | "normal";
    is_fisheye?: boolean;
    views_count?: number;
  } | null;
  offline?: OfflineVideoItem | null;
}) {
  const { mode, src, offline } = args;

  if (mode === "offline") {
    if (offline?.video_type === "fisheye") return true;
    if (offline?.video_type === "normal") return false;
    if (offline?.is_fisheye === true) return true;
    if (offline?.is_fisheye === false) return false;
    if (Number(offline?.views_count || 0) >= 4) return true;
    return false;
  }

  if (src?.video_type === "fisheye") return true;
  if (src?.video_type === "normal") return false;
  if (src?.is_fisheye === true) return true;
  if (src?.is_fisheye === false) return false;
  if (Number(src?.views_count || 0) >= 4) return true;
  return false;
}

type UploadSource = {
  id: string;
  name: string;
  filename: string;
  enabled: boolean;
  video_type?: "fisheye" | "normal";
  is_fisheye?: boolean;
  views_count?: number;
};

type RtspSource = {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  video_type?: "fisheye" | "normal";
  is_fisheye?: boolean;
  views_count?: number;
};

interface LostAndFoundSettingsPageProps {
  offlineStem?: string | null;
}

export default function LostAndFoundSettingsPage({
  offlineStem: offlineStemProp,
}: LostAndFoundSettingsPageProps) {
  type Tab = "sources" | "roi" | "notifications" | "dewarp" | "retention";
  const [tab, setTab] = useState<Tab>("sources");

  const loc = useLocation();
  const q = new URLSearchParams(loc.search);

  const incomingOfflineStem =
    String(offlineStemProp || "").trim() ||
    String(localStorage.getItem("lostfound:offlineStem") || "").trim() ||
    String(q.get("offline") || "").trim();

  const [mode, setMode] = useState<Mode>(incomingOfflineStem ? "offline" : "live");

  const [cameras, setCameras] = useState<CameraItem[]>([]);
  const [offlineVideos, setOfflineVideos] = useState<OfflineVideoItem[]>([]);
  const [uploadSources, setUploadSources] = useState<UploadSource[]>([]);
  const [rtspSources, setRtspSources] = useState<RtspSource[]>([]);

  const [liveCamId, setLiveCamId] = useState<string>("");
  const [offlineStem, setOfflineStem] = useState<string>("");

  useEffect(() => {
    if (!incomingOfflineStem) return;

    setOfflineStem((prev) => {
      if (prev === incomingOfflineStem) return prev;
      return incomingOfflineStem;
    });

    setMode("offline");
  }, [incomingOfflineStem]);

  const [isFisheye, setIsFisheye] = useState<boolean>(false);

  const [group, setGroup] = useState<"A" | "B">("A");
  const [activeViewIdx, setActiveViewIdx] = useState<number>(0);
  const activeViewName = useMemo(
    () => getViewNameById(clamp(activeViewIdx, 0, 7)),
    [activeViewIdx]
  );

  const [frameUrl, setFrameUrl] = useState<string | null>(null);
  const [groupFrameUrl, setGroupFrameUrl] = useState<string | null>(null);
  const [freezeRefresh, setFreezeRefresh] = useState<number>(0);

  const natural = useImageNaturalSize(frameUrl);
  const canvasW = useMemo(() => natural.w || 640, [natural.w]);
  const canvasH = useMemo(() => natural.h || 480, [natural.h]);

  const [roi, setRoi] = useState<RoiObj>({
    bounding_polygons: [],
    fisheye_polygons: {},
  });

  const [draft, setDraft] = useState<{ x: number; y: number }[]>([]);
  const [activePolyIdx, setActivePolyIdx] = useState<number | null>(null);

  const [settings, setSettings] = useState<LFSettings>({
    notifications_enabled: true,
    notifications_sound_enabled: false,
    data_retention_enabled: true,
    data_retention_days: 90,
    cameras_enabled: {},
  });

  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const selectedId = mode === "live" ? liveCamId : offlineStem;

  const currentPolygons = useMemo(() => {
    if (!isFisheye) {
      return Array.isArray(roi.bounding_polygons) ? roi.bounding_polygons : [];
    }
    const flat = ensureFlatFisheyePolys(roi.fisheye_polygons as any);
    const list = flat[activeViewName] || [];
    return Array.isArray(list) ? list : [];
  }, [roi, isFisheye, activeViewName]);

  const [rtspForm, setRtspForm] = useState<{
    id: string | null;
    name: string;
    url: string;
    enabled: boolean;
  }>({
    id: null,
    name: "",
    url: "",
    enabled: true,
  });

  const [fisheyeCfg, setFisheyeCfg] = useState<FisheyeViewCfg[]>([]);
  const [fisheyeCfgLoading, setFisheyeCfgLoading] = useState(false);
  const [dewarpSelectedIdx, setDewarpSelectedIdx] = useState(0);
  const [dewarpPreviewUrl, setDewarpPreviewUrl] = useState<string | null>(null);
  const [dewarpPreviewTick, setDewarpPreviewTick] = useState(0);
  const [dewarpApplying, setDewarpApplying] = useState(false);
  const dewarpDebounceRef = useRef<number | null>(null);
  const skipNextAutoApplyRef = useRef<boolean>(false);
  const dewarpMountedRef = useRef<boolean>(false);

  const resetRtspForm = () =>
    setRtspForm({
      id: null,
      name: "",
      url: "",
      enabled: true,
    });

  const currentDewarpCamId = mode === "live" ? liveCamId : offlineStem;
  const dewarpSelectedViewName = useMemo(
    () => getViewNameById(clamp(dewarpSelectedIdx, 0, 7)),
    [dewarpSelectedIdx]
  );

  const loadRtspSources = async () => {
    try {
      const raw = await apiGet<any>("/api/rtsp");

      let list: any[] = [];

      if (Array.isArray(raw?.sources)) {
        list = raw.sources;
      } else if (Array.isArray(raw)) {
        list = raw;
      } else if (raw && typeof raw === "object") {
        list = Object.values(raw);
      }

      const mapped: RtspSource[] = list
        .map((s): RtspSource => ({
          id: String(s?.id || "").trim(),
          name: String(s?.name || s?.id || "").trim(),
          url: String(s?.url || ""),
          enabled: !!s?.enabled,
          video_type: normalizeVideoType(s?.video_type),
          is_fisheye:
            typeof s?.is_fisheye === "boolean" ? s.is_fisheye : undefined,
          views_count: Number.isFinite(Number(s?.views_count))
            ? Number(s.views_count)
            : undefined,
        }))
        .filter((s) => !!s.id);

      setRtspSources(mapped);
    } catch {
      setRtspSources((prev) => prev);
    }
  };

  const upsertRtspSource = async () => {
    const name = (rtspForm.name || "").trim();
    const url = (rtspForm.url || "").trim();

    if (!name) {
      setMsg({ type: "err", text: "RTSP name is required." });
      return;
    }
    if (!url || !isProbablyRtspUrl(url)) {
      setMsg({
        type: "err",
        text: "RTSP URL is invalid. Use rtsp:// (or http(s):// if your backend supports it).",
      });
      return;
    }

    const payload: RtspSource = {
      id: rtspForm.id || makeId(),
      name,
      url,
      enabled: !!rtspForm.enabled,
    };

    try {
      setSaving(true);
      setMsg(null);
      await apiPost("/api/lostfound/rtsp_sources", payload);
      await loadRtspSources();
      resetRtspForm();
      setMsg({ type: "ok", text: "RTSP source saved." });
    } catch (e: any) {
      setMsg({
        type: "err",
        text: `RTSP save failed: ${String(e?.message || e)}`,
      });
    } finally {
      setSaving(false);
    }
  };

  const deleteRtspSource = async (id: string) => {
    if (!id) return;
    try {
      setSaving(true);
      setMsg(null);
      await apiDelete(`/api/lostfound/rtsp_sources/${encodeURIComponent(id)}`);
      await loadRtspSources();
      if (rtspForm.id === id) resetRtspForm();
      setMsg({ type: "ok", text: "RTSP source deleted." });
    } catch (e: any) {
      setMsg({
        type: "err",
        text: `RTSP delete failed: ${String(e?.message || e)}`,
      });
    } finally {
      setSaving(false);
    }
  };

  const toggleRtspEnabled = async (id: string, enabled: boolean) => {
    try {
      setSaving(true);
      setMsg(null);
      await apiPost(`/api/rtsp/toggle/${encodeURIComponent(id)}`, { enabled });
      await loadRtspSources();
      setMsg({
        type: "ok",
        text: `RTSP source ${enabled ? "enabled" : "disabled"}.`,
      });
    } catch (e: any) {
      setMsg({ type: "err", text: `Toggle failed: ${String(e?.message || e)}` });
    } finally {
      setSaving(false);
    }
  };

  const loadUploadSources = async () => {
    try {
      const raw = await apiGet<any>("/api/lostfound/upload_sources");
      const list: any[] = Array.isArray(raw?.sources) ? raw.sources : [];

      const mapped: UploadSource[] = list
        .map((s): UploadSource => ({
          id: String(s?.id || "").trim(),
          name: String(s?.name || s?.id || "").trim(),
          filename: String(s?.filename || ""),
          enabled: !!s?.enabled,
          video_type: normalizeVideoType(s?.video_type),
          views_count: Number.isFinite(Number(s?.views_count))
            ? Number(s.views_count)
            : undefined,
          is_fisheye:
            typeof s?.is_fisheye === "boolean" ? s.is_fisheye : undefined,
        }))
        .filter((s) => !!s.id);

      setUploadSources(mapped);
    } catch {
      setUploadSources((p) => p);
    }
  };

  const toggleUploadCamEnabled = async (camId: string, enabled: boolean) => {
    try {
      setSaving(true);
      setMsg(null);

      await apiPost(
        `/api/lostfound/cameras_enabled/toggle/${encodeURIComponent(camId)}`,
        { enabled }
      );

      await loadUploadSources();

      setMsg({
        type: "ok",
        text: `Upload Live camera ${enabled ? "enabled" : "disabled"}.`,
      });
    } catch (e: any) {
      setMsg({
        type: "err",
        text: `Upload camera toggle failed: ${String(e?.message || e)}`,
      });
    } finally {
      setSaving(false);
    }
  };

  type LiveSourceRow = {
    id: string;
    name: string;
    kind: "upload" | "rtsp";
    enabled: boolean;
    subtitle?: string;
    video_type?: "fisheye" | "normal";
    is_fisheye?: boolean;
    views_count?: number;
  };

  const cameraMetaMap = useMemo(() => {
    const m = new Map<
      string,
      {
        video_type?: "fisheye" | "normal";
        is_fisheye?: boolean;
        views_count?: number;
      }
    >();

    for (const c of cameras || []) {
      const id = String((c as any)?.id || "").trim();
      if (!id) continue;

      const anyC = c as any;

      m.set(id, {
        video_type:
          anyC?.video_type === "fisheye"
            ? "fisheye"
            : anyC?.video_type === "normal"
            ? "normal"
            : undefined,
        is_fisheye:
          typeof anyC?.is_fisheye === "boolean" ? anyC.is_fisheye : undefined,
        views_count: Number.isFinite(Number(anyC?.views_count))
          ? Number(anyC.views_count)
          : undefined,
      });
    }

    return m;
  }, [cameras]);

  const liveSourcesAll = useMemo(() => {
    const up: LiveSourceRow[] = (uploadSources || []).map((u) => {
      const meta = cameraMetaMap.get(u.id);

      return {
        id: u.id,
        name: u.name || u.id,
        kind: "upload" as const,
        enabled: !!u.enabled,
        subtitle: u.filename ? `file: ${u.filename}` : undefined,
        video_type: u.video_type ?? meta?.video_type,
        is_fisheye:
          typeof u.is_fisheye === "boolean"
            ? u.is_fisheye
            : meta?.is_fisheye,
        views_count:
          Number.isFinite(Number(u.views_count))
            ? Number(u.views_count)
            : meta?.views_count,
      };
    });

    const rt: LiveSourceRow[] = (rtspSources || []).map((r) => {
      const meta = cameraMetaMap.get(r.id);

      return {
        id: r.id,
        name: r.name || r.id,
        kind: "rtsp" as const,
        enabled: !!r.enabled,
        subtitle: r.url ? `url: ${r.url}` : undefined,
        video_type: r.video_type ?? meta?.video_type,
        is_fisheye:
          typeof r.is_fisheye === "boolean"
            ? r.is_fisheye
            : meta?.is_fisheye,
        views_count:
          Number.isFinite(Number(r.views_count))
            ? Number(r.views_count)
            : meta?.views_count,
      };
    });

    return [...up, ...rt].sort((a, b) =>
      (a.name || a.id).localeCompare(b.name || b.id)
    );
  }, [uploadSources, rtspSources, cameraMetaMap]);

  const liveSourcesMergedForCards = useMemo(() => liveSourcesAll, [liveSourcesAll]);

  const refreshLiveSources = async () => {
    await Promise.all([loadUploadSources(), loadRtspSources()]);
  };

  function refreshFrozen() {
    setFreezeRefresh(1);
    setTimeout(() => setFreezeRefresh(0), 300);
  }

  function bumpDewarpPreview() {
    setDewarpPreviewTick((v) => v + 1);
  }

  function bumpAllViewRefresh() {
    refreshFrozen();
    bumpDewarpPreview();
  }

  async function loadFisheyeCfg(camId: string) {
    if (!camId) return;
    try {
      setFisheyeCfgLoading(true);
      const res = await apiGet<any>(
        `/api/lostfound/fisheye_configs/${encodeURIComponent(camId)}`
      );
      const list = Array.isArray(res?.configs) ? res.configs : [];

      const merged: FisheyeViewCfg[] = [...list]
        .map((r: any) => ({
          view_id: sanitizeNum(Number(r?.view_id), 0),
          name: String(r?.name || getViewNameById(Number(r?.view_id ?? 0))),
          yaw: sanitizeNum(Number(r?.yaw ?? 0), 0),
          pitch: sanitizeNum(Number(r?.pitch ?? 0), 0),
          fov: sanitizeNum(Number(r?.fov ?? 90), 90),
          rotate: sanitizeNum(Number(r?.rotate ?? 270), 270),
        }))
        .sort((a, b) => a.view_id - b.view_id);

      const full: FisheyeViewCfg[] = Array.from({ length: 8 }, (_, viewId) => {
        const found = merged.find((x) => x.view_id === viewId);
        return (
          found || {
            view_id: viewId,
            name: getViewNameById(viewId),
            yaw: 0,
            pitch: 0,
            fov: 90,
            rotate: 270,
          }
        );
      });

      skipNextAutoApplyRef.current = true;
      setFisheyeCfg(full);
      setDewarpSelectedIdx((prev) => clamp(prev, 0, 7));
      bumpDewarpPreview();
    } catch (e: any) {
      setMsg({
        type: "err",
        text: `Failed to load fisheye config: ${String(e?.message || e)}`,
      });
    } finally {
      setFisheyeCfgLoading(false);
    }
  }

  async function applyFisheyeCfg(
    camId: string,
    options?: { silent?: boolean; reloadAfter?: boolean }
  ) {
    if (!camId || fisheyeCfg.length === 0) return;

    const silent = !!options?.silent;
    const reloadAfter = !!options?.reloadAfter;

    try {
      setDewarpApplying(true);
      if (!silent) {
        setSaving(true);
        setMsg(null);
      }

      const payload = {
        configs: fisheyeCfg
          .slice()
          .sort((a, b) => a.view_id - b.view_id)
          .map((row) => ({
            view_id: row.view_id,
            name: String(row.name || getViewNameById(row.view_id)),
            yaw: sanitizeNum(Number(row.yaw), 0),
            pitch: sanitizeNum(Number(row.pitch), 0),
            fov: sanitizeNum(Number(row.fov), 90),
            rotate: sanitizeNum(Number(row.rotate), 270),
          })),
      };

      await apiPost(
        `/api/lostfound/fisheye_configs/${encodeURIComponent(camId)}`,
        payload
      );

      if (reloadAfter) {
        await loadFisheyeCfg(camId);
      } else {
        bumpAllViewRefresh();
      }

      if (!silent) {
        setMsg({ type: "ok", text: "Dewarp config saved & applied." });
      }
    } catch (e: any) {
      setMsg({
        type: "err",
        text: `Save dewarp failed: ${String(e?.message || e)}`,
      });
    } finally {
      setDewarpApplying(false);
      if (!silent) {
        setSaving(false);
      }
    }
  }

  async function resetFisheyeCfg(camId: string) {
    if (!camId) return;
    try {
      setSaving(true);
      setMsg(null);
      await apiPost(
        `/api/lostfound/fisheye_configs/${encodeURIComponent(camId)}/reset`,
        {}
      );
      setMsg({ type: "ok", text: "Dewarp config reset to default & applied." });
      await loadFisheyeCfg(camId);
      bumpAllViewRefresh();
    } catch (e: any) {
      setMsg({
        type: "err",
        text: `Reset dewarp failed: ${String(e?.message || e)}`,
      });
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);

        const [cams, vids] = await Promise.all([
          apiGet<CameraItem[]>("/api/lostfound/cameras_for_settings"),
          apiGet<{ videos: OfflineVideoItem[] }>("/api/offline/videos"),
        ]);

        const camsArr = Array.isArray(cams) ? cams : [];
        const vidsArr = Array.isArray(vids?.videos) ? vids.videos : [];

        setCameras(camsArr);
        setOfflineVideos(vidsArr);

        try {
          const st = await apiGet<LFSettings>("/api/lostfound/settings");
          setSettings((prev) => ({
            ...prev,
            notifications_enabled: !!(st as any)?.notifications_enabled,
            notifications_sound_enabled: !!(st as any)?.notifications_sound_enabled,
            data_retention_enabled:
              typeof (st as any)?.data_retention_enabled === "boolean"
                ? !!(st as any)?.data_retention_enabled
                : true,
            data_retention_days: clamp(
              Number((st as any)?.data_retention_days ?? 90) || 90,
              1,
              3650
            ),
            cameras_enabled:
              (st as any)?.cameras_enabled || prev.cameras_enabled || {},
          }));
        } catch {}

        await loadUploadSources();
        await loadRtspSources();

        if (!liveCamId) {
          if (camsArr.length) setLiveCamId(camsArr[0].id);
        }

        if (vidsArr.length) {
          if (incomingOfflineStem) {
            const matched = vidsArr.find((v) => v.id === incomingOfflineStem);
            if (matched) {
              setOfflineStem(incomingOfflineStem);
              setMode("offline");
            } else if (!offlineStem) {
              setOfflineStem(vidsArr[0].id);
            }
          } else if (!offlineStem) {
            setOfflineStem(vidsArr[0].id);
          }
        }
      } catch (e: any) {
        setMsg({
          type: "err",
          text: `Failed to load: ${String(e?.message || e)}`,
        });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!liveCamId && liveSourcesAll.length > 0) {
      setLiveCamId(liveSourcesAll[0].id);
    }
  }, [liveSourcesAll, liveCamId]);

  useEffect(() => {
    setDraft([]);
    setActivePolyIdx(null);
  }, [mode]);

  useEffect(() => {
    if (!selectedId) return;

    let fis = false;

    if (mode === "offline") {
      const rec = offlineVideos.find((v) => v.id === offlineStem) || null;
      fis = detectIsFisheyeSource({
        mode: "offline",
        src: null,
        offline: rec,
      });
    } else {
      const src = liveSourcesAll.find((s) => s.id === liveCamId) || null;
      fis = detectIsFisheyeSource({
        mode: "live",
        src,
        offline: null,
      });
    }

    setIsFisheye(fis);

    if (fis) {
      setActiveViewIdx((prev) => clamp(prev, 0, 7));
      setDewarpSelectedIdx((prev) => clamp(prev, 0, 7));
      setGroup((prev) => getGroupByViewId(prev === "A" ? 0 : 4));
    } else {
      setGroup("A");
      setActiveViewIdx(0);
      setDewarpSelectedIdx(0);
      setDraft([]);
      setActivePolyIdx(null);
      setFisheyeCfg([]);
      setDewarpPreviewUrl(null);
    }
  }, [mode, selectedId, liveCamId, offlineStem, offlineVideos, liveSourcesAll]);

  useEffect(() => {
    const camId = mode === "live" ? liveCamId : offlineStem;
    if (!camId) return;

    if (!isFisheye) {
      setFisheyeCfg([]);
      setDewarpPreviewUrl(null);
      return;
    }

    loadFisheyeCfg(camId);
  }, [mode, liveCamId, offlineStem, isFisheye]);

  useEffect(() => {
    if (!selectedId) return;
    (async () => {
      try {
        setLoading(true);
        setMsg(null);

        if (mode === "live") {
          const r = await apiGet<any>(
            `/api/live/roi/${encodeURIComponent(liveCamId)}`
          );
          setRoi({
            bounding_polygons: Array.isArray(r?.bounding_polygons)
              ? r.bounding_polygons
              : [],
            fisheye_polygons: r?.fisheye_polygons || {},
          });
        } else {
          const r = await apiGet<any>(
            `/api/offline/roi/${encodeURIComponent(offlineStem)}`
          );
          setRoi({
            bounding_polygons: Array.isArray(r?.bounding_polygons)
              ? r.bounding_polygons
              : [],
            fisheye_polygons: r?.fisheye_polygons || {},
          });
        }

        setDraft([]);
        setActivePolyIdx(null);
      } catch (e: any) {
        setMsg({
          type: "err",
          text: `Failed to load ROI: ${String(e?.message || e)}`,
        });
      } finally {
        setLoading(false);
      }
    })();
  }, [mode, liveCamId, offlineStem, selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    const t = Date.now();

    if (mode === "live") {
      const f = `${API_BASE}/api/settings/static/frame/${encodeURIComponent(
        liveCamId
      )}/${activeViewIdx}?refresh=${freezeRefresh}&t=${t}`;
      setFrameUrl(f);

      const g = `${API_BASE}/api/settings/static/group_frame/${encodeURIComponent(
        liveCamId
      )}/${group}?refresh=${freezeRefresh}&t=${t}`;
      setGroupFrameUrl(g);
      return;
    }

    const f = `${API_BASE}/api/offline/frame/${encodeURIComponent(
      offlineStem
    )}/${activeViewIdx}?t=${t}`;
    setFrameUrl(f);

    const g = `${API_BASE}/api/offline/group_frame/${encodeURIComponent(
      offlineStem
    )}/${group}?t=${t}`;
    setGroupFrameUrl(g);
  }, [mode, liveCamId, offlineStem, selectedId, activeViewIdx, group, freezeRefresh]);

  useEffect(() => {
    if (!isFisheye || !currentDewarpCamId || tab !== "dewarp") {
      setDewarpPreviewUrl(null);
      return;
    }

    const t = Date.now();
    setDewarpPreviewUrl(
      `${API_BASE}/api/lostfound/fisheye_preview/${encodeURIComponent(
        currentDewarpCamId
      )}/${dewarpSelectedIdx}?refresh=${dewarpPreviewTick}&t=${t}`
    );
  }, [isFisheye, currentDewarpCamId, dewarpSelectedIdx, dewarpPreviewTick, tab]);

  useEffect(() => {
    return () => {
      if (dewarpDebounceRef.current) {
        window.clearTimeout(dewarpDebounceRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (tab !== "dewarp") return;
    if (!isFisheye) return;
    if (!currentDewarpCamId) return;
    if (fisheyeCfg.length === 0) return;
    if (fisheyeCfgLoading) return;

    if (!dewarpMountedRef.current) {
      dewarpMountedRef.current = true;
      return;
    }

    if (skipNextAutoApplyRef.current) {
      skipNextAutoApplyRef.current = false;
      return;
    }

    if (dewarpDebounceRef.current) {
      window.clearTimeout(dewarpDebounceRef.current);
    }

    dewarpDebounceRef.current = window.setTimeout(async () => {
      await applyFisheyeCfg(currentDewarpCamId, {
        silent: true,
        reloadAfter: false,
      });
      bumpDewarpPreview();
    }, 500);

    return () => {
      if (dewarpDebounceRef.current) {
        window.clearTimeout(dewarpDebounceRef.current);
      }
    };
  }, [fisheyeCfg, tab, isFisheye, currentDewarpCamId, fisheyeCfgLoading]);

  function getCurrentViewPolys() {
    if (!isFisheye) {
      return Array.isArray(roi.bounding_polygons) ? roi.bounding_polygons : [];
    }
    const flat = ensureFlatFisheyePolys(roi.fisheye_polygons as any);
    return Array.isArray(flat[activeViewName]) ? flat[activeViewName] : [];
  }

  function setCurrentViewPolys(next: { x: number; y: number }[][]) {
    setRoi((prev) => {
      const out = deepClone(prev);
      if (!isFisheye) {
        out.bounding_polygons = next;
        out.fisheye_polygons = {};
        return out;
      }
      const flat = ensureFlatFisheyePolys(out.fisheye_polygons as any);
      flat[activeViewName] = next;

      for (let viewId = 0; viewId < 8; viewId++) {
        const nm = getViewNameById(viewId);
        if (!Array.isArray(flat[nm])) flat[nm] = [];
      }

      out.bounding_polygons = [];
      out.fisheye_polygons = flat;
      return out;
    });
  }

  function addPoint(pt: { x: number; y: number }) {
    setDraft((d) => [
      ...d,
      { x: clamp(pt.x, 0, canvasW), y: clamp(pt.y, 0, canvasH) },
    ]);
  }

  function undo() {
    setDraft((d) => {
      if (d.length > 0) return d.slice(0, -1);
      const cur = getCurrentViewPolys();
      if (cur.length === 0) return d;
      setCurrentViewPolys(cur.slice(0, -1));
      return d;
    });
    setActivePolyIdx(null);
  }

  function clearDraft() {
    setDraft([]);
  }

  function deletePoly(idx: number) {
    const cur = getCurrentViewPolys();
    if (idx < 0 || idx >= cur.length) return;
    const next = cur.slice(0, idx).concat(cur.slice(idx + 1));
    setCurrentViewPolys(next);
    if (activePolyIdx === idx) setActivePolyIdx(null);
  }

  function clearAll() {
    setDraft([]);
    setActivePolyIdx(null);
    setCurrentViewPolys([]);
  }

  function closeDraft() {
    if (draft.length < 3) {
      setMsg({ type: "err", text: "Need at least 3 points to close a polygon." });
      return;
    }
    const normalized = normalizePolyPoints(draft, canvasW, canvasH);
    if (normalized.length < 3) {
      setMsg({ type: "err", text: "Polygon points invalid." });
      return;
    }

    const cur = getCurrentViewPolys();
    for (const p of cur) {
      if (polygonsEqualApprox(p, normalized, 2)) {
        setDraft([]);
        setMsg({ type: "ok", text: "Duplicate polygon ignored." });
        return;
      }
    }

    setCurrentViewPolys([...cur, normalized]);
    setDraft([]);
    setMsg({ type: "ok", text: "Polygon added (not saved yet)." });
  }

  async function saveRoi() {
    if (!selectedId) return;

    try {
      setSaving(true);
      setMsg(null);

      let payload: RoiObj = deepClone(roi);

      if (!isFisheye) {
        payload = {
          bounding_polygons: Array.isArray(payload.bounding_polygons)
            ? payload.bounding_polygons
            : [],
          fisheye_polygons: {},
          roi_ref_width: canvasW,
          roi_ref_height: canvasH,
        } as any;
      } else {
        const flat = ensureFlatFisheyePolys(payload.fisheye_polygons as any);
        for (let viewId = 0; viewId < 8; viewId++) {
          const nm = getViewNameById(viewId);
          if (!Array.isArray(flat[nm])) flat[nm] = [];
        }
        payload = {
          bounding_polygons: [],
          fisheye_polygons: flat,
          roi_ref_width: canvasW,
          roi_ref_height: canvasH,
        } as any;
      }

      if (mode === "live") {
        await apiPost(`/api/live/roi/${encodeURIComponent(liveCamId)}`, payload);
      } else {
        await apiPost(
          `/api/offline/roi/${encodeURIComponent(offlineStem)}`,
          payload
        );
      }

      if (mode === "live") {
        const r = await apiGet<any>(
          `/api/live/roi/${encodeURIComponent(liveCamId)}`
        );
        setRoi({
          bounding_polygons: Array.isArray(r?.bounding_polygons)
            ? r.bounding_polygons
            : [],
          fisheye_polygons: r?.fisheye_polygons || {},
        });
      } else {
        const r = await apiGet<any>(
          `/api/offline/roi/${encodeURIComponent(offlineStem)}`
        );
        setRoi({
          bounding_polygons: Array.isArray(r?.bounding_polygons)
            ? r.bounding_polygons
            : [],
          fisheye_polygons: r?.fisheye_polygons || {},
        });
        try {
          const vids = await apiGet<{ videos: OfflineVideoItem[] }>(
            "/api/offline/videos"
          );
          setOfflineVideos(Array.isArray(vids?.videos) ? vids.videos : []);
        } catch {}
      }

      setMsg({ type: "ok", text: "ROI saved successfully." });
      bumpAllViewRefresh();
    } catch (e: any) {
      setMsg({
        type: "err",
        text: `Save ROI failed: ${String(e?.message || e)}`,
      });
    } finally {
      setSaving(false);
    }
  }

  async function startOfflineAnalyze() {
    if (!offlineStem) return;
    try {
      setSaving(true);
      setMsg(null);

      const res = await apiPost<any>("/api/offline/analyze", { id: offlineStem });
      if (res?.status === "queued") {
        setMsg({ type: "ok", text: "Analyze queued (waiting for h264)." });
      } else if (res?.status === "processing") {
        setMsg({ type: "ok", text: "Analyze started." });
      } else {
        setMsg({ type: "ok", text: `Analyze: ${String(res?.status || "ok")}` });
      }

      const vids = await apiGet<{ videos: OfflineVideoItem[] }>(
        "/api/offline/videos"
      );
      setOfflineVideos(Array.isArray(vids?.videos) ? vids.videos : []);
    } catch (e: any) {
      setMsg({
        type: "err",
        text: `Analyze failed: ${String(e?.message || e)}`,
      });
    } finally {
      setSaving(false);
    }
  }

  async function saveNotifications() {
    try {
      setSaving(true);
      setMsg(null);

      const payload: LFSettings = {
        notifications_enabled: !!settings.notifications_enabled,
        notifications_sound_enabled: !!settings.notifications_sound_enabled,
      };

      await apiPost("/api/lostfound/settings", payload);

      try {
        const st = await apiGet<LFSettings>("/api/lostfound/settings");
        setSettings((prev) => ({
          ...prev,
          notifications_enabled: !!(st as any)?.notifications_enabled,
          notifications_sound_enabled: !!(st as any)?.notifications_sound_enabled,
          cameras_enabled:
            (st as any)?.cameras_enabled || prev.cameras_enabled || {},
        }));
      } catch {}

      setMsg({ type: "ok", text: "Notifications saved." });
    } catch (e: any) {
      setMsg({ type: "err", text: `Save failed: ${String(e?.message || e)}` });
    } finally {
      setSaving(false);
    }
  }

  async function saveRetentionSettings() {
    try {
      setSaving(true);
      setMsg(null);

      const days = clamp(
        Number(settings.data_retention_days ?? 90) || 90,
        1,
        3650
      );

      const payload = {
        data_retention_enabled: !!settings.data_retention_enabled,
        data_retention_days: days,
      };

      await apiPost("/api/lostfound/settings", payload);

      try {
        const st = await apiGet<LFSettings>("/api/lostfound/settings");
        setSettings((prev) => ({
          ...prev,
          notifications_enabled: !!(st as any)?.notifications_enabled,
          notifications_sound_enabled: !!(st as any)?.notifications_sound_enabled,
          data_retention_enabled:
            typeof (st as any)?.data_retention_enabled === "boolean"
              ? !!(st as any)?.data_retention_enabled
              : true,
          data_retention_days: clamp(
            Number((st as any)?.data_retention_days ?? 90) || 90,
            1,
            3650
          ),
          cameras_enabled:
            (st as any)?.cameras_enabled || prev.cameras_enabled || {},
        }));
      } catch {}

      setMsg({ type: "ok", text: "Data retention saved." });
    } catch (e: any) {
      setMsg({ type: "err", text: `Save failed: ${String(e?.message || e)}` });
    } finally {
      setSaving(false);
    }
  }

  async function clearAllEvents() {
    const ok = window.confirm(
      "Are you sure you want to permanently delete all Lost & Found events?"
    );
    if (!ok) return;

    try {
      setSaving(true);
      setMsg(null);

      await apiPost("/api/lostfound/events/clear_all", {});

      setMsg({ type: "ok", text: "All events deleted successfully." });
    } catch (e: any) {
      setMsg({
        type: "err",
        text: `Delete all events failed: ${String(e?.message || e)}`,
      });
    } finally {
      setSaving(false);
    }
  }

  const selectedOffline = useMemo(
    () => offlineVideos.find((v) => v.id === offlineStem) || null,
    [offlineVideos, offlineStem]
  );

  const selectedCam = useMemo(
    () => cameras.find((c) => c.id === liveCamId) || null,
    [cameras, liveCamId]
  );

  const selectedLiveLabel = useMemo(() => {
    const s = liveSourcesAll.find((x) => x.id === liveCamId) || null;
    return s
      ? `${s.kind.toUpperCase()} • ${s.name}`
      : selectedCam?.name || liveCamId || "Live";
  }, [liveSourcesAll, liveCamId, selectedCam]);

  const roiSelectedLabel = useMemo(() => {
    if (mode === "live") {
      const s = liveSourcesAll.find((x) => x.id === liveCamId) || null;
      return s ? `[${s.kind.toUpperCase()}] ${s.name}` : liveCamId || "-";
    }
    const v = offlineVideos.find((x) => x.id === offlineStem) || null;
    return v ? v.name : offlineStem || "-";
  }, [mode, liveCamId, offlineStem, liveSourcesAll, offlineVideos]);

  const dewarpSelectedLabel = useMemo(() => {
    if (mode === "live") {
      const s = liveSourcesAll.find((x) => x.id === liveCamId) || null;
      return s ? `[${s.kind.toUpperCase()}] ${s.name}` : liveCamId || "-";
    }
    const v = offlineVideos.find((x) => x.id === offlineStem) || null;
    return v ? v.name : offlineStem || "-";
  }, [mode, liveCamId, offlineStem, liveSourcesAll, offlineVideos]);

  return (
    <div className={`min-h-screen ${PAGE_BG}`}>
      <div
        className={`sticky top-0 z-20 ${TOP_BG} backdrop-blur border-b ${BORDER}`}
      >
        <div className="w-full px-6 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-slate-900 text-white flex items-center justify-center shadow-sm">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <div className={`text-lg font-bold ${TEXT}`}>
                Lost &amp; Found Settings
              </div>
              <div className={`text-sm ${MUTED}`}>
                Sources • ROI • Notifications • Dewarp • Data Retention
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {msg && (
              <div
                className={
                  "px-3 py-2 rounded-xl text-sm border flex items-center gap-2 " +
                  (msg.type === "ok"
                    ? "border-emerald-700 bg-emerald-900/15 text-emerald-200"
                    : "border-rose-700 bg-rose-950/20 text-rose-200")
                }
              >
                {msg.type === "ok" ? (
                  <CheckCircle2 className="w-4 h-4" />
                ) : (
                  <XCircle className="w-4 h-4" />
                )}
                <span className="line-clamp-1">{msg.text}</span>
              </div>
            )}

            {tab === "notifications" && (
              <button
                onClick={saveNotifications}
                disabled={saving}
                className={primaryBtn}
                type="button"
              >
                <Save className="w-4 h-4" /> Save Notifications
              </button>
            )}

            {tab === "retention" && (
              <button
                onClick={saveRetentionSettings}
                disabled={saving}
                className={primaryBtn}
                type="button"
              >
                <Save className="w-4 h-4" /> Save Retention
              </button>
            )}
          </div>
        </div>

        <div className="w-full px-6 pb-3">
          <div className="flex flex-wrap gap-2">
            <TabButton
              active={tab === "sources"}
              onClick={() => setTab("sources")}
              icon={<Video className="w-4 h-4" />}
            >
              Sources
            </TabButton>

            <TabButton
              active={tab === "roi"}
              onClick={() => setTab("roi")}
              icon={<Shapes className="w-4 h-4" />}
            >
              ROI
            </TabButton>

            <TabButton
              active={tab === "notifications"}
              onClick={() => setTab("notifications")}
              icon={<Bell className="w-4 h-4" />}
            >
              Notifications
            </TabButton>

            <TabButton
              active={tab === "dewarp"}
              onClick={() => setTab("dewarp")}
              icon={<Cctv className="w-4 h-4" />}
            >
              Dewarp
            </TabButton>

            <TabButton
              active={tab === "retention"}
              onClick={() => setTab("retention")}
              icon={<Trash2 className="w-4 h-4" />}
            >
              Data Retention
            </TabButton>
          </div>
        </div>
      </div>

      <div className="w-full px-6 py-6">
        {tab === "sources" && (
          <>
            <div
              className={`rounded-2xl border ${BORDER} ${CARD_BG} shadow-sm p-4 mb-6`}
            >
              <div className="flex flex-col lg:flex-row lg:items-end gap-4">
                <div className="flex-1">
                  <div
                    className={`text-sm font-semibold ${TEXT} mb-2 flex items-center gap-2`}
                  >
                    <Video className="w-4 h-4" /> Mode &amp; Source
                  </div>

                  <div className="flex flex-col md:flex-row gap-3">
                    <div className="w-full md:w-44">
                      <label className={`text-xs ${MUTED2}`}>Mode</label>
                      <select
                        className={selectCls}
                        value={mode}
                        onChange={(e) => setMode(e.target.value as Mode)}
                      >
                        <option value="live">Live</option>
                        <option value="offline">Offline</option>
                      </select>
                    </div>

                    {mode === "live" ? (
                      <div className="flex-1">
                        <label className={`text-xs ${MUTED2}`}>Camera (All)</label>
                        <select
                          className={selectCls}
                          value={liveCamId}
                          onChange={(e) => setLiveCamId(e.target.value)}
                        >
                          {liveSourcesAll.map((c) => (
                            <option key={c.id} value={c.id}>
                              [{c.kind.toUpperCase()}] {c.name} ({c.id}){" "}
                              {c.enabled ? "" : "— DISABLED"}
                            </option>
                          ))}
                        </select>

                        <div
                          className={`mt-2 text-xs ${MUTED2} flex items-center gap-2`}
                        >
                          <Cctv className="w-4 h-4" />
                          <span>
                            {selectedLiveLabel} •{" "}
                            {isFisheye ? "Fisheye (8 views)" : "Normal (1 view)"}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="flex-1">
                        <label className={`text-xs ${MUTED2}`}>Offline Video</label>
                        <select
                          className={selectCls}
                          value={offlineStem}
                          onChange={(e) => setOfflineStem(e.target.value)}
                        >
                          {offlineVideos.map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.name} ({v.id})
                            </option>
                          ))}
                        </select>

                        <div
                          className={`mt-2 text-xs ${MUTED2} flex items-center gap-2`}
                        >
                          <Video className="w-4 h-4" />
                          <span>
                            {selectedOffline?.duration
                              ? `${selectedOffline.duration} • `
                              : ""}
                            {selectedOffline?.h264_ready
                              ? "h264 ready"
                              : "h264 not ready"}{" "}
                            • {isFisheye ? "Fisheye (8 views)" : "Normal (1 view)"}
                            {selectedOffline?.analysis_status
                              ? ` • analyze=${selectedOffline.analysis_status}`
                              : ""}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {mode === "live" && (
                <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/20 p-3">
                  <div className="flex items-center justify-between">
                    <div
                      className={`text-sm font-semibold ${TEXT} flex items-center gap-2`}
                    >
                      <Folder className="w-4 h-4" />
                      Live Sources (Upload + RTSP) (Enable/Disable)
                    </div>

                    <button
                      type="button"
                      onClick={refreshLiveSources}
                      className={softBtn}
                      title="Reload upload + rtsp lists"
                    >
                      <RefreshCw className="w-4 h-4" /> Refresh
                    </button>
                  </div>

                  <div className={`mt-2 text-xs ${MUTED2}`}>
                    Upload listing comes from:
                    <code className="text-slate-200">
                      {" "}
                      /api/lostfound/upload_sources
                    </code>
                    . Upload toggle calls:
                    <code className="text-slate-200">
                      {" "}
                      /api/lostfound/cameras_enabled/toggle/:camId
                    </code>
                    . RTSP listing comes from:
                    <code className="text-slate-200"> /api/lostfound/rtsp_sources</code>.
                    RTSP toggle calls:
                    <code className="text-slate-200"> /api/lostfound/rtsp_sources/toggle/:id</code>.
                  </div>

                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                    {liveSourcesMergedForCards.length === 0 ? (
                      <div className={`text-sm ${MUTED2} flex items-start gap-2`}>
                        <Info className="w-4 h-4 mt-[2px]" />
                        No live sources found.
                      </div>
                    ) : (
                      liveSourcesMergedForCards.map((c) => {
                        const enabled = !!c.enabled;

                        const badge =
                          c.kind === "upload"
                            ? "border-sky-700 bg-sky-900/15 text-sky-200"
                            : "border-violet-700 bg-violet-900/15 text-violet-200";

                        const badgeText = c.kind === "upload" ? "UPLOAD" : "RTSP";

                        const toggleFn =
                          c.kind === "upload"
                            ? () => toggleUploadCamEnabled(c.id, !enabled)
                            : () => toggleRtspEnabled(c.id, !enabled);

                        return (
                          <div
                            key={`${c.kind}-${c.id}`}
                            className={
                              "rounded-xl border border-slate-700 bg-slate-900/30 p-3 flex items-start justify-between gap-3 " +
                              (!enabled ? "opacity-60" : "")
                            }
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <div className="text-sm font-semibold text-slate-100 truncate">
                                  {c.name}
                                </div>

                                <span
                                  className={`text-[10px] px-2 py-0.5 rounded-full border ${badge}`}
                                >
                                  {badgeText}
                                </span>

                                <span
                                  className={
                                    "text-[10px] px-2 py-0.5 rounded-full border " +
                                    (enabled
                                      ? "border-emerald-700 bg-emerald-900/15 text-emerald-200"
                                      : "border-slate-700 bg-slate-900/20 text-slate-300")
                                  }
                                >
                                  {enabled ? "ENABLED" : "DISABLED"}
                                </span>
                              </div>

                              <div className="mt-1 text-xs text-slate-400 break-all">
                                {c.id}
                              </div>

                              {c.subtitle ? (
                                <div className="mt-1 text-[11px] text-slate-500 break-all">
                                  {c.subtitle}
                                </div>
                              ) : null}
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                type="button"
                                className={
                                  "px-3 py-2 rounded-xl border text-sm flex items-center gap-2 " +
                                  (enabled
                                    ? "border-emerald-700/60 bg-emerald-900/10 text-emerald-200 hover:bg-emerald-900/20"
                                    : "border-slate-700 bg-slate-900/40 text-slate-200 hover:bg-slate-800/60")
                                }
                                onClick={toggleFn}
                                disabled={saving}
                                title="Toggle source"
                              >
                                {enabled ? (
                                  <Power className="w-4 h-4" />
                                ) : (
                                  <PowerOff className="w-4 h-4" />
                                )}
                                {enabled ? "On" : "Off"}
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {mode === "live" && (
                <div className="mt-6 grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-4">
                  <div className={`rounded-2xl border ${BORDER} p-3 ${CARD_BG}`}>
                    <div className="flex items-center justify-between">
                      <div
                        className={`text-sm font-semibold ${TEXT} flex items-center gap-2`}
                      >
                        <Link2 className="w-4 h-4" />
                        RTSP Sources (Live)
                      </div>
                      <button
                        type="button"
                        onClick={loadRtspSources}
                        className={softBtn}
                        title="Reload RTSP sources"
                      >
                        <RefreshCw className="w-4 h-4" /> Refresh
                      </button>
                    </div>

                    <div className={`mt-2 text-xs ${MUTED2}`}>
                      These sources are saved in your backend RTSP store. Use the{" "}
                      <b>Enabled</b> switch to control which sources are active/available
                      for Live View.
                    </div>

                    <div className="mt-3 space-y-2">
                      {rtspSources.length === 0 ? (
                        <div className={`text-sm ${MUTED2} flex items-start gap-2`}>
                          <Info className="w-4 h-4 mt-[2px]" />
                          No RTSP sources yet. Add one using the form on the right.
                        </div>
                      ) : (
                        rtspSources.map((s) => (
                          <div
                            key={s.id}
                            className="rounded-xl border border-slate-700 bg-slate-900/30 p-3 flex items-start justify-between gap-3"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <div className="text-sm font-semibold text-slate-100 truncate">
                                  {s.name}
                                </div>
                                <span
                                  className={
                                    "text-[10px] px-2 py-0.5 rounded-full border " +
                                    (s.enabled
                                      ? "border-emerald-700 bg-emerald-900/15 text-emerald-200"
                                      : "border-slate-700 bg-slate-900/20 text-slate-300")
                                  }
                                >
                                  {s.enabled ? "ENABLED" : "DISABLED"}
                                </span>
                              </div>
                              <div className="mt-1 text-xs text-slate-400 break-all">
                                {s.url}
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                type="button"
                                className={
                                  "px-3 py-2 rounded-xl border text-sm flex items-center gap-2 " +
                                  (s.enabled
                                    ? "border-emerald-700/60 bg-emerald-900/10 text-emerald-200 hover:bg-emerald-900/20"
                                    : "border-slate-700 bg-slate-900/40 text-slate-200 hover:bg-slate-800/60")
                                }
                                onClick={() => toggleRtspEnabled(s.id, !s.enabled)}
                                disabled={saving}
                                title="Toggle enabled"
                              >
                                {s.enabled ? (
                                  <Power className="w-4 h-4" />
                                ) : (
                                  <PowerOff className="w-4 h-4" />
                                )}
                                {s.enabled ? "On" : "Off"}
                              </button>

                              <button
                                type="button"
                                className={softBtn}
                                onClick={() =>
                                  setRtspForm({
                                    id: s.id,
                                    name: s.name,
                                    url: s.url,
                                    enabled: s.enabled,
                                  })
                                }
                                title="Edit"
                              >
                                <Pencil className="w-4 h-4" /> Edit
                              </button>

                              <button
                                type="button"
                                className={
                                  "px-3 py-2 rounded-xl border border-rose-700/50 bg-rose-950/20 hover:bg-rose-950/35 " +
                                  "text-rose-200 text-sm flex items-center gap-2"
                                }
                                onClick={() => deleteRtspSource(s.id)}
                                disabled={saving}
                                title="Delete"
                              >
                                <Trash2 className="w-4 h-4" /> Delete
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className={`rounded-2xl border ${BORDER} p-3 ${CARD_BG}`}>
                    <div
                      className={`text-sm font-semibold ${TEXT} flex items-center gap-2`}
                    >
                      <Plus className="w-4 h-4" />
                      {rtspForm.id ? "Edit RTSP Source" : "Add RTSP Source"}
                    </div>

                    <div className="mt-3 space-y-3">
                      <div>
                        <label className={`text-xs ${MUTED2}`}>Name</label>
                        <input
                          className={inputCls}
                          value={rtspForm.name}
                          onChange={(e) =>
                            setRtspForm((p) => ({ ...p, name: e.target.value }))
                          }
                          placeholder="e.g., Gate Camera 1"
                        />
                      </div>

                      <div>
                        <label className={`text-xs ${MUTED2}`}>RTSP URL</label>
                        <input
                          className={inputCls}
                          value={rtspForm.url}
                          onChange={(e) =>
                            setRtspForm((p) => ({ ...p, url: e.target.value }))
                          }
                          placeholder="rtsp://username:password@ip:554/stream"
                        />
                        <div className={`mt-1 text-[11px] ${MUTED2}`}>
                          Tip: Use <code className="text-slate-200">rtsp://</code>{" "}
                          (or <code className="text-slate-200">rtsps://</code>).
                        </div>
                      </div>

                      <div className="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-900/30 px-3 py-2">
                        <div className="text-sm text-slate-200">Enabled</div>
                        <label className="inline-flex items-center gap-2">
                          <input
                            type="checkbox"
                            className="w-4 h-4"
                            checked={!!rtspForm.enabled}
                            onChange={(e) =>
                              setRtspForm((p) => ({
                                ...p,
                                enabled: e.target.checked,
                              }))
                            }
                          />
                          <span
                            className={
                              "text-xs px-2 py-0.5 rounded-full border " +
                              (rtspForm.enabled
                                ? "border-emerald-700 bg-emerald-900/15 text-emerald-200"
                                : "border-slate-700 bg-slate-900/20 text-slate-300")
                            }
                          >
                            {rtspForm.enabled ? "ON" : "OFF"}
                          </span>
                        </label>
                      </div>

                      <div className="flex gap-2 pt-1">
                        <button
                          type="button"
                          className={greenBtn}
                          onClick={upsertRtspSource}
                          disabled={saving}
                        >
                          <Save className="w-4 h-4" />
                          {rtspForm.id ? "Update" : "Add"}
                        </button>

                        <button
                          type="button"
                          className={softBtn}
                          onClick={resetRtspForm}
                          disabled={saving}
                        >
                          <RefreshCw className="w-4 h-4" /> Clear
                        </button>
                      </div>

                      <div className={`text-xs ${MUTED2}`}>
                        After adding/enabling sources, your backend can use this list
                        to decide which RTSP cameras appear or run in <b>Live View</b>.
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {tab === "roi" && (
          <div
            className={`rounded-2xl border ${BORDER} ${CARD_BG} shadow-sm p-4`}
          >
            <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 mb-4">
              <div>
                <div className={`text-lg font-bold ${TEXT}`}>
                  ROI Configuration
                </div>
                <div className={`text-sm ${MUTED}`}>
                  {mode === "live"
                    ? "Live ROI saved under outputs/lost_and_found/live/<cam_id>/roi_config.json"
                    : "Offline ROI saved under outputs/lost_and_found/offline/<stem>/roi_config.json"}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full lg:w-auto lg:min-w-[560px]">
                <div>
                  <label className={`text-xs ${MUTED2}`}>Mode</label>
                  <select
                    className={selectCls}
                    value={mode}
                    onChange={(e) => setMode(e.target.value as Mode)}
                  >
                    <option value="live">Live</option>
                    <option value="offline">Offline</option>
                  </select>
                </div>

                {mode === "live" ? (
                  <div>
                    <label className={`text-xs ${MUTED2}`}>Video / Camera</label>
                    <select
                      className={selectCls}
                      value={liveCamId}
                      onChange={(e) => setLiveCamId(e.target.value)}
                    >
                      {liveSourcesAll.map((c) => (
                        <option key={c.id} value={c.id}>
                          [{c.kind.toUpperCase()}] {c.name} ({c.id})
                          {c.enabled ? "" : " — DISABLED"}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div>
                    <label className={`text-xs ${MUTED2}`}>Video / Camera</label>
                    <select
                      className={selectCls}
                      value={offlineStem}
                      onChange={(e) => setOfflineStem(e.target.value)}
                    >
                      {offlineVideos.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name} ({v.id})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>

            <div className={`mb-4 text-xs ${MUTED2}`}>
              Selected for ROI:{" "}
              <span className="text-slate-200 font-medium">{roiSelectedLabel}</span>
            </div>

            {tab === "roi" && isFisheye && (
              <div className="mt-4 grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4">
                <div className={`rounded-2xl border ${BORDER} p-3 ${CARD_BG}`}>
                  <div className={`text-sm font-semibold ${TEXT} mb-2`}>
                    Fisheye View Controls
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className={
                        "px-3 py-2 rounded-xl border text-sm " +
                        (group === "A"
                          ? "bg-slate-900 text-white border-slate-900"
                          : "border-slate-700 bg-slate-900/40 hover:bg-slate-800/60 text-slate-100")
                      }
                      onClick={() => {
                        const viewId = getFirstViewIdOfGroup("A");
                        setGroup("A");
                        setActiveViewIdx(viewId);
                        setDraft([]);
                        setActivePolyIdx(null);
                      }}
                    >
                      Group A
                    </button>

                    <button
                      type="button"
                      className={
                        "px-3 py-2 rounded-xl border text-sm " +
                        (group === "B"
                          ? "bg-slate-900 text-white border-slate-900"
                          : "border-slate-700 bg-slate-900/40 hover:bg-slate-800/60 text-slate-100")
                      }
                      onClick={() => {
                        const viewId = getFirstViewIdOfGroup("B");
                        setGroup("B");
                        setActiveViewIdx(viewId);
                        setDraft([]);
                        setActivePolyIdx(null);
                      }}
                    >
                      Group B
                    </button>

                    <div className="w-px h-8 bg-slate-800 mx-1" />

                    <div className="text-sm text-slate-200">
                      Active view:{" "}
                      <span className="font-semibold">
                        {prettyViewName(activeViewName)}
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2">
                    {Array.from({ length: 8 }, (_, viewId) => {
                      const nm = getViewNameById(viewId);
                      return (
                        <button
                          key={viewId}
                          type="button"
                          onClick={() => {
                            setActiveViewIdx(viewId);
                            setGroup(getGroupByViewId(viewId));
                            setDraft([]);
                            setActivePolyIdx(null);
                          }}
                          className={
                            "px-3 py-2 rounded-xl border text-xs text-left " +
                            (activeViewIdx === viewId
                              ? "border-emerald-700 bg-emerald-900/15 text-emerald-100"
                              : "border-slate-700 bg-slate-900/40 hover:bg-slate-800/60 text-slate-100")
                          }
                        >
                          <div className="font-semibold">
                            {viewId}. {nm}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            {prettyViewName(nm)}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className={`rounded-2xl border ${BORDER} p-3 ${CARD_BG}`}>
                  <div className="flex items-center justify-between">
                    <div className={`text-sm font-semibold ${TEXT}`}>
                      Group Preview
                    </div>
                    {mode === "live" && (
                      <button
                        type="button"
                        onClick={refreshFrozen}
                        className={softBtn}
                        title="Refresh frozen preview"
                      >
                        <RefreshCw className="w-4 h-4" /> Refresh Frame
                      </button>
                    )}
                  </div>

                  <div className="mt-3 rounded-xl overflow-hidden border border-slate-800 bg-slate-900/60">
                    {groupFrameUrl ? (
                      <img
                        src={groupFrameUrl}
                        alt="Group frame"
                        className="w-full h-auto block"
                        draggable={false}
                      />
                    ) : (
                      <div className="p-6 text-sm text-slate-400">No preview</div>
                    )}
                  </div>

                  <div className={`mt-2 text-xs ${MUTED2}`}>
                    {mode === "live"
                      ? "Live settings uses frozen snapshots for stable ROI drawing."
                      : "Offline preview uses current decoded frame (may change between requests)."}
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 my-4">
              <div />

              <div className="flex items-center gap-2">
                {mode === "offline" && (
                  <button
                    type="button"
                    onClick={startOfflineAnalyze}
                    disabled={saving || !offlineStem}
                    className={softBtn}
                  >
                    <PlayCircle className="w-4 h-4" /> Analyze
                  </button>
                )}

                <button
                  type="button"
                  onClick={saveRoi}
                  disabled={saving || !selectedId}
                  className={greenBtn}
                >
                  <Save className="w-4 h-4" /> Save ROI
                </button>
              </div>
            </div>

            {!isFisheye && mode === "live" && (
              <div className={`mb-3 text-xs ${MUTED2} flex items-center gap-2`}>
                <Info className="w-4 h-4" />
                Live normal ROI uses frozen static frame so your coordinates match
                what you see while drawing.
              </div>
            )}

            <RoiCanvas
              imgUrl={frameUrl}
              canvasW={canvasW}
              canvasH={canvasH}
              polygons={currentPolygons}
              activePolyIdx={activePolyIdx}
              draft={draft}
              onAddPoint={addPoint}
              onCloseDraft={closeDraft}
              onUndo={undo}
              onClearDraft={clearDraft}
              onSelectPoly={(idx) => setActivePolyIdx(idx)}
              onDeletePoly={deletePoly}
              onClearAll={clearAll}
              previewMaxWidth={mode === "offline" ? 800 : isFisheye ? 420 : 900}
              hintTitle={
                isFisheye
                  ? `Drawing ROI for ${prettyViewName(activeViewName)} (fisheye view)`
                  : "Drawing ROI for normal frame"
              }
            />
          </div>
        )}

        {tab === "notifications" && (
          <div
            className={`rounded-2xl border ${BORDER} ${CARD_BG} shadow-sm p-4`}
          >
            <div className={`text-lg font-bold ${TEXT} mb-1`}>Notifications</div>
            <div className={`text-sm ${MUTED} mb-4`}>
              Global notification settings (backend stores it).
            </div>

            <div
              className={`max-w-xl rounded-2xl border ${BORDER} p-4 bg-slate-900/30 space-y-4`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className={`text-sm font-semibold ${TEXT}`}>
                    Enable notifications
                  </div>
                  <div className={`text-xs ${MUTED2}`}>
                    Stored in{" "}
                    <code className="text-slate-200">
                      outputs/lost_and_found/_settings.json
                    </code>
                  </div>
                </div>

                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="w-4 h-4"
                    checked={!!settings.notifications_enabled}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        notifications_enabled: e.target.checked,
                      }))
                    }
                  />
                  <span
                    className={
                      "text-sm px-2 py-1 rounded-lg border " +
                      (settings.notifications_enabled
                        ? "border-emerald-700 bg-emerald-900/15 text-emerald-200"
                        : "border-rose-700 bg-rose-950/20 text-rose-200")
                    }
                  >
                    {settings.notifications_enabled ? "ON" : "OFF"}
                  </span>
                </label>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <div className={`text-sm font-semibold ${TEXT}`}>
                    Play sound for new notification
                  </div>
                  <div className={`text-xs ${MUTED2}`}>
                    When a new lost item is detected, the dashboard will beep.
                  </div>
                </div>

                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="w-4 h-4"
                    checked={!!settings.notifications_sound_enabled}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        notifications_sound_enabled: e.target.checked,
                      }))
                    }
                  />
                  <span
                    className={
                      "text-sm px-2 py-1 rounded-lg border " +
                      (settings.notifications_sound_enabled
                        ? "border-emerald-700 bg-emerald-900/15 text-emerald-200"
                        : "border-slate-700 bg-slate-900/20 text-slate-300")
                    }
                  >
                    {settings.notifications_sound_enabled ? "ON" : "OFF"}
                  </span>
                </label>
              </div>
            </div>

            <div className="mt-4">
              <button
                onClick={saveNotifications}
                disabled={saving}
                className={primaryBtn}
                type="button"
              >
                <Save className="w-4 h-4" /> Save Notifications
              </button>
            </div>
          </div>
        )}

        {tab === "retention" && (
          <div
            className={`rounded-2xl border ${BORDER} ${CARD_BG} shadow-sm p-4`}
          >
            <div className="flex flex-col gap-5">
              <div>
                <div className={`text-lg font-bold ${TEXT}`}>
                  Data Retention Settings
                </div>
                <div className={`text-sm ${MUTED} mt-1`}>
                  Control how long Lost &amp; Found events are kept in the system.
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className={`text-sm font-semibold ${TEXT}`}>
                      Enable Data Retention
                    </div>
                    <div className={`text-xs ${MUTED2} mt-1`}>
                      When enabled, old event records and evidence files will be
                      removed automatically. When disabled, old data will remain
                      unless manually deleted.
                    </div>
                  </div>

                  <label className="inline-flex items-center gap-2 shrink-0">
                    <input
                      type="checkbox"
                      className="w-4 h-4"
                      checked={!!settings.data_retention_enabled}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          data_retention_enabled: e.target.checked,
                        }))
                      }
                    />
                    <span
                      className={
                        "text-sm px-2 py-1 rounded-lg border " +
                        (settings.data_retention_enabled
                          ? "border-emerald-700 bg-emerald-900/15 text-emerald-200"
                          : "border-slate-700 bg-slate-900/20 text-slate-300")
                      }
                    >
                      {settings.data_retention_enabled ? "ON" : "OFF"}
                    </span>
                  </label>
                </div>

                <div
                  className={
                    "mt-4 rounded-xl border px-4 py-3 text-sm " +
                    (settings.data_retention_enabled
                      ? "border-amber-700/50 bg-amber-950/20 text-amber-200"
                      : "border-slate-700 bg-slate-900/20 text-slate-300")
                  }
                >
                  {settings.data_retention_enabled
                    ? `Data retention is ON. Events older than ${Number(
                        settings.data_retention_days ?? 90
                      )} days will be deleted automatically.`
                    : "Data retention is OFF. No automatic deletion will happen."}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className={`text-sm font-semibold ${TEXT}`}>
                      Event Retention Period
                    </div>
                    <div className={`text-xs ${MUTED2} mt-1`}>
                      Event records, dashboard/report history, and evidence images
                      older than this period will be removed automatically.
                    </div>
                  </div>

                  <div className="text-white font-semibold text-sm shrink-0">
                    {Number(settings.data_retention_days ?? 90)} days
                  </div>
                </div>

                <div className="mt-4">
                  <input
                    type="range"
                    min={1}
                    max={365}
                    step={1}
                    className="w-full"
                    value={Number(settings.data_retention_days ?? 90)}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        data_retention_days: clamp(
                          Number(e.target.value || 90),
                          1,
                          365
                        ),
                      }))
                    }
                    disabled={!settings.data_retention_enabled}
                  />
                  <div className={`mt-2 flex justify-between text-xs ${MUTED2}`}>
                    <span>1 day</span>
                    <span>365 days</span>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-amber-700/50 bg-amber-950/20 p-4">
                <div className="text-amber-200 text-sm font-medium">
                  ⚠ Data retention is applied across the Lost &amp; Found module,
                  including Events, Dashboard, Reports, exports, and evidence files.
                </div>
              </div>

              <div className="rounded-2xl border border-rose-700/50 bg-rose-950/20 p-4">
                <div className={`text-sm font-semibold text-white`}>
                  Clear All Events
                </div>
                <div className={`text-xs ${MUTED2} mt-1 mb-4`}>
                  Permanently delete all Lost &amp; Found records and saved
                  evidence images from the system.
                </div>

                <button
                  type="button"
                  onClick={clearAllEvents}
                  disabled={saving}
                  className={
                    "px-4 py-2 rounded-xl border border-rose-700/50 bg-rose-600 hover:bg-rose-700 " +
                    "text-white text-sm flex items-center gap-2"
                  }
                >
                  <Trash2 className="w-4 h-4" /> Clear All Events
                </button>
              </div>

              <div>
                <button
                  onClick={saveRetentionSettings}
                  disabled={saving}
                  className={primaryBtn}
                  type="button"
                >
                  <Save className="w-4 h-4" /> Save Data Retention Settings
                </button>
              </div>
            </div>
          </div>
        )}

                {tab === "dewarp" && (
          <div
            className={`rounded-2xl border ${BORDER} ${CARD_BG} shadow-sm p-4`}
          >
            <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 mb-4">
              <div>
                <div className={`text-lg font-bold ${TEXT} mb-1`}>
                  Fisheye Dewarp Calibration
                </div>
                <div className={`text-sm ${MUTED}`}>
                  Adjust yaw/pitch/fov/rotate per fisheye source. Saved per
                  camera/video and applied immediately.
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full lg:w-auto lg:min-w-[560px]">
                <div>
                  <label className={`text-xs ${MUTED2}`}>Mode</label>
                  <select
                    className={selectCls}
                    value={mode}
                    onChange={(e) => setMode(e.target.value as Mode)}
                  >
                    <option value="live">Live</option>
                    <option value="offline">Offline</option>
                  </select>
                </div>

                {mode === "live" ? (
                  <div>
                    <label className={`text-xs ${MUTED2}`}>Video / Camera</label>
                    <select
                      className={selectCls}
                      value={liveCamId}
                      onChange={(e) => setLiveCamId(e.target.value)}
                    >
                      {liveSourcesAll.map((c) => (
                        <option key={c.id} value={c.id}>
                          [{c.kind.toUpperCase()}] {c.name} ({c.id})
                          {c.enabled ? "" : " — DISABLED"}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div>
                    <label className={`text-xs ${MUTED2}`}>Video / Camera</label>
                    <select
                      className={selectCls}
                      value={offlineStem}
                      onChange={(e) => setOfflineStem(e.target.value)}
                    >
                      {offlineVideos.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name} ({v.id})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>

            <div className={`mb-4 text-xs ${MUTED2}`}>
              Selected for Dewarp: <span className="text-slate-200 font-medium">{dewarpSelectedLabel}</span>
            </div>

            {!isFisheye ? (
              <div className={`text-sm ${MUTED2} flex items-start gap-2`}>
                <Info className="w-4 h-4 mt-[2px]" />
                Selected source is Normal (not fisheye). Dewarp settings are only
                for fisheye sources.
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    className={softBtn}
                    onClick={() => loadFisheyeCfg(currentDewarpCamId)}
                    disabled={fisheyeCfgLoading || saving || dewarpApplying}
                  >
                    <RefreshCw className="w-4 h-4" /> Reload
                  </button>

                  <button
                    type="button"
                    className={greenBtn}
                    onClick={() =>
                      applyFisheyeCfg(currentDewarpCamId, {
                        silent: false,
                        reloadAfter: false,
                      })
                    }
                    disabled={saving || dewarpApplying || fisheyeCfg.length === 0}
                  >
                    <Save className="w-4 h-4" /> Save & Apply
                  </button>

                  <button
                    type="button"
                    className={
                      "px-3 py-2 rounded-xl border border-rose-700/50 bg-rose-950/20 hover:bg-rose-950/35 " +
                      "text-rose-200 text-sm flex items-center gap-2"
                    }
                    onClick={() => resetFisheyeCfg(currentDewarpCamId)}
                    disabled={saving || dewarpApplying}
                  >
                    <Undo2 className="w-4 h-4" /> Reset Default
                  </button>

                  {(fisheyeCfgLoading || dewarpApplying) && (
                    <div className={`text-xs ${MUTED2} flex items-center gap-2`}>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      {fisheyeCfgLoading ? "Loading..." : "Applying..."}
                    </div>
                  )}

                  <div className={`text-xs ${MUTED2}`}>
                    Auto apply after edit: 0.5s debounce
                  </div>
                </div>

                <div
                  className={`rounded-2xl border ${BORDER} bg-slate-900/30 overflow-hidden`}
                >
                  <div
                    className={`p-3 border-b ${BORDER} flex items-center justify-between`}
                  >
                    <div className={`text-sm font-semibold ${TEXT}`}>
                      8 View Parameters
                    </div>
                    <div className={`text-xs ${MUTED2}`}>
                      Tip: yaw 0–360, pitch 0–80, fov 40–140, rotate 0/90/180/270
                    </div>
                  </div>

                  <div className="p-3 overflow-x-auto">
                    <table className="min-w-[880px] w-full text-sm">
                      <thead>
                        <tr className="text-slate-300">
                          <th className="text-left p-2">View</th>
                          <th className="text-left p-2">Name</th>
                          <th className="text-left p-2">Yaw</th>
                          <th className="text-left p-2">Pitch</th>
                          <th className="text-left p-2">FOV</th>
                          <th className="text-left p-2">Rotate</th>
                        </tr>
                      </thead>
                      <tbody>
                        {fisheyeCfg
                          .slice()
                          .sort((a, b) => a.view_id - b.view_id)
                          .map((row) => (
                            <tr
                              key={row.view_id}
                              className={
                                "border-t border-slate-800 " +
                                (dewarpSelectedIdx === row.view_id
                                  ? "bg-emerald-900/10"
                                  : "")
                              }
                            >
                              <td className="p-2 text-slate-200 font-semibold">
                                <button
                                  type="button"
                                  className={
                                    "px-2 py-1 rounded-lg border " +
                                    (dewarpSelectedIdx === row.view_id
                                      ? "border-emerald-700 bg-emerald-900/20 text-emerald-100"
                                      : "border-slate-700 bg-slate-900/40 text-slate-200 hover:bg-slate-800/60")
                                  }
                                  onClick={() => setDewarpSelectedIdx(row.view_id)}
                                >
                                  #{row.view_id}
                                </button>
                              </td>

                              <td className="p-2">
                                <input
                                  className={inputCls}
                                  value={row.name}
                                  onFocus={() => setDewarpSelectedIdx(row.view_id)}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    setFisheyeCfg((prev) =>
                                      prev.map((item) =>
                                        item.view_id === row.view_id
                                          ? { ...item, name: v }
                                          : item
                                      )
                                    );
                                  }}
                                />
                              </td>

                              {(["yaw", "pitch", "fov"] as const).map((k) => (
                                <td key={k} className="p-2">
                                  <input
                                    className={inputCls}
                                    type="number"
                                    value={(row as any)[k]}
                                    step={1}
                                    onFocus={() => setDewarpSelectedIdx(row.view_id)}
                                    onChange={(e) => {
                                      const raw = Number(e.target.value);
                                      let num = raw;
                                      if (k === "yaw")
                                        num = clamp(sanitizeNum(raw, 0), 0, 360);
                                      if (k === "pitch")
                                        num = clamp(sanitizeNum(raw, 0), 0, 180);
                                      if (k === "fov")
                                        num = clamp(sanitizeNum(raw, 90), 1, 180);

                                      setFisheyeCfg((prev) =>
                                        prev.map((item) =>
                                          item.view_id === row.view_id
                                            ? { ...item, [k]: num }
                                            : item
                                        )
                                      );
                                    }}
                                  />
                                </td>
                              ))}

                              <td className="p-2">
                                <select
                                  className={selectCls}
                                  value={row.rotate}
                                  onFocus={() => setDewarpSelectedIdx(row.view_id)}
                                  onChange={(e) => {
                                    const r = Number(e.target.value);
                                    setFisheyeCfg((prev) =>
                                      prev.map((item) =>
                                        item.view_id === row.view_id
                                          ? { ...item, rotate: r }
                                          : item
                                      )
                                    );
                                  }}
                                >
                                  <option value={0}>0</option>
                                  <option value={90}>90</option>
                                  <option value={180}>180</option>
                                  <option value={270}>270</option>
                                </select>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div
                  className={`rounded-2xl border ${BORDER} bg-slate-900/30 overflow-hidden`}
                >
                  <div
                    className={`p-3 border-b ${BORDER} flex items-center justify-between gap-3`}
                  >
                    <div
                      className={`text-sm font-semibold ${TEXT} flex items-center gap-2`}
                    >
                      <Eye className="w-4 h-4" />
                      Dewarp Preview
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      {Array.from({ length: 8 }, (_, viewId) => (
                        <button
                          key={`preview-${viewId}`}
                          type="button"
                          onClick={() => setDewarpSelectedIdx(viewId)}
                          className={
                            "px-2 py-1 rounded-lg border text-xs " +
                            (dewarpSelectedIdx === viewId
                              ? "border-emerald-700 bg-emerald-900/20 text-emerald-100"
                              : "border-slate-700 bg-slate-900/40 text-slate-200 hover:bg-slate-800/60")
                          }
                        >
                          {viewId}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="p-3 grid grid-cols-1 xl:grid-cols-[300px_minmax(0,1fr)] gap-4 items-start">
                    <div className="space-y-2">
                      <div className={`text-sm font-semibold ${TEXT}`}>
                        Selected View: {prettyViewName(dewarpSelectedViewName)}
                      </div>
                      <div className={`text-xs ${MUTED2}`}>
                        Preview updates after dewarp apply. While editing, changes
                        auto apply after a short pause.
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        {fisheyeCfg
                          .slice()
                          .sort((a, b) => a.view_id - b.view_id)
                          .map((row) => (
                            <button
                              key={`preview-card-${row.view_id}`}
                              type="button"
                              onClick={() => setDewarpSelectedIdx(row.view_id)}
                              className={
                                "p-2 rounded-xl border text-left " +
                                (dewarpSelectedIdx === row.view_id
                                  ? "border-emerald-700 bg-emerald-900/15"
                                  : "border-slate-700 bg-slate-900/30 hover:bg-slate-800/60")
                              }
                            >
                              <div className="text-xs font-semibold text-slate-100">
                                #{row.view_id}{" "}
                                {row.name || getViewNameById(row.view_id)}
                              </div>
                              <div className="text-[11px] text-slate-400 mt-1">
                                yaw {row.yaw} • pitch {row.pitch} • fov {row.fov} •
                                rot {row.rotate}
                              </div>
                            </button>
                          ))}
                      </div>
                    </div>

                    <div className="rounded-xl overflow-hidden border border-slate-800 bg-slate-950/60">
                      {dewarpPreviewUrl ? (
                        <div className="w-full h-[420px] flex items-center justify-center p-2">
                          <img
                            src={dewarpPreviewUrl}
                            alt={`Dewarp preview ${dewarpSelectedViewName}`}
                            className="max-w-full max-h-full object-contain block"
                            draggable={false}
                          />
                        </div>
                      ) : (
                        <div className="h-[420px] flex items-center justify-center text-sm text-slate-400">
                          No dewarp preview
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className={`text-xs ${MUTED2}`}>
                  Save &amp; Apply uses backend fisheye config API. Auto apply
                  helps you tune while watching the preview.
                </div>
              </div>
            )}
          </div>
        )}

        {loading && (
          <div className={`mt-4 text-sm ${MUTED2} flex items-center gap-2`}>
            <RefreshCw className="w-4 h-4 animate-spin" /> Loading...
          </div>
        )}
      </div>
    </div>
  );
}

function TabButton(props: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={
        "px-3 py-2 rounded-xl border text-sm flex items-center gap-2 transition " +
        (props.active
          ? "bg-slate-900 text-white border-slate-900"
          : "border-slate-700 bg-slate-900/40 hover:bg-slate-800/60 text-slate-100")
      }
    >
      {props.icon}
      {props.children}
    </button>
  );
}
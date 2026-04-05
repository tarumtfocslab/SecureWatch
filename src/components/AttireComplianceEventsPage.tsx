// AttireComplianceEventsPage.tsx
import { useEffect, useState, useRef } from 'react';
import { Search, Filter, MapPin, Calendar, Clock, CheckCircle, AlertCircle, Trash2, Edit2, X, AlertTriangle } from 'lucide-react';
import { ATTIRE_API_BASE } from "../api/base";
export interface AttireViolation {
  id: string;
  imageUrl: string;
  violationType: 'Sleeveless' | 'Shorts' | 'Slippers';
  status: 'Pending' | 'Resolved';
  location: string;
  detectionDate: Date;
  source: 'Uploaded Video' | 'Live RTSP' | 'Webcam';
  videoId?: string;
  view?: string;
  videoName?: string;
  notes?: string;
}

type BackendAttireEvent = {
  id: string;
  evidence_url?: string;
  label?: string;       // sleeveless/shorts/slippers
  status?: 'Pending' | 'Resolved';
  location?: string;
  view?: string;
  ts?: number;          // unix seconds
  source?: string; 
  video_name?: string;
  video_id?: string; 
  notes?: string;
  conf?: number;
  severity?: string;
};

const labelToViolationType = (label?: string): AttireViolation["violationType"] => {
  const s = (label || "").toLowerCase();
  if (s.includes("sleeveless")) return "Sleeveless";
  if (s.includes("shorts")) return "Shorts";
  if (s.includes("slippers") || s.includes("sandal")) return "Slippers";
  return "Sleeveless";
};

const API_BASE = ATTIRE_API_BASE;

interface EditModalProps {
  violation: AttireViolation;
  onSave: (violation: AttireViolation) => void;
  onClose: () => void;
}

async function apiPatchEvent(id: string, payload: any) {
  const res = await fetch(`${API_BASE}/api/attire/events/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`PATCH failed: HTTP ${res.status}`);
  return res.json();
}

async function apiDeleteEvent(id: string) {
  const res = await fetch(`${API_BASE}/api/attire/events/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`DELETE failed: HTTP ${res.status}`);
  return res.json();
}

type DewarpView = { name: string; label?: string };

async function apiGetDewarpLabels(videoId: string): Promise<Record<string, string>> {
  // returns: { entrance: "Entrance", corridor: "Main Corridor", ... }
  const res = await fetch(`${API_BASE}/api/attire/dewarp/${encodeURIComponent(videoId)}`);
  if (!res.ok) return {};
  const j = await res.json();
  const views: DewarpView[] = j?.views || [];
  const m: Record<string, string> = {};
  for (const v of views) {
    if (v?.name) m[String(v.name)] = String(v.label || v.name);
  }
  return m;
}

function EditModal({ violation, onSave, onClose }: EditModalProps) {
  const [editedViolation, setEditedViolation] = useState(violation);

  const handleSave = () => {
    onSave(editedViolation);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-slate-900 border-b border-slate-700 px-6 py-4 flex items-center justify-between">
          <h3 className="text-white">Edit Violation Details</h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-800 rounded-lg transition-colors text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-slate-400 text-sm mb-2">Violation Type</label>
            <select
              value={editedViolation.violationType}
              onChange={(e) => setEditedViolation({ ...editedViolation, violationType: e.target.value as AttireViolation['violationType'] })}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white"
            >
              <option>Sleeveless</option>
              <option>Shorts</option>
              <option>Slippers</option>
            </select>
          </div>

          <div>
            <label className="block text-slate-400 text-sm mb-2">Status</label>
            <select
              value={editedViolation.status}
              onChange={(e) => setEditedViolation({ ...editedViolation, status: e.target.value as AttireViolation['status'] })}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white"
            >
              <option>Pending</option>
              <option>Resolved</option>
            </select>
          </div>

          <div>
            <label className="block text-slate-400 text-sm mb-2">Location</label>
            <input
              type="text"
              value={editedViolation.location}
              onChange={(e) => setEditedViolation({ ...editedViolation, location: e.target.value })}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white"
            />
          </div>

          <div>
            <label className="block text-slate-400 text-sm mb-2">Notes</label>
            <textarea
              value={editedViolation.notes || ''}
              onChange={(e) => setEditedViolation({ ...editedViolation, notes: e.target.value })}
              rows={3}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white resize-none"
              placeholder="Add notes about this violation..."
            />
          </div>
        </div>

        <div className="sticky bottom-0 bg-slate-900 border-t border-slate-700 px-6 py-4 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}

export function AttireComplianceEventsPage() {
  const [violations, setViolations] = useState<AttireViolation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const normalizeView = (v?: string) => {
          const s = (v || "").toLowerCase().trim();
          return s || "normal";
        };

        // 1a) Load video names (id -> name)
        const map: Record<string, string> = { webcam: "Webcam" };
        const resVideos = await fetch(`${API_BASE}/api/offline/videos`);
        if (resVideos.ok) {
          const vids = await resVideos.json();
          (Array.isArray(vids) ? vids : []).forEach((v: any) => {
            if (v?.id) map[v.id] = v.name || v.id;
          });
        }

        // 1b) Load RTSP sources (id -> name)
        const resRtsp = await fetch(`${API_BASE}/api/rtsp/sources`);
        let sources: any[] = [];
        if (resRtsp.ok) {
          const j = await resRtsp.json();
          sources = Array.isArray(j.sources) ? j.sources : [];
          sources.forEach((s: any) => {
            if (s?.id) map[s.id] = s.name || s.id;
          });
        }

        // 2a) Load events
        const res = await fetch(`${API_BASE}/api/attire/events`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const events: BackendAttireEvent[] = data.events || [];

        // 2b) Build (video_id -> (view_name -> view_label)) map
        const uniqVideoIds = Array.from(
          new Set(
            (events || [])
              .map((e) => String(e.video_id || "").trim())
              .filter(Boolean)
          )
        );

        const viewLabelByVideo: Record<string, Record<string, string>> = {};
        await Promise.all(
          uniqVideoIds.map(async (vid) => {
            try {
              viewLabelByVideo[vid] = await apiGetDewarpLabels(vid);
            } catch {
              viewLabelByVideo[vid] = {};
            }
          })
        );

        // 3) Build RTSP id set once
        const rtspIdSet = new Set(
          Array.isArray(sources)
            ? sources.map((s: any) => String(s?.id || ""))
            : []
        );

        // 4) Map events -> UI
        const mapped: AttireViolation[] = events.map((e) => {
          const srcName =
            (e.video_id && map[e.video_id]) ||
            e.video_name ||
            e.video_id ||
            "Unknown Source";

          const vid = e.video_id || "";
          const backendSource = String(e.source || "").trim();

          let sourceUi: AttireViolation["source"] = "Uploaded Video";

          if (vid === "webcam" || backendSource === "Webcam" || backendSource === "Live Detection") {
            sourceUi = "Webcam";
          } else if (
            backendSource === "Live RTSP" ||
            backendSource === "RTSP Stream" ||
            rtspIdSet.has(vid)
          ) {
            sourceUi = "Live RTSP";
          } else {
            sourceUi = "Uploaded Video";
          }

          let viewKey = normalizeView(e.view);
          if (!viewKey && e.location && String(e.location).includes(",")) {
            viewKey = normalizeView(
              String(e.location).split(",").slice(1).join(",")
            );
          }

          const viewLabel =
            (vid && viewLabelByVideo[vid]?.[viewKey]) ||
            viewKey ||
            "normal";

          return {
            id: e.id,
            videoId: vid,
            view: viewLabel,
            imageUrl: e.evidence_url ? `${API_BASE}${e.evidence_url}` : "",
            violationType: labelToViolationType(e.label),
            status: e.status || "Pending",
            location: `${srcName}, ${viewLabel}`,
            detectionDate: new Date(((e.ts || 0) * 1000) || Date.now()),
            source: sourceUi,
            videoName: srcName,
            notes:
              e.notes ||
              (e.conf != null
                ? `conf=${Number(e.conf).toFixed(2)}`
                : undefined),
          };
        });

        if (alive) setViolations(mapped);
      } catch (err: any) {
        if (alive) setError(err?.message || "Failed to load events");
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, []);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('All');
  const [filterStatus, setFilterStatus] = useState<string>('All');
  const [selectedViolation, setSelectedViolation] = useState<AttireViolation | null>(null);
  const [editingViolation, setEditingViolation] = useState<AttireViolation | null>(null);
  
  const [modalZoom, setModalZoom] = useState(1);
  const [modalOffset, setModalOffset] = useState({ x: 0, y: 0 });
  const [isDraggingZoomedImage, setIsDraggingZoomedImage] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const dragOriginRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    setModalZoom(1);
    setModalOffset({ x: 0, y: 0 });
    setIsDraggingZoomedImage(false);
  }, [selectedViolation?.id]);

  useEffect(() => {
    if (!selectedViolation) return;

    const prevBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = prevBodyOverflow;
    };
  }, [selectedViolation]);

  const filteredViolations = violations.filter(violation => {
    const matchesSearch = violation.violationType.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         violation.location.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         (violation.notes?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false);
    const matchesType = filterType === 'All' || violation.violationType === filterType;
    const matchesStatus = filterStatus === 'All' || violation.status === filterStatus;
    return matchesSearch && matchesType && matchesStatus;
  });

  const handleStatusToggle = async (violationId: string) => {
    const prev = violations.find(v => v.id === violationId);
    if (!prev) return;

    const nextStatus: AttireViolation["status"] =
      prev.status === "Pending" ? "Resolved" : "Pending";

    // ✅ optimistic UI update (list)
    setViolations(p =>
      p.map(v => (v.id === violationId ? { ...v, status: nextStatus } : v))
    );

    // ✅ optimistic UI update (modal)
    setSelectedViolation(s =>
      s && s.id === violationId ? { ...s, status: nextStatus } : s
    );

    try {
      await apiPatchEvent(violationId, { status: nextStatus });
    } catch (e) {
      // ❌ revert if backend fails
      setViolations(p =>
        p.map(v => (v.id === violationId ? { ...v, status: prev.status } : v))
      );
      setSelectedViolation(s =>
        s && s.id === violationId ? { ...s, status: prev.status } : s
      );
      alert((e as any)?.message || "Failed to update status");
    }
  };

  const handleDelete = async (violationId: string) => {
    if (!confirm("Are you sure you want to delete this violation record?")) return;

    // optimistic remove
    setViolations(prev => prev.filter(v => v.id !== violationId));
    setSelectedViolation(null);

    try {
      await apiDeleteEvent(violationId);
    } catch (e) {
      alert((e as any)?.message || "Failed to delete from backend (refresh may bring it back)");
    }
  };

  const handleEdit = (violation: AttireViolation) => {
    setEditingViolation(violation);
  };

  const handleSaveEdit = async (updatedViolation: AttireViolation) => {
    // optimistic UI
    setViolations(prev => prev.map(v => (v.id === updatedViolation.id ? updatedViolation : v)));
    setSelectedViolation(s => (s && s.id === updatedViolation.id ? updatedViolation : s));

    try {
      await apiPatchEvent(updatedViolation.id, {
        status: updatedViolation.status,
        location: updatedViolation.location,
        notes: updatedViolation.notes || "",
        // optional: also persist label if you want
        // label: updatedViolation.violationType.toLowerCase()
      });
    } catch (e) {
      alert((e as any)?.message || "Failed to save edit to backend");
    }
  };

  const getViolationIcon = (type: string) => {
    const iconMap: { [key: string]: string } = {
      'Sleeveless': '👕',
      'Shorts': '🩳',
      'Slippers': '🩴',
    };
    return iconMap[type] || '⚠️';
  };

  const pendingCount = violations.filter(v => v.status === 'Pending').length;
  const resolvedCount = violations.filter(v => v.status === 'Resolved').length;

  const [videoNameMap, setVideoNameMap] = useState<Record<string, string>>({});

  const clampZoom = (z: number) => Math.max(1, Math.min(5, z));

  const handleModalImageWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    const delta = e.deltaY > 0 ? -0.2 : 0.2;
    const nextZoom = clampZoom(modalZoom + delta);

    if (nextZoom === 1) {
      setModalOffset({ x: 0, y: 0 });
    }

    setModalZoom(nextZoom);
  };

  const handleModalImageMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (modalZoom <= 1) return;

    setIsDraggingZoomedImage(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    dragOriginRef.current = { ...modalOffset };
  };

  const handleModalImageMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDraggingZoomedImage || modalZoom <= 1) return;

    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;

    setModalOffset({
      x: dragOriginRef.current.x + dx,
      y: dragOriginRef.current.y + dy,
    });
  };

  const handleModalImageMouseUp = () => {
    setIsDraggingZoomedImage(false);
  };

  const handleModalImageMouseLeave = () => {
    setIsDraggingZoomedImage(false);
  };

  const resetModalImageZoom = () => {
    setModalZoom(1);
    setModalOffset({ x: 0, y: 0 });
    setIsDraggingZoomedImage(false);
  };

  return (
    <div className="flex-1 p-6 overflow-y-auto text-[15px] [&_h3]:text-xl [&_h3]:font-semibold [&_h4]:text-lg [&_h4]:font-semibold [&_label]:text-sm">
      {/* Page Header */}
      <div className="mb-6">
        <h2 className="text-white text-2xl font-semibold mb-1">Attire Compliance Management</h2>
        <p className="text-slate-400 text-[15px]">
          Track and manage dress code violations detected in the university
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-5">
          <div className="text-slate-400 text-[15px] mb-1">Total Violations</div>
          <div className="text-white text-[2rem] font-semibold">{violations.length}</div>
        </div>

        <div className="bg-slate-900/50 border border-red-900/30 rounded-lg p-5">
          <div className="text-slate-400 text-[15px] mb-1">Pending</div>
          <div className="text-red-400 text-[2rem] font-semibold">{pendingCount}</div>
        </div>

        <div className="bg-slate-900/50 border border-green-900/30 rounded-lg p-5">
          <div className="text-slate-400 text-[15px] mb-1">Resolved</div>
          <div className="text-green-400 text-[2rem] font-semibold">{resolvedCount}</div>
        </div>

        <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-5">
          <div className="text-slate-400 text-[15px] mb-1">Detection Sources</div>
          <div className="text-white text-[15px] mt-1 leading-6">
            Live RTSP: {violations.filter(v => v.source === 'Live RTSP').length} |
            Webcam: {violations.filter(v => v.source === 'Webcam').length} |
            Upload: {violations.filter(v => v.source === 'Uploaded Video').length}
          </div>
        </div>
      </div>

      {/* Loading / Error */}
      {loading && (
        <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4 mb-6 text-slate-300">
          Loading events...
        </div>
      )}

      {error && (
        <div className="bg-red-900/20 border border-red-900/40 rounded-lg p-4 mb-6 text-red-300">
          Failed to load events: {error}
        </div>
      )}

      {/* Filters and Search */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4 mb-6">
        <div className="flex items-center gap-4">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-slate-400" />
            <input
              type="text"
              placeholder="Search violations, locations, or notes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-11 pr-4 py-2.5 text-white text-[15px] placeholder-slate-400 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Type Filter */}
          <div className="flex items-center gap-2">
            <Filter className="w-[18px] h-[18px] text-slate-400" />
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white text-[15px]"
            >
              <option>All</option>
              <option>Sleeveless</option>
              <option>Shorts</option>
              <option>Slippers</option>
            </select>
          </div>

          {/* Status Filter */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white text-[15px]"
          >
            <option>All</option>
            <option>Pending</option>
            <option>Resolved</option>
          </select>
        </div>
      </div>

      {/* Violations Grid */}
      <div className="w-full pb-2">
        <div
          className="grid gap-4 w-full"
          style={{
            gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
            alignItems: "start",
          }}
        >
          {filteredViolations.map((violation) => (
            <button
              key={violation.id}
              type="button"
              onClick={() => setSelectedViolation(violation)}
              className="w-full min-w-0 h-[340px] text-left bg-slate-900/50 border border-slate-800 rounded-lg overflow-hidden
                          hover:border-blue-500 transition-colors flex flex-col"
            >
              {/* fixed image height */}
              <div
                className="relative w-full bg-slate-950 overflow-hidden flex-shrink-0"
                style={{ height: 160 }}
              >
                <img
                  src={violation.imageUrl}
                  alt={violation.violationType}
                  className="w-full h-full block"
                  style={{ objectFit: "cover", objectPosition: "center" }}
                  loading="lazy"
                />

                <div className="absolute top-2 left-2">
                  <div
                    className={`px-2.5 py-1 rounded text-[13px] font-medium ${
                      violation.status === "Pending"
                        ? "bg-red-500/90 text-white"
                        : "bg-green-500/90 text-white"
                    }`}
                  >
                    {violation.status}
                  </div>
                </div>

                <div className="absolute top-2 right-2">
                  <div className="bg-black/60 backdrop-blur-sm px-2.5 py-1 rounded text-[13px] text-white">
                    {violation.source}
                  </div>
                </div>
              </div>

              {/* info area */}
              <div className="p-3.5 flex-1 min-h-0 flex flex-col">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-2xl">{getViolationIcon(violation.violationType)}</span>
                  <h3 className="text-white text-[15px] font-semibold truncate">
                    {violation.violationType}
                  </h3>
                </div>

                <div className="space-y-1.5 text-sm">
                  <div className="flex items-center gap-2 text-slate-400">
                    <MapPin className="w-4 h-4 flex-shrink-0" />
                    <span className="truncate">{violation.location}</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-400">
                    <Calendar className="w-4 h-4 flex-shrink-0" />
                    <span>{violation.detectionDate.toLocaleDateString()}</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-400">
                    <Clock className="w-4 h-4 flex-shrink-0" />
                    <span>{violation.detectionDate.toLocaleTimeString()}</span>
                  </div>
                </div>

                {/* notes pinned bottom */}
                <div className="mt-auto pt-2 h-[42px] text-slate-400 text-sm overflow-hidden">
                  <p className="line-clamp-2">{violation.notes || ""}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
      {!loading && filteredViolations.length === 0 && (
        <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-12 text-center">
          <p className="text-slate-400 text-[15px]">No violations found matching your filters</p>
        </div>
      )}

      {/* Detail Modal */}
      {selectedViolation && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => setSelectedViolation(null)}
        >
          <div
            className="bg-slate-900 border border-slate-700 rounded-xl w-full overflow-hidden flex flex-col"
            style={{ maxWidth: 720, maxHeight: "80vh" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* header */}
            <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between">
              <h3 className="text-white text-lg font-semibold">Violation Details</h3>
              <button
                onClick={() => setSelectedViolation(null)}
                className="p-2 hover:bg-slate-800 rounded-lg transition-colors text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* body scroll */}
            <div className="p-6 overflow-y-auto" style={{ minHeight: 0 }}>
              {/* ✅ image shown fully, never crop */}
              <div className="mb-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-slate-400 text-sm">
                    Hover and scroll to zoom
                  </span>
                  <button
                    type="button"
                    onClick={resetModalImageZoom}
                    className="text-xs px-3 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-white transition-colors"
                  >
                    Reset Zoom
                  </button>
                </div>

                <div
                  className="bg-black/20 rounded-lg overflow-hidden flex items-center justify-center select-none"
                  style={{
                    width: "100%",
                    height: 260,
                    cursor: modalZoom > 1 ? (isDraggingZoomedImage ? "grabbing" : "grab") : "zoom-in",
                    overscrollBehavior: "contain",
                  }}
                  onWheel={handleModalImageWheel}
                  onMouseDown={handleModalImageMouseDown}
                  onMouseMove={handleModalImageMouseMove}
                  onMouseUp={handleModalImageMouseUp}
                  onMouseLeave={handleModalImageMouseLeave}
                >
                  <img
                    src={selectedViolation.imageUrl || "/placeholder.jpg"}
                    onError={(e) => (e.currentTarget.src = "/placeholder.jpg")}
                    alt={selectedViolation.violationType}
                    draggable={false}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "contain",
                      objectPosition: "center",
                      display: "block",
                      transform: `translate(${modalOffset.x}px, ${modalOffset.y}px) scale(${modalZoom})`,
                      transformOrigin: "center center",
                      transition: isDraggingZoomedImage ? "none" : "transform 0.12s ease-out",
                    }}
                  />
                </div>
              </div>

              {/* details */}
              <div className="grid grid-cols-2 gap-5 mb-5">
                <div>
                  <label className="text-slate-400 text-sm">Violation Type</label>
                  <div className="text-white mt-1 flex items-center gap-2 text-[15px]">
                    <span className="text-xl">{getViolationIcon(selectedViolation.violationType)}</span>
                    {selectedViolation.violationType}
                  </div>
                </div>

                <div>
                  <label className="text-slate-400 text-sm">Status</label>
                  <div className="mt-1">
                    <span
                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs ${
                        selectedViolation.status === "Pending"
                          ? "bg-red-500/20 text-red-400"
                          : "bg-green-500/20 text-green-400"
                      }`}
                    >
                      {selectedViolation.status === "Pending" ? (
                        <AlertCircle className="w-4 h-4" />
                      ) : (
                        <CheckCircle className="w-4 h-4" />
                      )}
                      {selectedViolation.status}
                    </span>
                  </div>
                </div>

                <div>
                  <label className="text-slate-400 text-sm">Location</label>
                  <div className="text-white mt-1 flex items-center gap-2 text-[15px]">
                    <MapPin className="w-4 h-4 text-slate-400" />
                    {selectedViolation.location}
                  </div>
                </div>

                <div>
                  <label className="text-slate-400 text-sm">Detection Date & Time</label>
                  <div className="text-white mt-1 text-[15px]">
                    {selectedViolation.detectionDate.toLocaleDateString()} at{" "}
                    {selectedViolation.detectionDate.toLocaleTimeString()}
                  </div>
                </div>

                <div>
                  <label className="text-slate-400 text-sm">Detection Source</label>
                  <div className="text-white mt-1 text-[15px]">{selectedViolation.source}</div>
                </div>

                {selectedViolation.videoName && (
                  <div>
                    <label className="text-slate-400 text-sm">Video File</label>
                    <div className="text-white mt-1 text-sm truncate">
                      {selectedViolation.videoName}
                    </div>
                  </div>
                )}
              </div>

              {selectedViolation.notes && (
                <div className="mb-5">
                  <label className="text-slate-400 text-sm">Notes</label>
                  <div className="text-white mt-1 bg-slate-800/50 p-3 rounded-lg text-sm">
                    {selectedViolation.notes}
                  </div>
                </div>
              )}

              {/* actions */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => handleStatusToggle(selectedViolation.id)}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg transition-colors text-sm ${
                    selectedViolation.status === "Pending"
                      ? "bg-green-600 hover:bg-green-700 text-white"
                      : "bg-red-600 hover:bg-red-700 text-white"
                  }`}
                >
                  {selectedViolation.status === "Pending" ? (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      Mark as Resolved
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-4 h-4" />
                      Mark as Pending
                    </>
                  )}
                </button>

                <button
                  onClick={() => handleEdit(selectedViolation)}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm"
                >
                  <Edit2 className="w-4 h-4" />
                  Edit
                </button>

                <button
                  onClick={() => handleDelete(selectedViolation.id)}
                  className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors text-sm"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingViolation && (
        <EditModal
          violation={editingViolation}
          onSave={handleSaveEdit}
          onClose={() => setEditingViolation(null)}
        />
      )}
    </div>
  );
}

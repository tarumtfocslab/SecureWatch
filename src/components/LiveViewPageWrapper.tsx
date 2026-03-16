import { useEffect, useState } from "react";
import LostAndFoundLiveView from "./LostAndFoundLiveView";
import { AttireComplianceLiveView } from "./AttireComplianceLiveView";

const LOSTFOUND_API_BASE =
  (import.meta as any).env?.VITE_LOSTFOUND_API_BASE?.replace(/\/$/, "") ||
  "http://127.0.0.1:8000";

const ATTIRE_API_BASE =
  (import.meta as any).env?.VITE_ATTIRE_API_BASE?.replace(/\/$/, "") ||
  "http://127.0.0.1:8001";

type MonitoringMode = "lost-found" | "attire";

function getApiBase(mode: MonitoringMode) {
  return mode === "lost-found" ? LOSTFOUND_API_BASE : ATTIRE_API_BASE;
}

export function LiveViewPageWrapper({
  monitoringMode,
}: {
  monitoringMode: MonitoringMode;
}) {
  const [mountKey, setMountKey] = useState<string>(`live-${monitoringMode}-${Date.now()}`);

  useEffect(() => {
    const API_BASE = getApiBase(monitoringMode);

    console.log("[LiveViewPageWrapper] Mounted / mode =", monitoringMode);

    const clearStaticCache = async () => {
      try {
        if (monitoringMode === "lost-found") {
          await fetch(`${API_BASE}/api/settings/clear_static_cache`, {
            method: "POST",
            cache: "no-store",
            headers: {
              "Cache-Control": "no-cache",
            },
          });
          console.log("[LiveViewPageWrapper] Lost & Found static cache cleared");
        }
      } catch (err) {
        console.warn("[LiveViewPageWrapper] Failed to clear static cache:", err);
      }
    };

    clearStaticCache();
    setMountKey(`live-${monitoringMode}-${Date.now()}`);

    return () => {
      console.log("[LiveViewPageWrapper] Unmounting / mode =", monitoringMode);

      const images = document.querySelectorAll("img");
      images.forEach((img) => {
        if (img instanceof HTMLImageElement) {
          const src = img.getAttribute("src") || "";
          if (
            src.includes("/api/live/mjpeg/") ||
            src.includes("/api/offline/stream/") ||
            src.includes("/api/rtsp/stream/") ||
            src.includes("/api/live/webcam/stream")
          ) {
            img.src = "";
            img.removeAttribute("src");
          }
        }
      });
    };
  }, [monitoringMode]);

  const currentApiBase = getApiBase(monitoringMode);

  return (
    <main className="flex-1 flex flex-col overflow-hidden bg-slate-950">
      <div className="px-6 py-2 border-b border-slate-800/50 bg-slate-900/30">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span className="inline-flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Live Mode: {monitoringMode === "lost-found" ? "Lost & Found" : "Attire Compliance"}
          </span>
          <span className="text-slate-600">|</span>
          <span className="text-slate-500">
            Connected to: {currentApiBase.replace(/^https?:\/\//, "")}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-hidden" key={mountKey}>
        {monitoringMode === "lost-found" ? (
          <LostAndFoundLiveView mode="lost-found" />
        ) : (
          <AttireComplianceLiveView />
        )}
      </div>
    </main>
  );
}

export default LiveViewPageWrapper;
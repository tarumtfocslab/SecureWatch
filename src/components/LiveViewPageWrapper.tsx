import { useEffect, useState } from "react";
import LostAndFoundLiveView from "./LostAndFoundLiveView";
import { AttireComplianceLiveView } from "./AttireComplianceLiveView";
import { getApiBase } from "../api/base";

type MonitoringMode = "lost-found" | "attire";

export function LiveViewPageWrapper({
  monitoringMode,
}: {
  monitoringMode: MonitoringMode;
}) {
  const [mountKey, setMountKey] = useState<string>(`live-${monitoringMode}-${Date.now()}`);

  useEffect(() => {
    const API_BASE = getApiBase(monitoringMode);

    const clearStaticCache = async () => {
      try {
        if (monitoringMode === "lost-found" && API_BASE) {
          await fetch(`${API_BASE}/api/settings/clear_static_cache`, {
            method: "POST",
            cache: "no-store",
            headers: {
              "Cache-Control": "no-cache",
            },
          });
        }
      } catch (err) {
        console.warn("[LiveViewPageWrapper] Failed to clear static cache:", err);
      }
    };

    clearStaticCache();
    setMountKey(`live-${monitoringMode}-${Date.now()}`);

    return () => {
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
            Connected to: {currentApiBase ? currentApiBase.replace(/^https?:\/\//, "") : "NOT CONFIGURED"}
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
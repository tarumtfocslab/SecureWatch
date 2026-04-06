import LostAndFoundEventsPage from './LostAndFoundPage';
import { AttireComplianceEventsPage } from './AttireComplianceEventsPage';
import { usePersistedState } from "../hooks/usePersistedState";
import { useEffect } from "react";

export function EventsPage() {
  const [activeModule, setActiveModule] = usePersistedState<
    'lost-found' | 'attire'
  >('events:activeModule', 'lost-found');

  useEffect(() => {
    const syncModule = () => {
      const saved = localStorage.getItem('events:activeModule');
      if (saved === 'lost-found' || saved === 'attire') {
        setActiveModule(saved);
      }
    };

    syncModule();

    window.addEventListener('events:moduleChanged', syncModule);
    window.addEventListener('nav:changed', syncModule);

    return () => {
      window.removeEventListener('events:moduleChanged', syncModule);
      window.removeEventListener('nav:changed', syncModule);
    };
  }, [setActiveModule]);

  return (
    <main className="flex-1 flex flex-col overflow-hidden">
      {/* Module Tabs */}
      <div className="px-6 pt-6">
        <div className="flex items-center gap-2 bg-slate-800/30 p-1 rounded-lg w-fit">
          <button
            onClick={() => {
              setActiveModule('lost-found');
              localStorage.setItem('events:activeModule', 'lost-found');
              window.dispatchEvent(new Event('events:moduleChanged'));
            }}
            className={`px-6 py-2 rounded-md transition-colors ${
              activeModule === 'lost-found'
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Lost & Found
          </button>

          <button
            onClick={() => {
              setActiveModule('attire');
              localStorage.setItem('events:activeModule', 'attire');
              window.dispatchEvent(new Event('events:moduleChanged'));
            }}
            className={`px-6 py-2 rounded-md transition-colors ${
              activeModule === 'attire'
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Attire Compliance
          </button>
        </div>
      </div>

      {/* Module Header */}
      <div className="px-6 pt-4">
        {activeModule === 'lost-found' && (
          <>
            <h1 className="text-2xl font-semibold text-white">
              Lost & Found Events
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              This page displays detected unattended items and their tracking status from CCTV surveillance.
            </p>
          </>
        )}
      </div>

      {/* Module Content */}
      <div className="flex-1 overflow-hidden pt-4">
        {activeModule === 'lost-found' ? (
          <LostAndFoundEventsPage />
        ) : (
          <AttireComplianceEventsPage />
        )}
      </div>
    </main>
  );
}
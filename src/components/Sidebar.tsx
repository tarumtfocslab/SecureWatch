// Sidebar.tsx
import {
  LayoutDashboard,
  Video,
  Settings,
  Users,
  History,
  Upload,
  LogOut,
  FileText,
} from "lucide-react";

type AppPage =
  | "dashboard"
  | "live-attire"
  | "live-lostfound"
  | "reports"
  | "events"
  | "settings"
  | "upload-video"
  | "users";

type UserRole = "Admin" | "Security" | "Staff" | "Viewer";

interface SidebarProps {
  currentPage: AppPage;
  onPageChange: (page: AppPage) => void;
  onLogout?: () => void | Promise<void>;
  currentUser?: {
    name: string;
    role: string;
  };
  role?: UserRole;
}

type MenuItem = {
  id: AppPage;
  label: string;
  icon: any;
  hiddenFor?: UserRole[];
};

const menuItems: MenuItem[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
  },
  {
    id: "live-lostfound",
    label: "Live View (Lost & Found)",
    icon: Video,
  },
  {
    id: "live-attire",
    label: "Live View (Attire)",
    icon: Video,
  },
  {
    id: "reports",
    label: "Reports",
    icon: FileText,
  },
  {
    id: "events",
    label: "Events",
    icon: History,
  },
  {
    id: "settings",
    label: "Settings",
    icon: Settings,
    hiddenFor: ["Viewer"],
  },
  {
    id: "upload-video",
    label: "Upload Video",
    icon: Upload,
    hiddenFor: ["Viewer"],
  },
  {
    id: "users",
    label: "Users",
    icon: Users,
    hiddenFor: ["Viewer", "Security", "Staff"],
  },
];

export function Sidebar({
  currentPage,
  onPageChange,
  onLogout,
  currentUser,
  role = "Viewer",
}: SidebarProps) {
  const visibleItems = menuItems.filter(
    (item) => !item.hiddenFor?.includes(role)
  );

  const initials = (currentUser?.name || "Admin User")
    .split(" ")
    .map((x) => x[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const displayRole =
    currentUser?.role ||
    (role === "Admin"
      ? "Security Team"
      : role === "Security"
      ? "Security Team"
      : role === "Staff"
      ? "Staff"
      : "Viewer");

  return (
    <aside className="w-72 h-screen shrink-0 sticky top-0 bg-slate-900 border-r border-slate-800 flex flex-col">
      {/* Logo */}
      <button
        type="button"
        onClick={() => onPageChange("dashboard")}
        className="p-6 border-b border-slate-800 w-full text-left hover:bg-slate-800/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
            <Video className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-white">SecureWatch</h2>
            <p className="text-slate-400 text-xs mt-0.5">Pro v2.0</p>
          </div>
        </div>
      </button>

      {/* Navigation */}
      <nav className="flex-1 p-4 overflow-y-auto">
        <div className="space-y-1">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentPage === item.id;

            return (
              <button
                key={item.id}
                onClick={() => onPageChange(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors text-left ${
                  isActive
                    ? "bg-blue-600 text-white"
                    : "text-slate-400 hover:text-white hover:bg-slate-800"
                }`}
              >
                <Icon className="w-5 h-5 shrink-0" />
                <span className="flex-1 truncate whitespace-nowrap">
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-slate-700 rounded-full flex items-center justify-center">
            <span className="text-white">{initials}</span>
          </div>

          <div className="flex-1 min-w-0">
            <div className="text-white text-sm truncate">
              {currentUser?.name ?? "Admin User"}
            </div>
            <div className="text-slate-400 text-xs truncate">
              {displayRole}
            </div>
          </div>

          <button
            onClick={onLogout}
            className="text-slate-400 hover:text-white"
            title="Logout"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>
    </aside>
  );
}
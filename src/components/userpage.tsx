// UserPage.tsx
import { useEffect, useMemo, useState } from "react";
import { api } from "../api/apiHelper";
import {
  Plus,
  Search,
  Trash2,
  Edit2,
  X,
  Shield,
  User as UserIcon,
} from "lucide-react";

type Role = "Admin" | "Security" | "Staff" | "Viewer";
type Status = "Active" | "Disabled";

export interface AppUser {
  id: string;
  name: string;
  username: string;
  email: string;
  role: Role;
  status: Status;
  createdAt: string;
  password?: string;
}

function uid() {
  return "u-" + Math.random().toString(16).slice(2, 10);
}

function ModalShell({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="text-white">{title}</div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

export function UsersPage() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const r = await api<{ users: AppUser[] }>("/api/users");
      setUsers(r.users || []);
    })()
      .catch((e) => alert(e.message))
      .finally(() => setLoading(false));
  }, []);

  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<Role | "All">(
    "All",
  );
  const [statusFilter, setStatusFilter] = useState<
    Status | "All"
  >("All");

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<AppUser | null>(null);
  const [deleting, setDeleting] = useState<AppUser | null>(
    null,
  );

  const filtered = useMemo(() => {
    return users.filter((u) => {
      const q = query.trim().toLowerCase();
      const matchesQ =
        !q ||
        u.name.toLowerCase().includes(q) ||
        u.username?.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q);

      const matchesRole =
        roleFilter === "All" || u.role === roleFilter;
      const matchesStatus =
        statusFilter === "All" || u.status === statusFilter;

      return matchesQ && matchesRole && matchesStatus;
    });
  }, [users, query, roleFilter, statusFilter]);

  const adminCount = users.filter(
    (u) => u.role === "Admin",
  ).length;

  const createUser = async (
    payload: Omit<AppUser, "id" | "createdAt">
  ) => {
    const r = await api<{ user: AppUser }>("/api/users", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    setUsers((prev) => [r.user, ...prev]);
  };

  const updateUser = async (payload: AppUser) => {
    const r = await api<{ user: AppUser }>(`/api/users/${payload.id}`, {
      method: "PUT",
      body: JSON.stringify({
        name: payload.name,
        username: payload.username,
        email: payload.email,
        role: payload.role,
        status: payload.status,
        ...(payload.password ? { password: payload.password } : {}),
      }),
    });

    setUsers((prev) =>
      prev.map((u) => (u.id === payload.id ? r.user : u)),
    );
  };

  const deleteUser = async (id: string) => {
    await api(`/api/users/${id}`, { method: "DELETE" });
    setUsers((prev) => prev.filter((u) => u.id !== id));
  };

  return (
    <div className="flex-1 p-6 overflow-y-auto text-[15px]">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-4xl font-bold text-white tracking-tight mb-2">
          User Management
        </h2>
        <p className="text-base text-slate-400 max-w-2xl">
          Manage system users, roles, and access permissions within SecureWatch.
        </p>
      </div>

      {/* Top controls */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4 mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[240px] relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              name="users_search"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, username, email, role..."
              className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-10 pr-4 py-2 text-white placeholder-slate-400 focus:outline-none focus:border-blue-500"
            />
          </div>

          <select
            value={roleFilter}
            onChange={(e) =>
              setRoleFilter(e.target.value as any)
            }
            className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white"
          >
            <option value="All">All Roles</option>
            <option value="Admin">Admin</option>
            <option value="Security">Security</option>
            <option value="Staff">Staff</option>
            <option value="Viewer">Viewer</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as any)
            }
            className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white"
          >
            <option value="All">All Status</option>
            <option value="Active">Active</option>
            <option value="Disabled">Disabled</option>
          </select>

          <button
            onClick={() => setCreateOpen(true)}
            className="ml-auto flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add User
          </button>
        </div>

        <div className="mt-3 text-slate-400 text-sm flex items-center gap-2">
          <Shield className="w-4 h-4 text-slate-400" />
          Admin accounts:{" "}
          <span className="text-white">{adminCount}</span>
        </div>
      </div>

      {/* Table */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="text-white">Users</div>
          <div className="text-slate-400 text-sm">
            {filtered.length} shown
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-800/50">
              <tr>
                <th className="px-6 py-3 text-left text-xs text-slate-400 uppercase tracking-wider">
                  User
                </th>
                <th className="px-6 py-3 text-left text-xs text-slate-400 uppercase tracking-wider">
                  Username
                </th>
                <th className="px-6 py-3 text-left text-xs text-slate-400 uppercase tracking-wider">
                  Role
                </th>
                <th className="px-6 py-3 text-left text-xs text-slate-400 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs text-slate-400 uppercase tracking-wider">
                  Created
                </th>
                <th className="px-6 py-3 text-right text-xs text-slate-400 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-800">
              {filtered.map((u) => (
                <tr
                  key={u.id}
                  className="hover:bg-slate-800/30"
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center">
                        <UserIcon className="w-5 h-5 text-slate-300" />
                      </div>
                      <div>
                        <div className="text-white">
                          {u.name}
                        </div>
                        <div className="text-slate-400 text-sm">
                          @{u.username}
                        </div>
                        <div className="text-slate-400 text-sm">
                          {u.email}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-200">
                    {u.username}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-200">
                    {u.role}
                  </td>

                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs ${
                        u.status === "Active"
                          ? "bg-green-500/20 text-green-400"
                          : "bg-red-500/20 text-red-400"
                      }`}
                    >
                      {u.status}
                    </span>
                  </td>

                  <td className="px-6 py-4 text-sm text-slate-300">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </td>

                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => setEditing(u)}
                        className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white"
                        title="Edit"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>

                      <button
                        onClick={() => setDeleting(u)}
                        className="p-2 rounded-lg bg-red-600/20 hover:bg-red-600/30 text-red-300"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {loading ? (
          <div className="px-6 py-12 text-center text-slate-400">
            Loading users...
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-6 py-12 text-center text-slate-400">
            No users found.
          </div>
        ) : null}
      </div>

      {/* Add modal */}
      {createOpen && (
        <UserFormModal
          title="Add User"
          onClose={() => {
            setCreateOpen(false);
            setQuery("");     
          }}
          onSubmit={async (data) => {
            await createUser(data);
            setCreateOpen(false);
            setQuery("");    
          }}
        />
      )}

      {/* Edit modal */}
      {editing && (
        <UserFormModal
          title="Edit User"
          initial={editing}
          onClose={() => {
            setEditing(null);
            setQuery("");       
          }}
          onSubmit={async (data) => {
            await updateUser({ ...editing, ...data });
            setEditing(null);
            setQuery("");       
          }}
        />
      )}

      {/* Delete confirm */}
      {deleting && (
        <ModalShell
          title="Delete User"
          onClose={() => setDeleting(null)}
        >
          <div className="text-slate-200">
            Delete{" "}
            <span className="text-white font-medium">
              {deleting.name}
            </span>
            ? This action cannot be undone.
          </div>

          {/* Safety: prevent deleting last admin */}
          {deleting.role === "Admin" && adminCount <= 1 && (
            <div className="mt-3 bg-yellow-900/20 border border-yellow-800 rounded-lg p-3 text-yellow-300 text-sm">
              You can’t delete the last Admin account.
            </div>
          )}

          <div className="mt-6 flex justify-end gap-2">
            <button
              onClick={() => setDeleting(null)}
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white"
            >
              Cancel
            </button>

            <button
              disabled={deleting.role === "Admin" && adminCount <= 1}
              onClick={async () => {
                await deleteUser(deleting.id);
                setDeleting(null);
              }}
              className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white disabled:opacity-50 disabled:hover:bg-red-600"
            >
              Delete
            </button>
          </div>
        </ModalShell>
      )}
    </div>
  );
}

function UserFormModal({
  title,
  initial,
  onClose,
  onSubmit,
}: {
  title: string;
  initial?: AppUser;
  onClose: () => void;
  onSubmit: (data: Omit<AppUser, "id" | "createdAt">) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [username, setUsername] = useState(initial?.username ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [role, setRole] = useState<Role>(
    initial?.role ?? "Viewer",
  );
  const [status, setStatus] = useState<Status>(
    initial?.status ?? "Active",
  );
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  return (
    <ModalShell title={title} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="block text-slate-400 text-sm mb-2">
            Full Name
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white"
            placeholder="e.g., Wong Jin Xuan"
          />
        </div>
        <div>
          <label className="block text-slate-400 text-sm mb-2">Username</label>
          <input
            id="new_user_username"
            name="new_user_username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white"
            placeholder="e.g., admin"
            autoComplete="new-username"
          />
        </div>
        <div>
          <label className="block text-slate-400 text-sm mb-2">
            Email
          </label>
          <input
            id="new_user_email"
            name="new_user_email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white"
            placeholder="e.g., user@domain.com"
            autoComplete="off"
          />
        </div>

        <div>
          <label className="block text-slate-400 text-sm mb-2">
            Password{" "}
            {initial ? "(Leave blank to keep current)" : ""}
          </label>
          <input
            type="password"
            id="new_user_password"
            name="new_user_password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white"
            placeholder={initial ? "••••••••" : "Enter password"}
            autoComplete="new-password"
          />
        </div>

        <div>
          <label className="block text-slate-400 text-sm mb-2">
            Confirm Password
          </label>
          <input
            type="password"
            id="new_user_confirm_password"
            name="new_user_confirm_password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white"
            placeholder="Confirm password"
            autoComplete="new-password"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-slate-400 text-sm mb-2">
              Role
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white"
            >
              <option value="Admin">Admin</option>
              <option value="Security">Security</option>
              <option value="Staff">Staff</option>
              <option value="Viewer">Viewer</option>
            </select>
            <p className="text-slate-500 text-xs mt-1">
              Admin can manage users & settings.
            </p>
          </div>

          <div>
            <label className="block text-slate-400 text-sm mb-2">
              Status
            </label>
            <select
              value={status}
              onChange={(e) =>
                setStatus(e.target.value as Status)
              }
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white"
            >
              <option value="Active">Active</option>
              <option value="Disabled">Disabled</option>
            </select>
          </div>
        </div>

        <div className="pt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              if (!initial && password.length < 6) {
                alert("Password must be at least 6 characters");
                return;
              }

              if (password !== confirmPassword) {
                alert("Passwords do not match");
                return;
              }

              onSubmit({
                name,
                username,
                email,
                role,
                status,
                ...(password ? { password } : {}),
              });
            }}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white"
          >
            Save
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
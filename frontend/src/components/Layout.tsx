import { ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard, Database, FolderGit2, Camera, UploadCloud,
  Search, KeyRound, CalendarClock, Users, ScrollText, Archive, LogOut, Boxes,
} from "lucide-react";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { Badge } from "./ui";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, role: "viewer" },
  { to: "/mirrors", label: "Mirrors", icon: Database, role: "viewer" },
  { to: "/repos", label: "Local Repos", icon: FolderGit2, role: "viewer" },
  { to: "/snapshots", label: "Snapshots", icon: Camera, role: "viewer" },
  { to: "/publish", label: "Published", icon: UploadCloud, role: "viewer" },
  { to: "/packages", label: "Packages", icon: Search, role: "viewer" },
  { to: "/gpg", label: "GPG Keys", icon: KeyRound, role: "viewer" },
  { to: "/schedules", label: "Schedules", icon: CalendarClock, role: "viewer" },
  { to: "/backups", label: "Backups", icon: Archive, role: "admin" },
  { to: "/users", label: "Users", icon: Users, role: "admin" },
  { to: "/audit", label: "Audit Log", icon: ScrollText, role: "admin" },
] as const;

function AptlyStatus() {
  const { data } = useQuery({
    queryKey: ["aptly-status"],
    queryFn: async () => (await api.get("/system/aptly")).data,
    refetchInterval: 15000,
  });
  const ok = data?.connected;
  return (
    <div className="flex items-center gap-2 text-xs text-slate-400">
      <span className={`h-2 w-2 rounded-full ${ok ? "bg-emerald-400" : "bg-red-400"}`} />
      {ok ? `aptly ${data?.version ?? ""}` : "aptly offline"}
    </div>
  );
}

export default function Layout({ children }: { children: ReactNode }) {
  const { user, logout, hasRole } = useAuth();
  const navigate = useNavigate();

  const roleColor = user?.role === "admin" ? "purple" : user?.role === "operator" ? "blue" : "slate";

  return (
    <div className="flex h-full">
      <aside className="flex w-60 shrink-0 flex-col border-r border-slate-800 bg-slate-900/40">
        <div className="flex items-center gap-2 px-5 py-4">
          <Boxes className="text-brand-400" />
          <span className="font-semibold tracking-tight">Aptly Web UI</span>
        </div>
        <nav className="flex-1 space-y-0.5 px-3 py-2">
          {NAV.filter((n) => hasRole(n.role as any)).map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === "/"}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition ${
                  isActive ? "bg-brand-600/20 text-brand-200" : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                }`
              }
            >
              <n.icon size={17} />
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-slate-800 px-4 py-3">
          <AptlyStatus />
        </div>
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-end gap-4 border-b border-slate-800 px-6 py-3">
          <button
            onClick={() => navigate("/account")}
            className="flex items-center gap-2 text-sm text-slate-300 hover:text-white"
          >
            <span>{user?.username}</span>
            <Badge color={roleColor}>{user?.role}</Badge>
          </button>
          <button
            onClick={() => {
              logout();
              navigate("/login");
            }}
            className="text-slate-400 hover:text-red-300"
            title="Log out"
          >
            <LogOut size={18} />
          </button>
        </header>
        <main className="flex-1 overflow-y-auto px-6 py-6">{children}</main>
      </div>
    </div>
  );
}

import type { User } from "@supabase/supabase-js";
import {
  BarChart3,
  Building2,
  Download,
  ExternalLink,
  FileText,
  History,
  LayoutDashboard,
  LogOut,
  ShieldCheck,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { supabase } from "../lib/supabase";
import { Logo } from "./brand";

const navIcons: Record<string, LucideIcon> = {
  account: UserRound,
  analytics: BarChart3,
  audit: ShieldCheck,
  companies: Building2,
  dashboard: LayoutDashboard,
  data: Download,
  history: History,
  overview: LayoutDashboard,
  report: FileText,
  surveys: FileText,
};

function NavIcon({ name }: { name: string }) {
  const Icon = navIcons[name];
  return Icon ? <Icon size={18} strokeWidth={1.9} aria-hidden="true" /> : null;
}

function initials(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? `${parts[0][0]}${parts.at(-1)?.[0]}` : parts[0]?.slice(0, 2) || "ST").toUpperCase();
}

export function Shell({ admin, view, setView, items, user, name, children }: {
  admin?: boolean;
  view: string;
  setView: (view: string) => void;
  items: Array<[string, string, string?]>;
  user: User;
  name: string;
  children: ReactNode;
}) {
  const accountLabel = admin ? "Administrator" : "Company account";

  return (
    <div className="app-shell">
      <aside className={`sidebar ${admin ? "sidebar--admin" : ""}`}>
        <Logo inverse />
        <p className="sidebar-role">{admin ? "Administrator" : "Company workspace"}</p>
        <nav aria-label="Primary navigation">
          {items.map(([id, label, meta]) => (
            <button
              key={id}
              type="button"
              className={view === id ? "active" : ""}
              onClick={() => setView(id)}
              aria-current={view === id ? "page" : undefined}
            >
              <span className="nav-item-label">
                <NavIcon name={id} />
                <span>{label}</span>
              </span>
              {meta && <small>{meta}</small>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <a href="https://sustainablefashionacademy.org/stica/" target="_blank" rel="noreferrer">
            <span>STICA guidance</span>
            <ExternalLink size={13} aria-hidden="true" />
          </a>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div className="topbar-status">
            <span className="status-dot" />
            <span>Secure portal connected</span>
          </div>
          <div className="topbar-actions">
            <div className="profile-chip" aria-label={`${name}, ${user.email ?? ""}`} title={user.email ?? name}>
              <span className="profile-avatar" aria-hidden="true">{initials(name)}</span>
              <div>
                <strong>{name}</strong>
                <small>{accountLabel}</small>
              </div>
            </div>
            <button
              type="button"
              className="topbar-logout"
              onClick={() => void supabase?.auth.signOut()}
              aria-label="Sign out of portal"
              title="Sign out"
            >
              <LogOut size={16} aria-hidden="true" />
              <span>Sign out</span>
            </button>
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}

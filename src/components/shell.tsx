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
  Menu,
  ShieldCheck,
  UserRound,
  X,
  type LucideIcon,
} from "lucide-react";
import { type ReactNode, useState, useEffect } from "react";
import { supabase } from "../lib/supabase";

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

export function Shell({
  admin,
  view,
  setView,
  items,
  user,
  name,
  children,
}: {
  admin?: boolean;
  view: string;
  setView: (view: string) => void;
  items: Array<[string, string, string?]>;
  user: User;
  name: string;
  children: ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const accountLabel = admin ? "Administrator" : "Company account";
  const visibleName = admin ? "Administrator" : name;

  // Close drawer on ESC
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setDrawerOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Lock body scroll when drawer is open on mobile
  useEffect(() => {
    if (drawerOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [drawerOpen]);

  function navigate(id: string) {
    setView(id);
    setDrawerOpen(false);
  }

  const SidebarContent = () => (
    <>
      {/* Logo */}
      <div className="sidebar-logo-row">
        <div className="brand brand--inverse">
          <img src="/stica-logo.png" alt="STICA" />
          <div>
            <strong>STICA</strong>
            <span>Climate Action</span>
          </div>
        </div>
        {/* Close button — mobile only */}
        <button
          type="button"
          className="sidebar-close-btn"
          onClick={() => setDrawerOpen(false)}
          aria-label="Close navigation"
        >
          <X size={20} />
        </button>
      </div>

      <p className="sidebar-role">{admin ? "Administrator" : "Company workspace"}</p>

      <nav aria-label="Primary navigation">
        {items.map(([id, label, meta]) => (
          <button
            key={id}
            type="button"
            className={view === id ? "active" : ""}
            onClick={() => navigate(id)}
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
    </>
  );

  return (
    <div className="app-shell">
      {/* ── Desktop sidebar ─────────────────────────────────────── */}
      <aside className={`sidebar sidebar--desktop ${admin ? "sidebar--admin" : ""}`}>
        <SidebarContent />
      </aside>

      {/* ── Mobile drawer overlay ────────────────────────────────── */}
      {drawerOpen && (
        <div
          className="drawer-backdrop"
          aria-hidden="true"
          onClick={() => setDrawerOpen(false)}
        />
      )}
      <aside
        className={`sidebar sidebar--drawer ${admin ? "sidebar--admin" : ""} ${drawerOpen ? "drawer--open" : ""}`}
        aria-hidden={!drawerOpen}
      >
        <SidebarContent />
      </aside>

      {/* ── Main workspace ──────────────────────────────────────── */}
      <div className="workspace">
        <header className="topbar">
          {/* Hamburger — mobile only */}
          <button
            type="button"
            className="topbar-hamburger"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation menu"
            aria-expanded={drawerOpen}
          >
            <Menu size={22} />
          </button>

          {/* Status pill — hidden on small screens */}
          <div className="topbar-status">
            <span className="status-dot" />
            <span>Secure portal connected</span>
          </div>

          <div className="topbar-actions">
            {/* STICA logo icon — admin badge on the right */}
            {admin && (
              <span className="topbar-brand-badge" aria-label="Administrator account" title={`${visibleName} · ${user.email ?? ""}`}>
                <img src="/stica-logo.png" alt="STICA" />
                <span className="topbar-brand-label">Administrator</span>
              </span>
            )}

            {/* Profile chip — company account */}
            {!admin && (
              <div
                className="profile-chip"
                aria-label={`${name}, ${user.email ?? ""}`}
                title={user.email ?? name}
              >
                <span className="profile-avatar" aria-hidden="true">
                  {initials(name)}
                </span>
                <div>
                  <strong>{visibleName}</strong>
                  <small>{accountLabel}</small>
                </div>
              </div>
            )}

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


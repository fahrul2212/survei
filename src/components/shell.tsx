import type { User } from "@supabase/supabase-js";
import {
  BarChart3,
  BellRing,
  Building2,
  Download,
  ExternalLink,
  FileText,
  Files,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  ShieldCheck,
  UserRound,
  Users,
  Bot,
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
  operations: BellRing,
  report: FileText,
  documents: Files,
  benchmark: BarChart3,
  summary: Bot,
  team: Users,
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

  const baseSidebar = "flex flex-col h-dvh px-4.5 py-6 overflow-y-auto overflow-x-hidden border-r text-white";
  const desktopSidebar = "sticky top-0 z-30 hidden lg:flex";
  const drawerSidebar = "fixed inset-y-0 left-0 z-50 w-[280px] max-w-[85vw] shadow-xl transition-transform duration-300 lg:hidden";
  const themeSidebar = admin ? "bg-slate-950 border-slate-900" : "bg-slate-900 border-slate-800";

  const SidebarContent = () => (
    <>
      {/* Logo */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src="/stica-logo.png" alt="STICA" className="size-8 rounded-md" />
          <div className="flex flex-col">
            <strong className="text-sm font-bold tracking-wide">STICA</strong>
            <span className="text-[10px] uppercase tracking-wider text-slate-400">Climate Action</span>
          </div>
        </div>
        {/* Close button — mobile only */}
        <button
          type="button"
          className="grid size-8 place-items-center rounded-md text-slate-400 transition-colors hover:bg-slate-800 hover:text-white lg:hidden"
          onClick={() => setDrawerOpen(false)}
          aria-label="Close navigation"
        >
          <X size={20} />
        </button>
      </div>

      <p className="mb-4 text-[11px] font-bold uppercase tracking-wider text-slate-500">
        {admin ? "Administrator" : "Company workspace"}
      </p>

      <nav aria-label="Primary navigation" className="flex flex-col gap-1.5 w-full">
        {items.map(([id, label, meta]) => {
          const isActive = view === id;
          return (
            <button
              key={id}
              type="button"
              className={`flex min-h-[44px] w-full items-center justify-between rounded-lg px-3.5 transition-all ${
                isActive 
                  ? "bg-[#d91f17] text-white"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
              }`}
              onClick={() => navigate(id)}
              aria-current={isActive ? "page" : undefined}
            >
              <span className="flex items-center gap-3 font-semibold text-[13px]">
                <NavIcon name={id} />
                <span>{label}</span>
              </span>
              {meta && (
                <small className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  isActive ? "bg-red-800 text-white" : "bg-slate-800 text-slate-400"
                }`}>
                  {meta}
                </small>
              )}
            </button>
          );
        })}
      </nav>

      <div className="mt-auto pt-6 flex items-center justify-between">
        <a 
          href="https://sustainablefashionacademy.org/stica/" 
          target="_blank" 
          rel="noreferrer"
          className="flex items-center gap-2 text-xs text-slate-400 hover:text-white transition-colors"
        >
          <span>STICA guidance</span>
          <ExternalLink size={13} aria-hidden="true" />
        </a>
      </div>
    </>
  );

  return (
    <div className="grid min-h-dvh bg-slate-50 lg:grid-cols-[260px_1fr]">
      {/* ── Desktop sidebar ─────────────────────────────────────── */}
      <aside className={`${baseSidebar} ${desktopSidebar} ${themeSidebar}`}>
        <SidebarContent />
      </aside>

      {/* ── Mobile drawer overlay ────────────────────────────────── */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/50 lg:hidden"
          aria-hidden="true"
          onClick={() => setDrawerOpen(false)}
        />
      )}
      <aside
        className={`${baseSidebar} ${drawerSidebar} ${themeSidebar} ${drawerOpen ? "translate-x-0" : "-translate-x-full"}`}
        aria-hidden={!drawerOpen}
      >
        <SidebarContent />
      </aside>

      {/* ── Main workspace ──────────────────────────────────────── */}
      <div className="flex min-h-dvh min-w-0 flex-col">
        <header className="sticky top-0 z-25 flex min-h-[64px] items-center gap-3 border-b border-slate-200 bg-white px-4 text-[13px] font-medium md:px-6 lg:px-10">
          {/* Hamburger — mobile only */}
          <button
            type="button"
            className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 lg:hidden"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation menu"
            aria-expanded={drawerOpen}
          >
            <Menu size={20} />
          </button>

          {/* Status pill — hidden on small screens */}
          <div className="hidden flex-1 items-center gap-2.5 min-w-0 md:flex">
            <span className="relative flex size-2" aria-hidden="true">
              <span className="relative inline-flex size-2 rounded-full bg-emerald-500"></span>
            </span>
            <span className="text-slate-500">Secure portal connected</span>
          </div>

          <div className="ml-auto flex items-center gap-2 md:gap-3">
            {/* STICA logo icon — admin badge on the right */}
            {admin && (
              <span 
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 py-1 pl-1 pr-3" 
                aria-label="Administrator account" 
                title={`${visibleName} · ${user.email ?? ""}`}
              >
                <img src="/stica-logo.png" alt="STICA" className="size-6 rounded-full" />
                <span className="hidden text-xs font-bold text-slate-700 md:block">Administrator</span>
              </span>
            )}

            {/* Profile chip — company account */}
            {!admin && (
              <div
                className="flex items-center gap-2.5"
                aria-label={`${name}, ${user.email ?? ""}`}
                title={user.email ?? name}
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-slate-200 text-[11px] font-bold tracking-wider text-slate-700" aria-hidden="true">
                  {initials(name)}
                </span>
                <div className="hidden flex-col md:flex">
                  <strong className="text-sm font-semibold text-slate-900">{visibleName}</strong>
                  <small className="text-[11px] font-medium text-slate-500">{accountLabel}</small>
                </div>
              </div>
            )}

            <button
              type="button"
              className="inline-flex h-9 items-center justify-center gap-2 rounded-lg px-2 text-[#d91f17] font-semibold transition-colors hover:bg-red-50 md:px-3"
              onClick={() => void supabase?.auth.signOut()}
              aria-label="Sign out of portal"
              title="Sign out"
            >
              <LogOut size={16} aria-hidden="true" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </header>

        {children}
      </div>
    </div>
  );
}

import { useEffect, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { valueAsText, type JsonAnswer, type QuestionType, type SurveyQuestion } from "../lib/portal";

export type Notice = { kind: "success" | "error"; message: string } | null;

export function NavIcon({ name }: { name: string }) {
  const common = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (name) {
    case "dashboard":
    case "overview":
      return <svg {...common}><rect width="7" height="9" x="3" y="3" rx="1" /><rect width="7" height="5" x="14" y="3" rx="1" /><rect width="7" height="9" x="14" y="12" rx="1" /><rect width="7" height="5" x="3" y="16" rx="1" /></svg>;
    case "report":
    case "surveys":
      return <svg {...common}><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" /><polyline points="14 2 14 8 20 8" /><line x1="16" x2="8" y1="13" y2="13" /><line x1="16" x2="8" y1="17" y2="17" /><line x1="10" x2="8" y1="9" y2="9" /></svg>;
    case "history":
      return <svg {...common}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>;
    case "companies":
      return <svg {...common}><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" /><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" /><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" /><path d="M10 6h4" /><path d="M10 10h4" /><path d="M10 14h4" /><path d="M10 18h4" /></svg>;
    case "data":
      return <svg {...common}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" x2="12" y1="15" y2="3" /></svg>;
    case "analytics":
      return <svg {...common}><path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" /></svg>;
    case "audit":
      return <svg {...common}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" /></svg>;
    case "account":
      return <svg {...common}><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>;
    default:
      return null;
  }
}

export function Logo({ inverse = false }: { inverse?: boolean }) {
  return (
    <div className={`brand ${inverse ? "brand--inverse" : ""}`}>
      <img src="/stica-logo.png" alt="STICA" />
      <div>
        <strong>STICA</strong>
        <span>Climate Action</span>
      </div>
    </div>
  );
}

export function Loading({ text = "Loading secure reporting data" }: { text?: string }) {
  return <main className="loading-screen"><Logo /><div className="loading-mark"><span /><span /><span /></div><p>{text}</p></main>;
}

export function NoticeBar({ notice, clear }: { notice: Notice; clear: () => void }) {
  useEffect(() => {
    if (!notice || notice.kind !== "success") return;
    const timer = window.setTimeout(clear, 5000);
    return () => window.clearTimeout(timer);
  }, [notice, clear]);

  if (!notice) return null;
  return <div className={`notice notice--${notice.kind}`} role={notice.kind === "error" ? "alert" : "status"} aria-live={notice.kind === "error" ? "assertive" : "polite"}>
    <span>{notice.message}</span>
    <button type="button" onClick={clear} aria-label="Dismiss notification"><span aria-hidden="true">×</span></button>
  </div>;
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
  return <div className="app-shell">
    <aside className={`sidebar ${admin ? "sidebar--admin" : ""}`}>
      <Logo inverse />
      <p className="sidebar-role">{admin ? "Administrator" : "Company workspace"}</p>
      <nav>{items.map(([id, label, meta]) => <button key={id} className={view === id ? "active" : ""} onClick={() => setView(id)}>
        <span className="nav-item-label"><NavIcon name={id} /><span>{label}</span></span>
        {meta && <small>{meta}</small>}
      </button>)}</nav>
      <div className="sidebar-bottom">
        <a href="https://sustainablefashionacademy.org/stica/" target="_blank" rel="noreferrer">STICA guidance ↗</a>
        <button className="logout" onClick={() => void supabase?.auth.signOut()}>Sign out</button>
      </div>
    </aside>
    <div className="workspace">
      <header className="topbar">
        <div className="topbar-status"><span className="status-dot" /><span>Secure reporting portal connected</span></div>
        <div className="topbar-actions">
          <div className="profile-chip" aria-label={`${name}, ${user.email ?? ""}`} title={user.email ?? name}>
            <span className="profile-avatar" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7 8a7 7 0 0 0-14 0" /></svg></span>
            <div><strong>{name}</strong><small>{user.email}</small></div>
          </div>
          <button type="button" className="topbar-logout" onClick={() => void supabase?.auth.signOut()} title="Sign out of portal"><span aria-hidden="true">↪</span><span>Sign out</span></button>
        </div>
      </header>
      {children}
    </div>
  </div>;
}

export function QuestionField({ question, value, disabled, change, save }: {
  question: SurveyQuestion;
  value?: JsonAnswer;
  disabled: boolean;
  change: (value: JsonAnswer) => void;
  save: (value: JsonAnswer) => void;
}) {
  const commitNumber = (raw: string) => raw ? Number(raw) : "";
  if (question.type === "yes_no") return <div className="choice-row">{["Yes", "No"].map((option) => <button key={option} type="button" disabled={disabled} className={value === option ? "selected" : ""} onClick={() => { change(option); save(option); }}>{option === "Yes" ? "✓ " : "✕ "}{option}</button>)}</div>;
  if (question.type === "single_choice") return <select disabled={disabled} value={valueAsText(value)} onChange={(event) => { change(event.target.value); save(event.target.value); }}><option value="">Select an option…</option>{question.options.map((option) => <option key={option} value={option}>{option}</option>)}</select>;
  if (question.type === "multiple_choice") {
    const values = Array.isArray(value) ? value : [];
    return <div className="checkbox-grid">{question.options.map((option) => <label key={option} className={values.includes(option) ? "checked" : ""}><input type="checkbox" disabled={disabled} checked={values.includes(option)} onChange={() => { const next = values.includes(option) ? values.filter((item) => item !== option) : [...values, option]; change(next); save(next); }} /><span>{option}</span></label>)}</div>;
  }
  if (question.type === "textarea") return <textarea rows={6} disabled={disabled} placeholder="Enter your detailed response…" value={valueAsText(value)} onChange={(event) => change(event.target.value)} onBlur={(event) => save(event.target.value)} />;
  const type: QuestionType = question.type;
  return <input disabled={disabled} type={type === "number" ? "number" : type === "date" ? "date" : "text"} placeholder={type === "number" ? "e.g. 1000" : "Enter answer…"} value={valueAsText(value)} onChange={(event) => change(type === "number" ? commitNumber(event.target.value) : event.target.value)} onBlur={(event) => save(type === "number" ? commitNumber(event.target.value) : event.target.value)} />;
}

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import {
  evaluateVisibility,
  formatDate,
  formatDateTime,
  isAnswered,
  normalizeImportMatrix,
  parseSurveyQuestion,
  slugify,
  valueAsText,
  type AnswerRecord,
  type AuditEventRow,
  type ExportRow,
  type JsonAnswer,
  type MemberRow,
  type Organization,
  type ProgressRow,
  type QuestionType,
  type Submission,
  type SurveyQuestion,
  type SurveyVersion,
} from "./lib/portal";
import { exportPivotXlsx, exportResponsesXlsx, readImportWorkbook } from "./lib/spreadsheet";

// ── Constants ─────────────────────────────────────────────────────────────────

const QUESTION_SELECT = `id,survey_version_id,display_order,is_required,carry_forward_enabled,visibility_rule,section_key,section_title,question_revision:question_revisions!inner(id,prompt,help_text,question_type,options,validation,question:question_definitions!inner(id,stable_key,category))`;
const AUDIT_PAGE_SIZE = 40;
const EXPORT_PAGE_SIZE = 25;
const Q_PAGE_SIZE = 12;

// ── Types ─────────────────────────────────────────────────────────────────────

type Notice = { kind: "success" | "error"; message: string } | null;

type QForm = {
  id: number | null;
  stableKey: string;
  category: string;
  prompt: string;
  help: string;
  type: QuestionType;
  options: string;
  required: boolean;
  sectionKey: string;
  sectionTitle: string;
  carry: string;
  condition: string;
  operator: string;
  expected: string;
};

const EMPTY_Q: QForm = {
  id: null,
  stableKey: "",
  category: "",
  prompt: "",
  help: "",
  type: "text",
  options: "",
  required: false,
  sectionKey: "general",
  sectionTitle: "General",
  carry: "",
  condition: "",
  operator: "equals",
  expected: "",
};

// ── Utility ───────────────────────────────────────────────────────────────────

async function allExports(filters: { year?: number; company?: string; question?: string } = {}): Promise<ExportRow[]> {
  if (!supabase) return [];
  const result: ExportRow[] = [];
  for (let from = 0; ; from += 1000) {
    let q = supabase
      .from("reporting_export")
      .select("*")
      .order("reporting_year", { ascending: false })
      .order("company_name")
      .order("display_order")
      .range(from, from + 999);
    if (filters.year) q = q.eq("reporting_year", filters.year);
    if (filters.company) q = q.eq("company_slug", filters.company);
    if (filters.question) q = q.eq("question_key", filters.question);
    const r = await q;
    if (r.error) throw r.error;
    result.push(...(r.data as ExportRow[]));
    if ((r.data?.length ?? 0) < 1000) break;
  }
  return result;
}

// ── Shared components ─────────────────────────────────────────────────────────

function Logo({ inverse = false }: { inverse?: boolean }) {
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

function Loading({ text = "Loading secure reporting data" }: { text?: string }) {
  return (
    <main className="loading-screen">
      <Logo />
      <div className="loading-mark">
        <span /><span /><span />
      </div>
      <p>{text}</p>
    </main>
  );
}

function NoticeBar({ notice, clear }: { notice: Notice; clear: () => void }) {
  useEffect(() => {
    if (!notice || notice.kind !== "success") return;
    const timer = window.setTimeout(clear, 5000);
    return () => window.clearTimeout(timer);
  }, [notice, clear]);

  if (!notice) return null;
  return (
    <div
      className={`notice notice--${notice.kind}`}
      role={notice.kind === "error" ? "alert" : "status"}
      aria-live={notice.kind === "error" ? "assertive" : "polite"}
    >
      <span>{notice.message}</span>
      <button type="button" onClick={clear} aria-label="Dismiss notification">
        <span aria-hidden="true">×</span>
      </button>
    </div>
  );
}

// ── Login ─────────────────────────────────────────────────────────────────────

function Login() {
  const [reset, setReset] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setError("");
    setMessage("");
    if (reset) {
      const { error: issue } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: location.origin,
      });
      issue ? setError(issue.message) : setMessage("Reset instructions have been sent if the account exists.");
    } else {
      const { error: issue } = await supabase.auth.signInWithPassword({ email, password });
      if (issue) setError(issue.message);
    }
    setBusy(false);
  }

  return (
    <main className="login-shell">
      <section className="login-story">
        <Logo inverse />
        <div className="story-copy">
          <h1>Annual climate reporting.</h1>
          <p>Submit your Climate Transition Plan securely — pre-filled from last year's data.</p>
        </div>
        <div className="orbit"><span /><span /><span /></div>
        <p className="story-footer">The Scandinavian Textile Initiative for Climate Action</p>
      </section>
      <section className="login-panel">
        <div className="login-card">
          <p className="eyebrow eyebrow--red">Secure reporting portal</p>
          <h2>{reset ? "Reset password" : "Welcome back"}</h2>
          <p className="muted">
            {reset
              ? "We will send a secure reset link."
              : "Use the account included in your STICA invitation."}
          </p>
          <form onSubmit={submit}>
            <label>
              Work email
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            {!reset && (
              <label>
                Password
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </label>
            )}
            {error && <p className="form-error">{error}</p>}
            {message && <p className="form-success">{message}</p>}
            <button className="button button--primary" disabled={busy}>
              {busy ? "Please wait…" : reset ? "Send reset link" : "Sign in"}
            </button>
          </form>
          <button className="text-button login-switch" onClick={() => setReset(!reset)}>
            {reset ? "Return to sign in" : "Forgot your password?"}
          </button>
          <p className="login-note">Company data is isolated with database row-level security.</p>
        </div>
      </section>
    </main>
  );
}

// ── Shell ─────────────────────────────────────────────────────────────────────

function Shell({
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
  setView: (v: string) => void;
  items: Array<[string, string, string?]>;
  user: User;
  name: string;
  children: React.ReactNode;
}) {
  return (
    <div className="app-shell">
      <aside className={`sidebar ${admin ? "sidebar--admin" : ""}`}>
        <Logo inverse />
        <p className="sidebar-role">{admin ? "Administrator" : "Company workspace"}</p>
        <nav>
          {items.map(([id, label, meta]) => (
            <button key={id} className={view === id ? "active" : ""} onClick={() => setView(id)}>
              <span>{label}</span>
              {meta && <small>{meta}</small>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <a href="https://sustainablefashionacademy.org/stica/" target="_blank" rel="noreferrer">
            STICA guidance
          </a>
          <button className="logout" onClick={() => void supabase?.auth.signOut()}>
            Sign out
          </button>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div>
            <span className="status-dot" /> Secure reporting data connected
          </div>
          <div className="profile-chip" aria-label={`${name}, ${user.email ?? ""}`} title={user.email ?? name}>
            <span className="profile-avatar" aria-hidden="true">
              <svg viewBox="0 0 24 24" focusable="false">
                <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7 8a7 7 0 0 0-14 0" />
              </svg>
            </span>
            <div>
              <strong>{name}</strong>
              <small>{user.email}</small>
            </div>
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}

// ── QuestionField ─────────────────────────────────────────────────────────────

function QuestionField({
  question,
  value,
  disabled,
  change,
  save,
}: {
  question: SurveyQuestion;
  value?: JsonAnswer;
  disabled: boolean;
  change: (v: JsonAnswer) => void;
  save: (v: JsonAnswer) => void;
}) {
  if (question.type === "yes_no") {
    return (
      <div className="choice-row">
        {["Yes", "No"].map((v) => (
          <button
            key={v}
            disabled={disabled}
            className={value === v ? "selected" : ""}
            onClick={() => { change(v); save(v); }}
          >
            {v}
          </button>
        ))}
      </div>
    );
  }

  if (question.type === "single_choice") {
    return (
      <select
        disabled={disabled}
        value={valueAsText(value)}
        onChange={(e) => { change(e.target.value); save(e.target.value); }}
      >
        <option value="">Select an answer</option>
        {question.options.map((v) => <option key={v}>{v}</option>)}
      </select>
    );
  }

  if (question.type === "multiple_choice") {
    const values = Array.isArray(value) ? value : [];
    return (
      <div className="checkbox-grid">
        {question.options.map((v) => (
          <label key={v} className={values.includes(v) ? "checked" : ""}>
            <input
              type="checkbox"
              disabled={disabled}
              checked={values.includes(v)}
              onChange={() => {
                const next = values.includes(v) ? values.filter((x) => x !== v) : [...values, v];
                change(next);
                save(next);
              }}
            />
            <span>{v}</span>
          </label>
        ))}
      </div>
    );
  }

  if (question.type === "textarea") {
    return (
      <textarea
        rows={6}
        disabled={disabled}
        value={valueAsText(value)}
        onChange={(e) => change(e.target.value)}
        onBlur={(e) => save(e.target.value)}
      />
    );
  }

  return (
    <input
      disabled={disabled}
      type={question.type === "number" ? "number" : question.type === "date" ? "date" : "text"}
      value={valueAsText(value)}
      onChange={(e) => change(
        question.type === "number" && e.target.value ? Number(e.target.value) : e.target.value,
      )}
      onBlur={(e) => save(
        question.type === "number" && e.target.value ? Number(e.target.value) : e.target.value,
      )}
    />
  );
}

// ── Report (company survey view) ──────────────────────────────────────────────

function Report({
  version,
  submission,
  questions,
  answers,
  setAnswers,
  save,
  submit,
  back,
}: {
  version: SurveyVersion;
  submission: Submission;
  questions: SurveyQuestion[];
  answers: Record<number, JsonAnswer>;
  setAnswers: React.Dispatch<React.SetStateAction<Record<number, JsonAnswer>>>;
  save: (q: SurveyQuestion, v: JsonAnswer) => Promise<void>;
  submit: () => Promise<void>;
  back: () => void;
}) {
  const visible = questions.filter((q) => evaluateVisibility(q, questions, answers));
  const [activeId, setActiveId] = useState(visible[0]?.id ?? 0);
  const [saving, setSaving] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 1181px)").matches,
  );

  const active = visible.find((q) => q.id === activeId) ?? visible[0];
  const index = visible.indexOf(active);
  const readOnly = submission.status === "submitted";
  const answered = visible.filter((q) => isAnswered(answers[q.id])).length;

  useEffect(() => {
    if (active && !visible.some((q) => q.id === activeId)) setActiveId(active.id);
  }, [active, activeId, visible]);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1181px)");
    const sync = () => setPaletteOpen(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  if (!active) {
    return (
      <div className="empty-state">
        <h2>No visible questions</h2>
        <button onClick={back}>Back</button>
      </div>
    );
  }

  async function commit(v: JsonAnswer) {
    if (readOnly) return;
    setSaving(true);
    await save(active, v);
    setSaving(false);
  }

  return (
    <div className="report-layout">
      <aside className="report-outline">
        <button className="back-link" onClick={back}>Back to overview</button>
        <p className="eyebrow">Annual report {version.reporting_year}</p>
        <h2>{active.sectionTitle}</h2>
        <div className="outline-progress">
          <span>
            <i style={{ width: `${visible.length ? (answered / visible.length) * 100 : 0}%` }} />
          </span>
          <small>{answered} of {visible.length} visible questions answered</small>
        </div>
        <details
          className="palette-panel"
          open={paletteOpen}
          onToggle={(e) => { if (window.innerWidth <= 1180) setPaletteOpen(e.currentTarget.open); }}
        >
          <summary>
            <span>Question navigator</span>
            <strong>{answered}/{visible.length}</strong>
          </summary>
          <div className="palette-legend" aria-label="Question status legend">
            <span><i className="legend-dot legend-dot--answered" />Answered</span>
            <span><i className="legend-dot" />Not answered</span>
            <span><i className="legend-dot legend-dot--active" />Current</span>
          </div>
          <div className="question-index" role="navigation" aria-label="Question navigator" tabIndex={0}>
            {visible.map((q, i) => (
              <button
                key={q.id}
                className={`${q.id === active.id ? "active " : ""}${isAnswered(answers[q.id]) ? "answered" : "unanswered"}`}
                aria-label={`Question ${i + 1}, ${isAnswered(answers[q.id]) ? "answered" : "not answered"}: ${q.prompt}`}
                title={`${i + 1}. ${q.prompt}`}
                onClick={() => setActiveId(q.id)}
              >
                <span>{i + 1}</span>
                <div>
                  <strong>{q.stableKey}</strong>
                  <small>{q.sectionTitle}</small>
                </div>
              </button>
            ))}
          </div>
        </details>
        {(readOnly || saving) && (
          <p className="autosave" aria-live="polite">
            {readOnly ? "Submitted — read only" : "Saving securely…"}
          </p>
        )}
      </aside>

      <section className="question-stage">
        <div className="question-card" key={active.id}>
          <div className="question-meta">
            <span>Question {index + 1} of {visible.length}</span>
            <code>{active.stableKey}</code>
          </div>
          <p className="section-kicker">{active.sectionTitle} / {active.category}</p>
          <h1>{active.prompt}</h1>
          {active.helpText && <p className="question-help">{active.helpText}</p>}
          {active.carryForwardEnabled && isAnswered(answers[active.id]) && !readOnly && (
            <div className="previous-answer">
              <span>Review carried-forward response</span>
              <p>Confirm this remains accurate, or update it below.</p>
            </div>
          )}
          <label className="answer-label">
            Your answer {active.required && <em>Required</em>}
          </label>
          <QuestionField
            question={active}
            value={answers[active.id]}
            disabled={readOnly}
            change={(v) => setAnswers((a) => ({ ...a, [active.id]: v }))}
            save={(v) => void commit(v)}
          />
          <div className="question-actions">
            <button
              className="button button--secondary"
              disabled={index === 0}
              onClick={() => setActiveId(visible[index - 1].id)}
            >
              Previous
            </button>
            {index < visible.length - 1 ? (
              <button
                className="button button--primary"
                onClick={async () => {
                  await commit(answers[active.id] ?? null);
                  setActiveId(visible[index + 1].id);
                }}
              >
                Save &amp; next
              </button>
            ) : readOnly ? (
              <button className="button button--secondary" onClick={() => print()}>
                Print / save PDF
              </button>
            ) : (
              <button className="button button--primary" onClick={() => void submit()}>
                Review &amp; submit
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

// ── AccountSettings (company user) ────────────────────────────────────────────

function AccountSettings({ session }: { session: Session }) {
  const [name, setName] = useState("");
  const [nameLoaded, setNameLoaded] = useState(false);
  const [nameBusy, setNameBusy] = useState(false);
  const [nameNotice, setNameNotice] = useState<Notice>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwNotice, setPwNotice] = useState<Notice>(null);

  useEffect(() => {
    if (!supabase) return;
    void supabase
      .from("profiles")
      .select("full_name")
      .eq("user_id", session.user.id)
      .single()
      .then(({ data }) => {
        if (data?.full_name) setName(data.full_name);
        setNameLoaded(true);
      });
  }, [session.user.id]);

  async function saveName(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setNameBusy(true);
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: name.trim() })
      .eq("user_id", session.user.id);
    setNameBusy(false);
    setNameNotice(error ? { kind: "error", message: error.message } : { kind: "success", message: "Name updated." });
  }

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    if (password !== confirm) return setPwNotice({ kind: "error", message: "Passwords do not match." });
    if (password.length < 8) return setPwNotice({ kind: "error", message: "Password must be at least 8 characters." });
    setPwBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setPwBusy(false);
    if (error) return setPwNotice({ kind: "error", message: error.message });
    setPwNotice({ kind: "success", message: "Password updated. Please sign in again if prompted." });
    setPassword("");
    setConfirm("");
  }

  return (
    <div className="page">
      <div className="page-intro">
        <div>
          <p className="eyebrow eyebrow--red">Your profile</p>
          <h1>Account settings</h1>
          <p className="muted">{session.user.email}</p>
        </div>
      </div>

      <section className="two-column-admin two-column-admin--narrow">
        <form className="panel-form" onSubmit={saveName}>
          <h3>Display name</h3>
          {nameNotice && (
            <p className={nameNotice.kind === "error" ? "form-error" : "form-success"}>{nameNotice.message}</p>
          )}
          <label>
            Full name
            <input
              value={name}
              placeholder={nameLoaded ? "Your name" : "Loading…"}
              disabled={!nameLoaded || nameBusy}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>
          <button className="button button--primary" disabled={!nameLoaded || nameBusy}>
            {nameBusy ? "Saving…" : "Save name"}
          </button>
        </form>

        <form className="panel-form" onSubmit={changePassword}>
          <h3>Change password</h3>
          {pwNotice && (
            <p className={pwNotice.kind === "error" ? "form-error" : "form-success"}>{pwNotice.message}</p>
          )}
          <label>
            New password
            <input type="password" value={password} minLength={8} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          <label>
            Confirm password
            <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
          </label>
          <button className="button button--primary" disabled={pwBusy}>
            {pwBusy ? "Saving…" : "Change password"}
          </button>
        </form>
      </section>
    </div>
  );
}

// ── CompanyPortal ─────────────────────────────────────────────────────────────

function CompanyPortal({ session }: { session: Session }) {
  const [view, setView] = useState("overview");
  const [org, setOrg] = useState<Organization | null>(null);
  const [versions, setVersions] = useState<SurveyVersion[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [version, setVersion] = useState<SurveyVersion | null>(null);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [questions, setQuestions] = useState<SurveyQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<number, JsonAnswer>>({});
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<Notice>(null);

  const loadSurvey = useCallback(async (v: SurveyVersion, known: Submission[]) => {
    if (!supabase) return;
    let s = known.find((x) => x.survey_version_id === v.id) ?? null;
    if (!s && v.status === "published") {
      const r = await supabase.rpc("initialize_submission", {
        target_survey_version_id: v.id,
        target_organization_id: null,
      });
      if (r.error) throw r.error;
      const q = await supabase.from("company_submissions").select("*").eq("id", r.data).single();
      if (q.error) throw q.error;
      s = q.data as Submission;
      known = [...known, s];
      setSubmissions(known);
    }
    const [qr, ar] = await Promise.all([
      supabase.from("survey_questions").select(QUESTION_SELECT).eq("survey_version_id", v.id).order("display_order"),
      s
        ? supabase.from("answers").select("*").eq("submission_id", s.id)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (qr.error) throw qr.error;
    if (ar.error) throw ar.error;
    setVersion(v);
    setSubmission(s);
    setQuestions((qr.data ?? []).map(parseSurveyQuestion));
    setAnswers(Object.fromEntries(((ar.data ?? []) as AnswerRecord[]).map((a) => [a.survey_question_id, a.value])));
  }, []);

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      const m = await supabase
        .from("organization_members")
        .select("organization:organizations!inner(*)")
        .eq("user_id", session.user.id)
        .limit(1)
        .maybeSingle();
      if (m.error) throw m.error;
      const o = Array.isArray(m.data?.organization) ? m.data.organization[0] : m.data?.organization;
      if (!o) { setOrg(null); return; }
      setOrg(o as Organization);

      const [vr, sr] = await Promise.all([
        supabase.from("survey_versions").select("*").in("status", ["published", "closed"]).order("reporting_year", { ascending: false }),
        supabase.from("company_submissions").select("*").eq("organization_id", o.id),
      ]);
      if (vr.error) throw vr.error;
      if (sr.error) throw sr.error;

      const vv = (vr.data ?? []) as SurveyVersion[];
      const ss = (sr.data ?? []) as Submission[];
      setVersions(vv);
      setSubmissions(ss);

      const current = vv.find((x) => x.status === "published") ?? vv[0];
      if (current) await loadSurvey(current, ss);
    } catch (e) {
      setNotice({ kind: "error", message: e instanceof Error ? e.message : "Unable to load data" });
    } finally {
      setLoading(false);
    }
  }, [loadSurvey, session.user.id]);

  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => questions.filter((q) => evaluateVisibility(q, questions, answers)), [answers, questions]);
  const answered = visible.filter((q) => isAnswered(answers[q.id])).length;
  const progress = visible.length ? Math.round((answered / visible.length) * 100) : 0;
  const sections = useMemo(() =>
    Object.values(
      visible.reduce<Record<string, { key: string; title: string; total: number; answered: number }>>((a, q) => {
        const x = a[q.sectionKey] ?? { key: q.sectionKey, title: q.sectionTitle, total: 0, answered: 0 };
        x.total++;
        if (isAnswered(answers[q.id])) x.answered++;
        a[q.sectionKey] = x;
        return a;
      }, {}),
    ),
  [answers, visible]);

  async function save(q: SurveyQuestion, v: JsonAnswer) {
    if (!supabase || !submission || submission.status === "submitted") return;
    const r = await supabase.from("answers").upsert(
      { submission_id: submission.id, survey_question_id: q.id, value: v, provenance: "manual", updated_by: session.user.id },
      { onConflict: "submission_id,survey_question_id" },
    );
    if (r.error) setNotice({ kind: "error", message: r.error.message });
  }

  async function submit() {
    if (!supabase || !submission) return;
    const missing = visible.filter((q) => q.required && !isAnswered(answers[q.id]));
    if (missing.length) return setNotice({ kind: "error", message: `${missing.length} required response(s) are missing.` });
    if (!confirm("Submit this report? An administrator must reopen it for later changes.")) return;
    const r = await supabase.rpc("submit_submission", { target_submission_id: submission.id });
    if (r.error) return setNotice({ kind: "error", message: r.error.message });
    setNotice({ kind: "success", message: "Report submitted successfully." });
    setView("overview");
    await load();
  }

  async function open(v: SurveyVersion) {
    setLoading(true);
    try {
      await loadSurvey(v, submissions);
      setView("report");
    } catch (e) {
      setNotice({ kind: "error", message: e instanceof Error ? e.message : "Unable to open report" });
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <Loading />;

  if (!org) {
    return (
      <main className="centered-shell">
        <section className="setup-card">
          <Logo />
          <h1>Account awaiting company access</h1>
          <p>Ask a STICA administrator to link this account to a participating company.</p>
          <button onClick={() => void supabase?.auth.signOut()}>Sign out</button>
        </section>
      </main>
    );
  }

  const navItems: Array<[string, string, string?]> = [
    ["overview", "Overview"],
    ["report", version ? `${version.reporting_year} report` : "Current report", `${answered}/${visible.length}`],
    ["history", "Previous years"],
    ["account", "Account"],
  ];

  return (
    <Shell view={view} setView={setView} items={navItems} user={session.user} name={org.name}>
      <NoticeBar notice={notice} clear={() => setNotice(null)} />

      {/* ── Report ── */}
      {view === "report" && version && submission && (
        <Report
          version={version}
          submission={submission}
          questions={questions}
          answers={answers}
          setAnswers={setAnswers}
          save={save}
          submit={submit}
          back={() => setView("overview")}
        />
      )}

      {/* ── Overview ── */}
      {view === "overview" && (
        <div className="page">
          <div className="page-intro">
            <div>
              <p className="eyebrow eyebrow--red">Company climate action programme</p>
              <h1>{org.name}</h1>
              <p>
                {version
                  ? `Your ${version.reporting_year} report is ${submission?.status ?? "not started"}.`
                  : "No reporting cycle is open."}
              </p>
            </div>
            {version?.closes_at && (
              <div className="deadline">
                <span>Submission deadline</span>
                <strong>{formatDate(version.closes_at)}</strong>
              </div>
            )}
          </div>

          {version && submission ? (
            <>
              <section className="hero-report">
                <div className="hero-copy">
                  <span className={`status-badge ${submission.status === "submitted" ? "status-badge--done" : ""}`}>
                    {submission.status}
                  </span>
                  <h2>{version.name}</h2>
                  <p>Approved persistent question mappings preserve reliable prior-year responses for review.</p>
                  <button className="button button--ink" onClick={() => setView("report")}>
                    {submission.status === "submitted" ? "View submission" : "Continue reporting"}
                  </button>
                </div>
                <div className="progress-art">
                  <div
                    className="progress-ring"
                    style={{ "--progress": `${progress * 3.6}deg` } as React.CSSProperties}
                  >
                    <div>
                      <strong>{progress}%</strong>
                      <span>complete</span>
                    </div>
                  </div>
                  <p>{answered} of {visible.length} visible responses</p>
                </div>
              </section>

              <section className="overview-grid">
                <div className="section-card">
                  <div className="section-card__head">
                    <div>
                      <p className="eyebrow">Reporting sections</p>
                      <h3>Section progress</h3>
                    </div>
                    <span>{sections.length} sections</span>
                  </div>
                  <div className="section-list">
                    {sections.map((s) => (
                      <button key={s.key} onClick={() => setView("report")}>
                        <span className="section-check">
                          {s.answered === s.total ? "OK" : Math.round((s.answered / s.total) * 100)}
                        </span>
                        <span>
                          <strong>{s.title}</strong>
                          <small>{s.answered} of {s.total} answered</small>
                        </span>
                        <span className="mini-progress">
                          <i style={{ width: `${(s.answered / s.total) * 100}%` }} />
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <aside className="info-card">
                  <p className="eyebrow">Baseline</p>
                  <strong>{questions.filter((q) => q.carryForwardEnabled && isAnswered(answers[q.id])).length}</strong>
                  <h3>responses ready to review</h3>
                  <p>Only unchanged or administrator-mapped questions are carried forward.</p>
                </aside>
              </section>
            </>
          ) : (
            <div className="empty-state">
              <h2>No published survey</h2>
              <p>A new reporting cycle has not been opened yet.</p>
            </div>
          )}
        </div>
      )}

      {/* ── History ── */}
      {view === "history" && (
        <div className="page">
          <div className="page-intro">
            <div>
              <p className="eyebrow eyebrow--red">Reporting archive</p>
              <h1>Previous years</h1>
            </div>
          </div>
          <div className="history-list">
            {versions.map((v) => {
              const s = submissions.find((x) => x.survey_version_id === v.id);
              return s ? (
                <article key={v.id}>
                  <span>{v.reporting_year}</span>
                  <div>
                    <h3>{v.name}</h3>
                    <p>{s.submitted_at ? `Submitted ${formatDate(s.submitted_at)}` : `Saved ${formatDate(s.updated_at)}`}</p>
                  </div>
                  <strong>{s.status}</strong>
                  <button onClick={() => void open(v)}>View report</button>
                </article>
              ) : null;
            })}
          </div>
        </div>
      )}

      {/* ── Account ── */}
      {view === "account" && <AccountSettings session={session} />}
    </Shell>
  );
}

// ── Admin: AuditLogView ───────────────────────────────────────────────────────

function AuditLogView({ orgs }: { orgs: Organization[] }) {
  const [events, setEvents] = useState<AuditEventRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [filterOrg, setFilterOrg] = useState("");
  const [filterType, setFilterType] = useState("");
  const [notice, setNotice] = useState<Notice>(null);

  const load = useCallback(async (pg = 0, reset = false) => {
    if (!supabase) return;
    setLoading(true);
    try {
      const r = await supabase.rpc("get_audit_events", {
        page_limit: AUDIT_PAGE_SIZE,
        page_offset: pg * AUDIT_PAGE_SIZE,
        filter_org_id: filterOrg ? Number(filterOrg) : null,
        filter_event_type: filterType || null,
      });
      if (r.error) throw r.error;
      const rows = (r.data ?? []) as AuditEventRow[];
      setEvents(reset ? rows : (prev) => [...prev, ...rows]);
      setHasMore(rows.length === AUDIT_PAGE_SIZE);
      setPage(pg);
    } catch (e) {
      setNotice({ kind: "error", message: e instanceof Error ? e.message : "Unable to load audit log" });
    } finally {
      setLoading(false);
    }
  }, [filterOrg, filterType]);

  useEffect(() => { void load(0, true); }, [load]);

  const eventTypes = [
    "submission.submitted", "submission.initialized", "submission.reopened",
    "question.added", "question.updated", "question.removed",
    "survey.created", "survey.published", "survey.closed",
    "organization.updated", "member.removed", "member.role_updated",
    "historical.imported",
  ];

  return (
    <div className="page">
      <div className="page-intro">
        <div>
          <p className="eyebrow eyebrow--red">Full activity trail</p>
          <h1>Audit log</h1>
          <p>All administrative and company actions are recorded with actor and timestamp.</p>
        </div>
      </div>

      <NoticeBar notice={notice} clear={() => setNotice(null)} />

      <section className="audit-filters panel-form">
        <div className="form-grid">
          <label>
            Company
            <select value={filterOrg} onChange={(e) => setFilterOrg(e.target.value)}>
              <option value="">All companies</option>
              {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </label>
          <label>
            Event type
            <select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
              <option value="">All events</option>
              {eventTypes.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
        </div>
      </section>

      <section className="admin-table">
        <div className="admin-table__head">
          <div>
            <p className="eyebrow">Activity</p>
            <h3>Recent events</h3>
          </div>
          {loading && <span className="loading-inline">Loading…</span>}
        </div>
        <div className="table-scroll">
          <table className="responsive-table responsive-table--audit">
            <thead>
              <tr>
                <th>Time</th>
                <th>Actor</th>
                <th>Event</th>
                <th>Entity</th>
                <th>Company</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {events.map((ev) => (
                <tr key={ev.id}>
                  <td data-label="Time" className="audit-time">{formatDateTime(ev.occurred_at)}</td>
                  <td data-label="Actor"><span className="audit-actor">{ev.actor_email}</span></td>
                  <td data-label="Event">
                    <span className={`audit-badge audit-badge--${ev.event_type.split(".")[0]}`}>
                      {ev.event_type}
                    </span>
                  </td>
                  <td data-label="Entity" className="audit-entity">
                    <code>{ev.entity_type}</code>
                    <small>#{ev.entity_id}</small>
                  </td>
                  <td data-label="Company">{ev.organization_name ?? "—"}</td>
                  <td data-label="Details" className="audit-details">
                    <code>{Object.keys(ev.details).length > 0 ? JSON.stringify(ev.details) : "—"}</code>
                  </td>
                </tr>
              ))}
              {events.length === 0 && !loading && (
                <tr><td colSpan={6} className="empty-row">No events found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {hasMore && (
          <div className="catalog-pager">
            <button
              className="button button--secondary"
              disabled={loading}
              onClick={() => void load(page + 1)}
            >
              {loading ? "Loading…" : "Load more"}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

// ── AdminPortal ───────────────────────────────────────────────────────────────

function AdminPortal({ session }: { session: Session }) {
  // Navigation
  const [view, setView] = useState("dashboard");

  // Core data
  const [versions, setVersions] = useState<SurveyVersion[]>([]);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [rows, setRows] = useState<ProgressRow[]>([]);
  const [questions, setQuestions] = useState<SurveyQuestion[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [carry, setCarry] = useState<Record<number, string>>({});

  // Survey builder sub-views
  const [surveyView, setSurveyView] = useState<"overview" | "create-year" | "workspace" | "question">("overview");
  const [form, setForm] = useState<QForm>(EMPTY_Q);
  const [yearDraft, setYearDraft] = useState({
    year: String(new Date().getFullYear() + 1),
    name: `Climate Transition Plan Annual Report ${new Date().getFullYear() + 1}`,
  });
  const [questionPage, setQuestionPage] = useState(0);
  const [openingVersion, setOpeningVersion] = useState<number | null>(null);
  const [pendingDelete, setPendingDelete] = useState<SurveyQuestion | null>(null);
  const [previewMode, setPreviewMode] = useState(false);

  // Company management
  const [editingOrg, setEditingOrg] = useState<Organization | null>(null);
  const [editOrgForm, setEditOrgForm] = useState({ name: "", contactEmail: "", externalReference: "" });
  const [expandedOrgId, setExpandedOrgId] = useState<number | null>(null);
  const [orgMembersCache, setOrgMembersCache] = useState<Record<number, MemberRow[]>>({});
  const [membersBusy, setMembersBusy] = useState(false);

  // Data / export
  const [exports, setExports] = useState<ExportRow[]>([]);
  const [exportFormat, setExportFormat] = useState<"flat" | "pivot">("flat");
  const [exportPage, setExportPage] = useState(0);
  const [year, setYear] = useState("");
  const [company, setCompany] = useState("");
  const [question, setQuestion] = useState("");

  // Global state
  const [notice, setNotice] = useState<Notice>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // ── Loaders ──────────────────────────────────────────────────────────────

  const loadQuestions = useCallback(async (id: number) => {
    if (!supabase) return;
    const [a, b] = await Promise.all([
      supabase.from("survey_questions").select(QUESTION_SELECT).eq("survey_version_id", id).order("display_order"),
      supabase.from("question_carry_forward_rules").select("target_survey_question_id,source:question_definitions!inner(stable_key)"),
    ]);
    if (a.error) throw a.error;
    if (b.error) throw b.error;
    setQuestions((a.data ?? []).map(parseSurveyQuestion));
    setCarry(
      Object.fromEntries(
        (b.data ?? []).map((x) => [
          x.target_survey_question_id,
          (Array.isArray(x.source) ? x.source[0] : x.source)?.stable_key ?? "",
        ]),
      ),
    );
  }, []);

  const load = useCallback(async (silent = false, preferredId?: number) => {
    if (!supabase) return;
    if (!silent) setLoading(true);
    try {
      const [a, b, c] = await Promise.all([
        supabase.from("survey_versions").select("*").order("reporting_year", { ascending: false }),
        supabase.from("organizations").select("*").order("name"),
        supabase.from("admin_submission_progress").select("*").order("reporting_year", { ascending: false }),
      ]);
      if (a.error) throw a.error;
      if (b.error) throw b.error;
      if (c.error) throw c.error;
      const vv = (a.data ?? []) as SurveyVersion[];
      setVersions(vv);
      setOrgs((b.data ?? []) as Organization[]);
      setRows((c.data ?? []) as ProgressRow[]);
      const id = preferredId ?? vv[0]?.id ?? null;
      setSelected(id);
      if (id) await loadQuestions(id);
    } catch (e) {
      setNotice({ kind: "error", message: e instanceof Error ? e.message : "Unable to load admin data" });
    } finally {
      if (!silent) setLoading(false);
    }
  }, [loadQuestions]);

  useEffect(() => { void load(); }, [load]);

  // ── Derived state ─────────────────────────────────────────────────────────

  const selectedVersion = versions.find((v) => v.id === selected);
  const current = versions.find((v) => v.status === "published") ?? versions[0];
  const currentRows = current ? rows.filter((r) => r.survey_version_id === current.id) : [];
  const submitted = currentRows.filter((r) => r.status === "submitted").length;
  const inProgress = currentRows.filter((r) => r.status === "draft" || r.status === "reopened").length;
  const years = [...new Set(rows.map((r) => r.reporting_year))].sort((a, b) => b - a);
  const visibleExports = exports.slice(exportPage * EXPORT_PAGE_SIZE, (exportPage + 1) * EXPORT_PAGE_SIZE);

  // ── Survey builder actions ────────────────────────────────────────────────

  function beginCreateYear() {
    const next = Math.max(new Date().getFullYear(), ...versions.map((v) => v.reporting_year)) + 1;
    setYearDraft({ year: String(next), name: `Climate Transition Plan Annual Report ${next}` });
    setNotice(null);
    setSurveyView("create-year");
  }

  async function openVersion(v: SurveyVersion) {
    setBusy(true);
    setOpeningVersion(v.id);
    setNotice(null);
    setSelected(v.id);
    setQuestionPage(0);
    setQuestions([]);
    setForm(EMPTY_Q);
    setPreviewMode(false);
    setSurveyView("workspace");
    try {
      await loadQuestions(v.id);
    } catch (e) {
      setSurveyView("overview");
      setNotice({ kind: "error", message: e instanceof Error ? e.message : "Unable to open reporting year" });
    } finally {
      setOpeningVersion(null);
      setBusy(false);
    }
  }

  async function createYear(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!supabase) return;
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setNotice(null);
    try {
      const r = await supabase.rpc("create_survey_year", {
        new_reporting_year: Number(f.get("year")),
        survey_name: String(f.get("name")),
        open_at: f.get("opens") ? new Date(String(f.get("opens"))).toISOString() : null,
        close_at: f.get("closes") ? new Date(String(f.get("closes"))).toISOString() : null,
        clone_from_survey_version_id: f.get("clone") ? Number(f.get("clone")) : null,
      });
      if (r.error) throw r.error;
      setSelected(Number(r.data));
      setQuestionPage(0);
      await load(true, Number(r.data));
      setSurveyView("workspace");
      setNotice({ kind: "success", message: `Draft ${yearDraft.year} created. You can now add or review questions.` });
    } catch (e) {
      setNotice({ kind: "error", message: e instanceof Error ? e.message : "Unable to create reporting year" });
    } finally {
      setBusy(false);
    }
  }

  async function saveQ(e: FormEvent) {
    e.preventDefault();
    if (!supabase || !selected) return;
    setBusy(true);
    setNotice(null);
    try {
      const r = await supabase.rpc("save_survey_question", {
        target_survey_version_id: selected,
        target_survey_question_id: form.id,
        stable_question_key: form.stableKey.toUpperCase(),
        question_category: form.category,
        question_prompt: form.prompt,
        question_help_text: form.help,
        response_type: form.type,
        response_options: form.options.split("\n").map((x) => x.trim()).filter(Boolean),
        response_validation: {},
        required_response: form.required,
        target_section_key: slugify(form.sectionKey),
        target_section_title: form.sectionTitle,
        target_visibility_rule: form.condition
          ? { questionKey: form.condition.toUpperCase(), operator: form.operator, ...(form.operator === "is_answered" ? {} : { value: form.expected }) }
          : {},
        carry_source_question_key: form.carry.toUpperCase() || null,
      });
      if (r.error) throw r.error;
      setForm(EMPTY_Q);
      await loadQuestions(selected);
      setSurveyView("workspace");
      setNotice({ kind: "success", message: "Question revision saved." });
    } catch (e) {
      setNotice({ kind: "error", message: e instanceof Error ? e.message : "Unable to save question" });
    } finally {
      setBusy(false);
    }
  }

  function edit(q: SurveyQuestion) {
    setForm({
      id: q.id,
      stableKey: q.stableKey,
      category: q.category,
      prompt: q.prompt,
      help: q.helpText ?? "",
      type: q.type,
      options: q.options.join("\n"),
      required: q.required,
      sectionKey: q.sectionKey,
      sectionTitle: q.sectionTitle,
      carry: carry[q.id] ?? "",
      condition: q.visibilityRule.questionKey ?? "",
      operator: q.visibilityRule.operator ?? "equals",
      expected: valueAsText(q.visibilityRule.value),
    });
    setSurveyView("question");
  }

  async function remove(q: SurveyQuestion) {
    if (!supabase || !selectedVersion || selectedVersion.status !== "draft") return;
    setBusy(true);
    setNotice(null);
    try {
      const r = await supabase.rpc("delete_survey_question", { target_survey_question_id: q.id });
      if (r.error) throw r.error;
      await loadQuestions(selectedVersion.id);
      setPendingDelete(null);
      setNotice({ kind: "success", message: `${q.stableKey} removed from the draft. Published years remain unchanged.` });
    } catch (e) {
      setNotice({ kind: "error", message: e instanceof Error ? e.message : "Unable to delete question" });
    } finally {
      setBusy(false);
    }
  }

  async function reorder(q: SurveyQuestion, dir: "up" | "down") {
    if (!supabase || !selectedVersion || selectedVersion.status !== "draft") return;
    setBusy(true);
    try {
      const r = await supabase.rpc("reorder_survey_question", {
        target_survey_question_id: q.id,
        direction: dir,
      });
      if (r.error) throw r.error;
      await loadQuestions(selectedVersion.id);
    } catch (e) {
      setNotice({ kind: "error", message: e instanceof Error ? e.message : "Unable to reorder" });
    } finally {
      setBusy(false);
    }
  }

  async function publishYear() {
    if (!supabase || !selectedVersion || !window.confirm(`Publish ${selectedVersion.name}?`)) return;
    setBusy(true);
    setNotice(null);
    try {
      const r = await supabase.rpc("publish_survey_version", { target_survey_version_id: selectedVersion.id });
      if (r.error) throw r.error;
      await load(true, selected ?? undefined);
      setNotice({ kind: "success", message: "Survey published. Companies can now access it." });
    } catch (e) {
      setNotice({ kind: "error", message: e instanceof Error ? e.message : "Unable to publish" });
    } finally {
      setBusy(false);
    }
  }

  async function closeYear() {
    if (!supabase || !selectedVersion || !window.confirm(`Close ${selectedVersion.name}? This will hide it from company users.`)) return;
    setBusy(true);
    setNotice(null);
    try {
      const r = await supabase.rpc("close_survey_year", { target_survey_version_id: selectedVersion.id });
      if (r.error) throw r.error;
      await load(true, selected ?? undefined);
      setNotice({ kind: "success", message: "Reporting year closed." });
    } catch (e) {
      setNotice({ kind: "error", message: e instanceof Error ? e.message : "Unable to close year" });
    } finally {
      setBusy(false);
    }
  }

  // ── Company management actions ────────────────────────────────────────────

  async function invite(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!supabase) return;
    const f = new FormData(e.currentTarget);
    setBusy(true);
    const r = await supabase.functions.invoke("admin-invite-company", {
      body: {
        companyName: f.get("companyName"),
        companySlug: f.get("companySlug"),
        fullName: f.get("fullName"),
        email: f.get("email"),
        externalReference: f.get("externalReference"),
        redirectTo: location.origin,
      },
    });
    setBusy(false);
    if (r.error || r.data?.error) {
      return setNotice({ kind: "error", message: r.data?.error ?? r.error?.message ?? "Invitation failed" });
    }
    setNotice({ kind: "success", message: r.data.invited ? "Company created and invitation sent." : "Existing user linked." });
    e.currentTarget.reset();
    await load(true, selected ?? undefined);
  }

  function beginEditOrg(o: Organization) {
    setEditingOrg(o);
    setEditOrgForm({
      name: o.name,
      contactEmail: o.contact_email ?? "",
      externalReference: o.external_reference ?? "",
    });
  }

  async function saveOrg(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!supabase || !editingOrg) return;
    setBusy(true);
    setNotice(null);
    try {
      const r = await supabase.rpc("update_organization", {
        target_organization_id: editingOrg.id,
        new_name: editOrgForm.name,
        new_contact_email: editOrgForm.contactEmail || null,
        new_external_reference: editOrgForm.externalReference || null,
      });
      if (r.error) throw r.error;
      setEditingOrg(null);
      await load(true, selected ?? undefined);
      setNotice({ kind: "success", message: "Company details updated." });
    } catch (e) {
      setNotice({ kind: "error", message: e instanceof Error ? e.message : "Unable to update company" });
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(o: Organization) {
    if (!supabase) return;
    const r = await supabase.from("organizations").update({ is_active: !o.is_active }).eq("id", o.id);
    if (r.error) return setNotice({ kind: "error", message: r.error.message });
    await load(true, selected ?? undefined);
  }

  async function expandMembers(orgId: number) {
    if (expandedOrgId === orgId) { setExpandedOrgId(null); return; }
    setExpandedOrgId(orgId);
    if (orgMembersCache[orgId]) return;
    if (!supabase) return;
    setMembersBusy(true);
    try {
      const r = await supabase.rpc("get_organization_members", { target_organization_id: orgId });
      if (r.error) throw r.error;
      setOrgMembersCache((prev) => ({ ...prev, [orgId]: (r.data ?? []) as MemberRow[] }));
    } catch (e) {
      setNotice({ kind: "error", message: e instanceof Error ? e.message : "Unable to load members" });
    } finally {
      setMembersBusy(false);
    }
  }

  async function removeMember(orgId: number, userId: string, email: string) {
    if (!supabase || !window.confirm(`Remove ${email} from this company?`)) return;
    setMembersBusy(true);
    try {
      const r = await supabase.rpc("remove_organization_member", {
        target_organization_id: orgId,
        target_user_id: userId,
      });
      if (r.error) throw r.error;
      setOrgMembersCache((prev) => ({
        ...prev,
        [orgId]: (prev[orgId] ?? []).filter((m) => m.user_id !== userId),
      }));
      setNotice({ kind: "success", message: `${email} removed.` });
    } catch (e) {
      setNotice({ kind: "error", message: e instanceof Error ? e.message : "Unable to remove member" });
    } finally {
      setMembersBusy(false);
    }
  }

  async function changeMemberRole(orgId: number, userId: string, newRole: string) {
    if (!supabase) return;
    setMembersBusy(true);
    try {
      const r = await supabase.rpc("update_member_role", {
        target_organization_id: orgId,
        target_user_id: userId,
        new_role: newRole,
      });
      if (r.error) throw r.error;
      setOrgMembersCache((prev) => ({
        ...prev,
        [orgId]: (prev[orgId] ?? []).map((m) =>
          m.user_id === userId ? { ...m, role: newRole as MemberRow["role"] } : m,
        ),
      }));
    } catch (e) {
      setNotice({ kind: "error", message: e instanceof Error ? e.message : "Unable to update role" });
    } finally {
      setMembersBusy(false);
    }
  }

  // ── Admin submission actions ──────────────────────────────────────────────

  async function reopen(r: ProgressRow) {
    if (!supabase || !r.submission_id) return;
    const reason = window.prompt("Reason for reopening:");
    if (!reason) return;
    const x = await supabase.rpc("reopen_submission", { target_submission_id: r.submission_id, reason });
    if (x.error) return setNotice({ kind: "error", message: x.error.message });
    await load(true, selected ?? undefined);
  }

  // ── Export actions ────────────────────────────────────────────────────────

  async function prepare() {
    try {
      setBusy(true);
      const data = await allExports({
        year: year ? Number(year) : undefined,
        company: company || undefined,
        question: question.toUpperCase() || undefined,
      });
      setExports(data);
      setExportPage(0);
      setNotice({ kind: "success", message: `${data.length} response rows prepared.` });
    } catch (e) {
      setNotice({ kind: "error", message: e instanceof Error ? e.message : "Export failed" });
    } finally {
      setBusy(false);
    }
  }

  async function downloadExport() {
    setBusy(true);
    try {
      const data = exports.length ? exports : await allExports();
      const fileName = `stica-${exportFormat}-${year || "all-years"}.xlsx`;
      if (exportFormat === "pivot") {
        await exportPivotXlsx(data, fileName);
      } else {
        await exportResponsesXlsx(data, fileName);
      }
    } catch (e) {
      setNotice({ kind: "error", message: e instanceof Error ? e.message : "Download failed" });
    } finally {
      setBusy(false);
    }
  }

  // ── Historical import ─────────────────────────────────────────────────────

  async function importHistory(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!supabase) return;
    const input = e.currentTarget.elements.namedItem("historyFile") as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      setBusy(true);
      const data = normalizeImportMatrix(await readImportWorkbook(file));
      const r = await supabase.rpc("import_historical_responses", { import_rows: data });
      if (r.error) throw r.error;
      setNotice({ kind: "success", message: `${r.data} historical rows imported.` });
      e.currentTarget.reset();
      await load(true, selected ?? undefined);
    } catch (x) {
      setNotice({ kind: "error", message: x instanceof Error ? x.message : "Import failed" });
    } finally {
      setBusy(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) return <Loading text="Loading administrator workspace" />;

  const navItems: Array<[string, string, string?]> = [
    ["dashboard", "Progress"],
    ["surveys", "Survey builder"],
    ["companies", "Companies"],
    ["data", "Import & export"],
    ["analytics", "Analytics"],
    ["audit", "Audit log"],
  ];

  return (
    <Shell admin view={view} setView={setView} items={navItems} user={session.user} name="STICA Administration">
      <NoticeBar notice={notice} clear={() => setNotice(null)} />

      {/* ── Confirm delete dialog ── */}
      {pendingDelete && (
        <div
          className="dialog-backdrop"
          role="presentation"
          onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) setPendingDelete(null); }}
        >
          <section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-question-title">
            <p className="eyebrow eyebrow--red">Delete draft question</p>
            <h2 id="delete-question-title">Remove {pendingDelete.stableKey}?</h2>
            <p>This removes the question only from the {selectedVersion?.reporting_year} draft. Published years and historical answers remain unchanged.</p>
            <div className="confirm-dialog__question">
              <code>{pendingDelete.stableKey}</code>
              <strong>{pendingDelete.prompt}</strong>
            </div>
            <div className="confirm-dialog__actions">
              <button type="button" className="button button--secondary" onClick={() => setPendingDelete(null)} disabled={busy}>Cancel</button>
              <button type="button" className="button button--danger" onClick={() => void remove(pendingDelete)} disabled={busy} aria-busy={busy}>
                {busy ? "Deleting…" : "Delete question"}
              </button>
            </div>
          </section>
        </div>
      )}

      {/* ── Edit org dialog ── */}
      {editingOrg && (
        <div
          className="dialog-backdrop"
          role="presentation"
          onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) setEditingOrg(null); }}
        >
          <section className="confirm-dialog confirm-dialog--wide" role="dialog" aria-modal="true" aria-labelledby="edit-org-title">
            <p className="eyebrow eyebrow--red">Edit company</p>
            <h2 id="edit-org-title">{editingOrg.name}</h2>
            <form onSubmit={saveOrg} className="dialog-form">
              <label>
                Company name
                <input
                  value={editOrgForm.name}
                  onChange={(e) => setEditOrgForm((f) => ({ ...f, name: e.target.value }))}
                  required
                />
              </label>
              <label>
                Contact email
                <input
                  type="email"
                  value={editOrgForm.contactEmail}
                  onChange={(e) => setEditOrgForm((f) => ({ ...f, contactEmail: e.target.value }))}
                  placeholder="Optional"
                />
              </label>
              <label>
                External reference
                <input
                  value={editOrgForm.externalReference}
                  onChange={(e) => setEditOrgForm((f) => ({ ...f, externalReference: e.target.value }))}
                  placeholder="Optional, e.g. STICA-2026-057"
                />
              </label>
              <div className="confirm-dialog__actions">
                <button type="button" className="button button--secondary" onClick={() => setEditingOrg(null)} disabled={busy}>Cancel</button>
                <button type="submit" className="button button--primary" disabled={busy} aria-busy={busy}>
                  {busy ? "Saving…" : "Save changes"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* ══════════════════════════ DASHBOARD ════════════════════════════════ */}
      {view === "dashboard" && (
        <div className="page">
          <div className="page-intro">
            <div>
              <p className="eyebrow eyebrow--red">Administrator dashboard</p>
              <h1>Reporting progress</h1>
              <p>{current?.name ?? "Create a reporting year to begin."}</p>
            </div>
            <button className="button button--primary" onClick={() => setView("surveys")}>
              Manage survey years
            </button>
          </div>

          <section className="metric-grid metric-grid--four">
            <article>
              <span>Active companies</span>
              <strong>{orgs.filter((o) => o.is_active).length}</strong>
            </article>
            <article>
              <span>Submitted</span>
              <strong>{submitted}</strong>
            </article>
            <article>
              <span>In progress</span>
              <strong>{inProgress}</strong>
            </article>
            <article>
              <span>Not started</span>
              <strong>{currentRows.filter((r) => r.status === "not_started").length}</strong>
            </article>
          </section>

          <section className="admin-table">
            <div className="admin-table__head">
              <div>
                <p className="eyebrow">Company status</p>
                <h3>{current?.reporting_year ?? "No active year"}</h3>
              </div>
              <button onClick={() => setView("data")}>Export</button>
            </div>
            <div className="table-scroll">
              <table className="responsive-table">
                <thead>
                  <tr>
                    <th>Company</th>
                    <th>Contact</th>
                    <th>Progress</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {currentRows.map((r) => (
                    <tr key={`${r.organization_id}-${r.survey_version_id}`}>
                      <td data-label="Company"><strong>{r.organization_name}</strong></td>
                      <td data-label="Contact">{r.contact_email ?? "Not set"}</td>
                      <td data-label="Progress">
                        <div className="table-progress">
                          <span><i style={{ width: `${r.completion_percent}%` }} /></span>
                          {r.completion_percent}%
                        </div>
                      </td>
                      <td data-label="Status">{r.status.replace("_", " ")}</td>
                      <td data-label="Action">
                        {r.status === "submitted" && (
                          <button className="table-action" onClick={() => void reopen(r)}>Reopen</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {/* ══════════════════════════ SURVEY BUILDER ════════════════════════════ */}
      {view === "surveys" && (
        <div className="page survey-builder-page">

          {/* Overview */}
          {surveyView === "overview" && (
            <>
              <div className="page-intro">
                <div>
                  <p className="eyebrow eyebrow--red">Persistent question IDs</p>
                  <h1>Survey builder</h1>
                  <p>Select a reporting year to manage its questions, carry-forward mappings, and publication status.</p>
                </div>
                <button className="button button--primary" onClick={beginCreateYear}>New reporting year</button>
              </div>
              <section className="survey-year-overview">
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">Reporting years</p>
                    <h3>{versions.length} years</h3>
                  </div>
                  <span>Choose a year to open its workspace</span>
                </div>
                <div className="version-list version-list--overview">
                  {versions.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => void openVersion(v)}
                      disabled={busy}
                      aria-busy={busy && selected === v.id}
                    >
                      <span>{v.reporting_year}</span>
                      <div>
                        <strong>{v.name}</strong>
                        <small>
                          <span className={`status-chip status-chip--${v.status}`}>{v.status}</span>
                        </small>
                      </div>
                      <em>{busy && selected === v.id ? "Opening…" : "Open workspace"}</em>
                    </button>
                  ))}
                </div>
              </section>
            </>
          )}

          {/* Create year */}
          {surveyView === "create-year" && (
            <>
              <button className="back-link builder-back" onClick={() => setSurveyView("overview")}>
                Back to reporting years
              </button>
              <div className="page-intro builder-subpage-intro">
                <div>
                  <p className="eyebrow eyebrow--red">New reporting cycle</p>
                  <h1>Create reporting year</h1>
                  <p>Start empty or clone an existing year. You can review every question before publishing.</p>
                </div>
              </div>
              <form className="panel-form builder-create-page" onSubmit={createYear}>
                <div className="form-guidance" role="note">
                  <strong>Draft first, publish when ready</strong>
                  <span>Creating a year does not make it visible to companies until you publish it.</span>
                </div>
                <div className="form-grid">
                  <label>
                    Year
                    <input
                      name="year"
                      type="number"
                      value={yearDraft.year}
                      onChange={(e) => setYearDraft({ year: e.target.value, name: `Climate Transition Plan Annual Report ${e.target.value}` })}
                      required
                    />
                  </label>
                  <label>
                    Name
                    <input
                      name="name"
                      value={yearDraft.name}
                      onChange={(e) => setYearDraft({ ...yearDraft, name: e.target.value })}
                      required
                    />
                  </label>
                  <label>Opens<input name="opens" type="datetime-local" /></label>
                  <label>Closes<input name="closes" type="datetime-local" /></label>
                </div>
                <label>
                  Clone from
                  <select name="clone">
                    <option value="">Start empty</option>
                    {versions.map((v) => (
                      <option key={v.id} value={v.id}>{v.reporting_year} · {v.name}</option>
                    ))}
                  </select>
                </label>
                <div className="builder-form-actions">
                  <button type="button" className="button button--secondary" onClick={() => setSurveyView("overview")} disabled={busy}>Cancel</button>
                  <button className="button button--ink" disabled={busy} aria-busy={busy}>
                    {busy ? "Creating draft…" : "Create draft"}
                  </button>
                </div>
              </form>
            </>
          )}

          {/* Workspace */}
          {surveyView === "workspace" && selectedVersion && (
            <>
              <button className="back-link builder-back" onClick={() => { setSurveyView("overview"); setPreviewMode(false); }}>
                Back to reporting years
              </button>
              <div className="page-intro builder-subpage-intro">
                <div>
                  <p className="eyebrow eyebrow--red">Reporting year {selectedVersion.reporting_year}</p>
                  <h1>{selectedVersion.name}</h1>
                  <p>
                    {questions.length} questions ·{" "}
                    <span className={`status-chip status-chip--${selectedVersion.status}`}>{selectedVersion.status}</span>
                  </p>
                </div>
                <div className="builder-header-actions">
                  <button
                    className={`button button--secondary ${previewMode ? "button--active" : ""}`}
                    onClick={() => setPreviewMode((p) => !p)}
                  >
                    {previewMode ? "Exit preview" : "Preview survey"}
                  </button>
                  {selectedVersion.status === "draft" && (
                    <button
                      className="button button--secondary"
                      onClick={() => { setForm(EMPTY_Q); setSurveyView("question"); }}
                    >
                      Add question
                    </button>
                  )}
                  {selectedVersion.status === "draft" && (
                    <button
                      className="button button--primary"
                      disabled={!questions.length || busy}
                      onClick={() => void publishYear()}
                    >
                      {busy ? "Publishing…" : "Publish reporting year"}
                    </button>
                  )}
                  {selectedVersion.status === "published" && (
                    <button
                      className="button button--danger"
                      disabled={busy}
                      onClick={() => void closeYear()}
                    >
                      {busy ? "Closing…" : "Close year"}
                    </button>
                  )}
                </div>
              </div>

              {selectedVersion.status !== "draft" && (
                <div className="builder-lock-note" role="note">
                  <div>
                    <strong>This reporting year is {selectedVersion.status === "published" ? "published (read-only)" : "closed"}</strong>
                    <span>
                      {selectedVersion.status === "published"
                        ? "Published questions are locked to preserve persistent IDs and audit history. To correct wording, create a new draft."
                        : "Closed years are archived. Data is preserved and available for export."}
                    </span>
                  </div>
                  {selectedVersion.status === "published" && (
                    <button type="button" className="button button--secondary" onClick={beginCreateYear}>
                      Create corrected draft
                    </button>
                  )}
                </div>
              )}

              {/* Preview mode */}
              {previewMode ? (
                <section className="preview-panel">
                  <div className="preview-banner">
                    <strong>Preview mode</strong>
                    <span>This is how companies will see the questions. Answers are not saved.</span>
                  </div>
                  <div className="preview-list">
                    {questions.map((q, i) => (
                      <div key={q.id} className="preview-item">
                        <div className="preview-item__meta">
                          <span className="preview-item__num">{i + 1}</span>
                          <code>{q.stableKey}</code>
                          <span className="preview-item__section">{q.sectionTitle}</span>
                          {q.required && <em className="preview-item__required">Required</em>}
                          {carry[q.id] && <span className="preview-item__carry">↩ {carry[q.id]}</span>}
                        </div>
                        <p className="preview-item__prompt">{q.prompt}</p>
                        {q.helpText && <p className="preview-item__help">{q.helpText}</p>}
                        {q.visibilityRule.questionKey && (
                          <p className="preview-item__condition">
                            Visible when <code>{q.visibilityRule.questionKey}</code> {q.visibilityRule.operator} {String(q.visibilityRule.value ?? "")}
                          </p>
                        )}
                        {["single_choice", "multiple_choice", "yes_no"].includes(q.type) && (
                          <div className="preview-item__options">
                            {(q.type === "yes_no" ? ["Yes", "No"] : q.options).map((opt) => (
                              <span key={opt} className="preview-option">{opt}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              ) : (
                <section className="builder-workspace">
                  <div className="question-catalog">
                    <div className="panel-heading">
                      <div>
                        <p className="eyebrow">Question library</p>
                        <h3>{questions.length} questions</h3>
                      </div>
                      <span>
                        {selectedVersion.status === "draft" ? "Editable draft" : selectedVersion.status}
                        {" · "}
                        Page {questionPage + 1} of {Math.max(1, Math.ceil(questions.length / Q_PAGE_SIZE))}
                      </span>
                    </div>

                    {openingVersion === selectedVersion.id ? (
                      <div className="empty-catalog loading-catalog" role="status">
                        <strong>Loading questions…</strong>
                        <p>Preparing the question workspace.</p>
                      </div>
                    ) : questions.length === 0 ? (
                      <div className="empty-catalog">
                        <strong>No questions yet</strong>
                        <p>Add the first question or clone from an existing year.</p>
                        {selectedVersion.status === "draft" && (
                          <button
                            className="button button--primary"
                            onClick={() => { setForm(EMPTY_Q); setSurveyView("question"); }}
                          >
                            Add first question
                          </button>
                        )}
                      </div>
                    ) : (
                      questions.slice(questionPage * Q_PAGE_SIZE, questionPage * Q_PAGE_SIZE + Q_PAGE_SIZE).map((q) => (
                        <article key={q.id}>
                          <div className="q-order-controls">
                            {selectedVersion.status === "draft" && (
                              <>
                                <button
                                  type="button"
                                  className="order-btn"
                                  title="Move up"
                                  disabled={busy || q.displayOrder === questions[0]?.displayOrder}
                                  onClick={() => void reorder(q, "up")}
                                >▲</button>
                                <button
                                  type="button"
                                  className="order-btn"
                                  title="Move down"
                                  disabled={busy || q.displayOrder === questions[questions.length - 1]?.displayOrder}
                                  onClick={() => void reorder(q, "down")}
                                >▼</button>
                              </>
                            )}
                            <span className="q-display-order">{q.displayOrder}</span>
                          </div>
                          <div>
                            <code>{q.stableKey}</code>
                            <h4>{q.prompt}</h4>
                            <p>
                              {q.sectionTitle} / {q.type.replace("_", " ")}
                              {carry[q.id] ? ` / Prefill: ${carry[q.id]}` : ""}
                            </p>
                          </div>
                          {selectedVersion.status === "draft" && (
                            <div className="row-actions" aria-label={`Actions for ${q.stableKey}`}>
                              <button type="button" onClick={() => edit(q)}>Edit</button>
                              <button type="button" className="danger-link" onClick={() => setPendingDelete(q)}>Delete</button>
                            </div>
                          )}
                        </article>
                      ))
                    )}

                    {questions.length > Q_PAGE_SIZE && (
                      <div className="catalog-pager">
                        <button
                          type="button"
                          disabled={questionPage === 0}
                          onClick={() => setQuestionPage((p) => Math.max(0, p - 1))}
                        >
                          Previous
                        </button>
                        <span>
                          Page {questionPage + 1} of {Math.max(1, Math.ceil(questions.length / Q_PAGE_SIZE))}
                        </span>
                        <button
                          type="button"
                          disabled={(questionPage + 1) * Q_PAGE_SIZE >= questions.length}
                          onClick={() => setQuestionPage((p) => p + 1)}
                        >
                          Next
                        </button>
                      </div>
                    )}
                  </div>
                </section>
              )}
            </>
          )}

          {/* Question editor */}
          {surveyView === "question" && selectedVersion && (
            <>
              <button
                className="back-link builder-back"
                onClick={() => { setForm(EMPTY_Q); setSurveyView("workspace"); }}
              >
                Back to {selectedVersion.reporting_year} questions
              </button>
              <div className="page-intro builder-subpage-intro">
                <div>
                  <p className="eyebrow eyebrow--red">{form.id ? "Question revision" : "New question"}</p>
                  <h1>{form.id ? `Revise ${form.stableKey}` : "Add question"}</h1>
                  <p>Reporting year {selectedVersion.reporting_year}. Persistent IDs keep historical answers mapped across years.</p>
                </div>
              </div>
              <form className="panel-form question-builder question-editor-page" onSubmit={saveQ}>
                <div className="form-grid">
                  <label>
                    Persistent ID
                    <input
                      value={form.stableKey}
                      disabled={form.id !== null}
                      onChange={(e) => setForm({ ...form, stableKey: e.target.value.toUpperCase() })}
                      pattern="[A-Z][A-Z0-9]*-[0-9]{3,}"
                      placeholder="e.g. GOV-016"
                      title="Use an uppercase category prefix, a hyphen, and at least three digits."
                      required
                    />
                  </label>
                  <label>
                    Category
                    <input
                      value={form.category}
                      onChange={(e) => setForm({ ...form, category: e.target.value })}
                      placeholder="e.g. Governance, strategy and targets"
                      required
                    />
                  </label>
                  <label>
                    Section key
                    <input
                      value={form.sectionKey}
                      onChange={(e) => setForm({ ...form, sectionKey: e.target.value })}
                      placeholder="e.g. governance-targets"
                      required
                    />
                  </label>
                  <label>
                    Section title
                    <input
                      value={form.sectionTitle}
                      onChange={(e) => setForm({ ...form, sectionTitle: e.target.value })}
                      placeholder="e.g. Governance targets"
                      required
                    />
                  </label>
                </div>
                <label>
                  Question
                  <textarea
                    rows={4}
                    value={form.prompt}
                    onChange={(e) => setForm({ ...form, prompt: e.target.value })}
                    placeholder="Write the question exactly as companies should see it."
                    required
                  />
                </label>
                <label>
                  Help text
                  <textarea
                    value={form.help}
                    onChange={(e) => setForm({ ...form, help: e.target.value })}
                    placeholder="Optional guidance, definitions, or reporting boundaries."
                  />
                </label>
                <div className="form-grid">
                  <label>
                    Type
                    <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as QuestionType })}>
                      {["text", "textarea", "number", "yes_no", "single_choice", "multiple_choice", "date"].map((x) => (
                        <option key={x}>{x.replace("_", " ")}</option>
                      ))}
                    </select>
                  </label>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={form.required}
                      onChange={(e) => setForm({ ...form, required: e.target.checked })}
                    />
                    Required response
                  </label>
                </div>
                {["single_choice", "multiple_choice"].includes(form.type) && (
                  <label>
                    Options, one per line
                    <textarea
                      rows={4}
                      value={form.options}
                      onChange={(e) => setForm({ ...form, options: e.target.value })}
                      placeholder={"Option one\nOption two\nOption three"}
                    />
                  </label>
                )}
                <fieldset>
                  <legend>Carry-forward mapping</legend>
                  <p className="fieldset-help">Use only when this question intentionally inherits an answer from an approved previous-year question.</p>
                  <label>
                    Approved source question ID
                    <input
                      value={form.carry}
                      onChange={(e) => setForm({ ...form, carry: e.target.value.toUpperCase() })}
                      placeholder="Optional, e.g. GOV-015"
                    />
                  </label>
                </fieldset>
                <fieldset>
                  <legend>Conditional visibility</legend>
                  <p className="fieldset-help">Leave Depends on empty to show this question to every company.</p>
                  <div className="form-grid">
                    <label>
                      Depends on
                      <input
                        value={form.condition}
                        onChange={(e) => setForm({ ...form, condition: e.target.value.toUpperCase() })}
                        placeholder="Optional question ID"
                      />
                    </label>
                    <label>
                      Operator
                      <select value={form.operator} onChange={(e) => setForm({ ...form, operator: e.target.value })}>
                        <option value="equals">Equals</option>
                        <option value="not_equals">Not equals</option>
                        <option value="contains">Contains</option>
                        <option value="is_answered">Is answered</option>
                      </select>
                    </label>
                  </div>
                  {form.operator !== "is_answered" && (
                    <label>
                      Expected value
                      <input
                        value={form.expected}
                        onChange={(e) => setForm({ ...form, expected: e.target.value })}
                        placeholder="Value that makes this question visible"
                      />
                    </label>
                  )}
                </fieldset>
                <div className="builder-form-actions">
                  <button
                    type="button"
                    className="button button--secondary"
                    onClick={() => { setForm(EMPTY_Q); setSurveyView("workspace"); }}
                    disabled={busy}
                  >
                    Cancel
                  </button>
                  <button className="button button--primary" disabled={busy} aria-busy={busy}>
                    {busy ? "Saving question…" : form.id ? "Save revision" : "Add question"}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      )}

      {/* ══════════════════════════ COMPANIES ════════════════════════════════ */}
      {view === "companies" && (
        <div className="page">
          <div className="page-intro">
            <div>
              <p className="eyebrow eyebrow--red">Secure participation</p>
              <h1>Companies</h1>
            </div>
          </div>

          <section className="two-column-admin">
            <form className="panel-form" onSubmit={invite}>
              <h3>Add company &amp; invite</h3>
              <div className="form-guidance" role="note">
                <strong>Example company entry</strong>
                <span>Nordic Weave AB · nordic-weave-ab · Anna Lindberg · anna.lindberg@nordicweave.com</span>
                <small>All fields are required except External reference.</small>
              </div>
              <label>
                Company name
                <input name="companyName" required placeholder="e.g. Nordic Weave AB" />
              </label>
              <label>
                Company slug
                <input
                  name="companySlug"
                  pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                  required
                  placeholder="e.g. nordic-weave-ab"
                  aria-describedby="company-slug-help"
                />
                <small className="form-help" id="company-slug-help">
                  Lowercase letters and numbers only; separate words with hyphens.
                </small>
              </label>
              <label>Contact name<input name="fullName" required placeholder="e.g. Anna Lindberg" /></label>
              <label>Email<input name="email" type="email" required placeholder="e.g. anna@nordicweave.com" /></label>
              <label>
                External reference
                <input name="externalReference" placeholder="Optional, e.g. STICA-2026-057" />
              </label>
              <button className="button button--primary" disabled={busy}>Send secure invitation</button>
            </form>

            <div className="company-directory">
              <div className="company-directory__header">
                <strong>{orgs.length} companies</strong>
                <small>{orgs.filter((o) => o.is_active).length} active</small>
              </div>
              {orgs.map((o) => (
                <article key={o.id} className={!o.is_active ? "inactive" : ""}>
                  <div className="company-card__main">
                    <span className="company-avatar">{o.name.slice(0, 2).toUpperCase()}</span>
                    <div>
                      <strong>{o.name}</strong>
                      <small>{o.contact_email ?? "No email"}</small>
                      <small className="company-meta">{o.slug}{o.external_reference ? ` · ${o.external_reference}` : ""}</small>
                    </div>
                    <em className={`company-status ${o.is_active ? "company-status--active" : ""}`}>
                      {o.is_active ? "Active" : "Archived"}
                    </em>
                  </div>
                  <div className="company-card__actions">
                    <button
                      className="table-action"
                      onClick={() => beginEditOrg(o)}
                    >
                      Edit
                    </button>
                    <button
                      className="table-action"
                      onClick={() => void expandMembers(o.id)}
                    >
                      {expandedOrgId === o.id ? "Hide members" : "Members"}
                    </button>
                    <button
                      className={o.is_active ? "danger-link" : "table-action"}
                      onClick={() => void toggleActive(o)}
                    >
                      {o.is_active ? "Archive" : "Reactivate"}
                    </button>
                  </div>

                  {/* Members panel */}
                  {expandedOrgId === o.id && (
                    <div className="members-panel">
                      {membersBusy && !orgMembersCache[o.id] ? (
                        <p className="members-loading">Loading members…</p>
                      ) : (orgMembersCache[o.id] ?? []).length === 0 ? (
                        <p className="members-empty">No linked users. Use the invite form to add one.</p>
                      ) : (
                        <table className="members-table">
                          <thead>
                            <tr>
                              <th>Name</th>
                              <th>Email</th>
                              <th>Role</th>
                              <th>Since</th>
                              <th></th>
                            </tr>
                          </thead>
                          <tbody>
                            {(orgMembersCache[o.id] ?? []).map((m) => (
                              <tr key={m.user_id}>
                                <td>{m.full_name}</td>
                                <td><small>{m.email}</small></td>
                                <td>
                                  <select
                                    value={m.role}
                                    disabled={membersBusy}
                                    onChange={(e) => void changeMemberRole(o.id, m.user_id, e.target.value)}
                                    className="member-role-select"
                                  >
                                    <option value="member">Member</option>
                                    <option value="company_admin">Company admin</option>
                                  </select>
                                </td>
                                <td><small>{formatDate(m.created_at)}</small></td>
                                <td>
                                  <button
                                    className="danger-link"
                                    disabled={membersBusy}
                                    onClick={() => void removeMember(o.id, m.user_id, m.email)}
                                  >
                                    Remove
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}
                </article>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* ══════════════════════════ DATA ═════════════════════════════════════ */}
      {view === "data" && (
        <div className="page">
          <div className="page-intro">
            <div>
              <p className="eyebrow eyebrow--red">Portable reporting data</p>
              <h1>Import &amp; export</h1>
            </div>
          </div>

          <section className="data-grid">
            {/* Import */}
            <form className="panel-form" onSubmit={importHistory}>
              <h3>Historical Excel / CSV import</h3>
              <p>
                Required columns: <code>company_name, company_slug, reporting_year, question_key, answer</code>
              </p>
              <input name="historyFile" type="file" accept=".xlsx,.csv" required />
              <button className="button button--ink" disabled={busy}>
                {busy ? "Importing…" : "Import historical responses"}
              </button>
            </form>

            {/* Export */}
            <div className="panel-form">
              <h3>Flexible export</h3>
              <div className="export-format-toggle">
                <button
                  type="button"
                  className={`toggle-btn ${exportFormat === "flat" ? "toggle-btn--active" : ""}`}
                  onClick={() => setExportFormat("flat")}
                >
                  Flat / long format
                </button>
                <button
                  type="button"
                  className={`toggle-btn ${exportFormat === "pivot" ? "toggle-btn--active" : ""}`}
                  onClick={() => setExportFormat("pivot")}
                >
                  Pivot / wide format
                </button>
              </div>
              <p className="export-format-desc">
                {exportFormat === "flat"
                  ? "One row per answer — best for programmatic analysis."
                  : "One row per company per year, one column per question — best for comparisons."}
              </p>
              <div className="form-grid">
                <label>
                  Year
                  <select value={year} onChange={(e) => setYear(e.target.value)}>
                    <option value="">All years</option>
                    {years.map((y) => <option key={y}>{y}</option>)}
                  </select>
                </label>
                <label>
                  Company
                  <select value={company} onChange={(e) => setCompany(e.target.value)}>
                    <option value="">All companies</option>
                    {orgs.map((o) => <option key={o.id} value={o.slug}>{o.name}</option>)}
                  </select>
                </label>
              </div>
              <label>
                Question ID filter
                <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="e.g. GOV-001" />
              </label>
              <button className="button button--secondary" onClick={() => void prepare()} disabled={busy}>
                {busy ? "Preparing…" : "Prepare data"}
              </button>
              <div className="export-actions">
                <button className="button button--primary" onClick={() => void downloadExport()} disabled={busy}>
                  {busy ? "Generating…" : `Download Excel (${exportFormat})`}
                </button>
                <button className="button button--secondary" onClick={() => print()}>
                  Print / PDF
                </button>
              </div>
            </div>
          </section>

          {/* Export preview */}
          {exports.length > 0 && (
            <section className="admin-table export-preview">
              <div className="admin-table__head">
                <h3>{exports.length} response rows</h3>
                <div className="export-pager-controls">
                  <button
                    type="button"
                    disabled={exportPage === 0}
                    onClick={() => setExportPage((p) => p - 1)}
                  >
                    ← Prev
                  </button>
                  <span>
                    {exportPage * EXPORT_PAGE_SIZE + 1}–{Math.min((exportPage + 1) * EXPORT_PAGE_SIZE, exports.length)} of {exports.length}
                  </span>
                  <button
                    type="button"
                    disabled={(exportPage + 1) * EXPORT_PAGE_SIZE >= exports.length}
                    onClick={() => setExportPage((p) => p + 1)}
                  >
                    Next →
                  </button>
                </div>
              </div>
              <div className="table-scroll">
                <table className="responsive-table responsive-table--export">
                  <thead>
                    <tr>
                      <th>Year</th>
                      <th>Company</th>
                      <th>ID</th>
                      <th>Question</th>
                      <th>Answer</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleExports.map((r, i) => (
                      <tr key={i}>
                        <td data-label="Year">{r.reporting_year}</td>
                        <td data-label="Company">{r.company_name}</td>
                        <td data-label="Question ID"><code>{r.question_key}</code></td>
                        <td data-label="Question">{r.question_prompt}</td>
                        <td data-label="Answer">{valueAsText(r.answer)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      )}

      {/* ══════════════════════════ ANALYTICS ════════════════════════════════ */}
      {view === "analytics" && (
        <div className="page">
          <div className="page-intro">
            <div>
              <p className="eyebrow eyebrow--red">Lightweight analytics</p>
              <h1>Participation trends</h1>
            </div>
          </div>
          <section className="analytics-grid">
            <article className="chart-card">
              <h3>Average completion by year</h3>
              <div className="bar-chart">
                {years.map((y) => {
                  const rr = rows.filter((r) => r.reporting_year === y);
                  const avg = rr.length ? Math.round(rr.reduce((s, r) => s + r.completion_percent, 0) / rr.length) : 0;
                  return (
                    <div key={y}>
                      <span>{y}</span>
                      <div><i style={{ width: `${avg}%` }} /></div>
                      <strong>{avg}%</strong>
                    </div>
                  );
                })}
              </div>
            </article>

            <article className="chart-card">
              <h3>Current status</h3>
              <div className="donut-wrap">
                <div
                  className="analytics-donut"
                  style={{
                    "--submitted": `${currentRows.length ? (submitted / currentRows.length) * 360 : 0}deg`,
                    "--progress": `${currentRows.length ? ((submitted + inProgress) / currentRows.length) * 360 : 0}deg`,
                  } as React.CSSProperties}
                >
                  <span>
                    <strong>{currentRows.length}</strong>
                    companies
                  </span>
                </div>
                <ul className="status-legend">
                  <li><span>Submitted</span><strong>{submitted}</strong></li>
                  <li><span>In progress</span><strong>{inProgress}</strong></li>
                  <li><span>Not started</span><strong>{currentRows.length - submitted - inProgress}</strong></li>
                </ul>
              </div>
            </article>

            <article className="chart-card chart-card--wide">
              <div className="trajectory-heading">
                <div>
                  <h3>Company trajectory</h3>
                  <p>Annual reporting completion by company</p>
                </div>
                <span>{orgs.filter((o) => o.is_active).length} active companies</span>
              </div>
              <div className="trajectory-table">
                {orgs.filter((o) => o.is_active).map((o) => (
                  <article className="trajectory-company" key={o.id}>
                    <div className="trajectory-company__name">
                      <strong>{o.name}</strong>
                      <span>Completion history</span>
                    </div>
                    <div className="trajectory-company__years">
                      {years.map((y) => {
                        const completion = rows.find((r) => r.organization_id === o.id && r.reporting_year === y)?.completion_percent ?? 0;
                        return (
                          <div key={y}>
                            <span>{y}</span>
                            <strong>{completion}%</strong>
                            <i aria-hidden="true"><b style={{ width: `${completion}%` }} /></i>
                          </div>
                        );
                      })}
                    </div>
                  </article>
                ))}
              </div>
            </article>
          </section>
        </div>
      )}

      {/* ══════════════════════════ AUDIT LOG ════════════════════════════════ */}
      {view === "audit" && <AuditLogView orgs={orgs} />}
    </Shell>
  );
}

// ── Root App ──────────────────────────────────────────────────────────────────

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>();
  const [recovery, setRecovery] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  if (!supabase) {
    return (
      <main className="centered-shell">
        <section className="setup-card">
          <Logo />
          <h1>Supabase configuration required</h1>
          <p>Add the project URL and publishable key. Never use a secret key in the frontend.</p>
        </section>
      </main>
    );
  }

  if (session === undefined) return <Loading />;

  if (!session) return <Login />;

  if (recovery) {
    return (
      <main className="centered-shell">
        <section className="setup-card">
          <h1>Set a new password</h1>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const p = String(new FormData(e.currentTarget).get("password"));
              const r = await supabase!.auth.updateUser({ password: p });
              if (!r.error) setRecovery(false);
            }}
          >
            <label>
              New password
              <input name="password" type="password" minLength={8} required />
            </label>
            <button className="button button--primary">Save password</button>
          </form>
        </section>
      </main>
    );
  }

  return session.user.app_metadata?.role === "platform_admin"
    ? <AdminPortal session={session} />
    : <CompanyPortal session={session} />;
}

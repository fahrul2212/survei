import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ClipboardPlus,
  Clock3,
  LockKeyhole,
  Plus,
  Printer,
  RotateCcw,
  Send,
} from "lucide-react";
import { supabase } from "./lib/supabase";
import {
  evaluateVisibility,
  formatDate,
  isAnswered,
  normalizeImportMatrix,
  parseSurveyQuestion,
  slugify,
  surveyDisplayTitle,
  valueAsText,
  type AnswerRecord,
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
import {
  Button,
  EmptyState,
  Loading,
  Logo,
  NoticeBar,
  PageHeader,
  QuestionField,
  SearchField,
  Shell,
  type Notice,
} from "./components/ui";
import { AuditLogView } from "./components/admin/AuditLogView";
import { CompanyDirectory, type CompanyStatusFilter } from "./components/admin/CompanyDirectory";
import { SurveyWorkspaceHeader } from "./components/admin/SurveyWorkspaceHeader";

// ── Constants ─────────────────────────────────────────────────────────────────

const QUESTION_SELECT = `id,survey_version_id,display_order,is_required,carry_forward_enabled,visibility_rule,section_key,section_title,question_revision:question_revisions!inner(id,prompt,help_text,question_type,options,validation,question:question_definitions!inner(id,stable_key,category))`;
const EXPORT_PAGE_SIZE = 25;
const Q_PAGE_SIZE = 12;
const ORG_PAGE_SIZE = 12;

// ── Types ─────────────────────────────────────────────────────────────────────

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

// ── Icons ─────────────────────────────────────────────────────────────────────

// ── Shared components ─────────────────────────────────────────────────────────

// ── Login ─────────────────────────────────────────────────────────────────────

function Login() {
  const [reset, setReset] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
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
          <p>Submit your Climate Transition Plan securely — pre-filled from last year's verified data.</p>
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
              ? "We will send a secure reset link to your email."
              : "Use the account included in your STICA invitation."}
          </p>
          <form onSubmit={submit}>
            <label>
              Work email
              <input
                type="email"
                value={email}
                placeholder="name@company.com"
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
            {!reset && (
              <label>
                Password
                <div className="password-field">
                  <input
                    type={showPw ? "text" : "password"}
                    value={password}
                    placeholder="Enter your password"
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(!showPw)}
                    className="password-toggle"
                  >
                    {showPw ? "Hide" : "Show"}
                  </button>
                </div>
              </label>
            )}
            {error && <p className="form-error">{error}</p>}
            {message && <p className="form-success">{message}</p>}
            <button className="button button--primary" disabled={busy}>
              {busy ? "Please wait…" : reset ? "Send reset link" : "Sign in to portal"}
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

// ── QuestionField ─────────────────────────────────────────────────────────────

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
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [selectedSection, setSelectedSection] = useState<string>("all");

  const active = visible.find((q) => q.id === activeId) ?? visible[0];
  const index = visible.indexOf(active);
  const readOnly = submission.status === "submitted";
  const answered = visible.filter((q) => isAnswered(answers[q.id])).length;

  const sectionKeys = useMemo(() => {
    const map = new Map<string, string>();
    for (const q of visible) {
      map.set(q.sectionKey, q.sectionTitle);
    }
    return Array.from(map.entries());
  }, [visible]);

  const filteredVisible = useMemo(() => {
    if (selectedSection === "all") return visible;
    return visible.filter((q) => q.sectionKey === selectedSection);
  }, [selectedSection, visible]);

  useEffect(() => {
    if (active && !visible.some((q) => q.id === activeId)) setActiveId(active.id);
  }, [active, activeId, visible]);

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        if (index < visible.length - 1) {
          void commit(answers[active.id] ?? null);
          setActiveId(visible[index + 1].id);
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [active, answers, index, visible]);

  if (!active) {
    return (
      <div className="empty-state page">
        <h2>No visible questions</h2>
        <button className="button button--secondary" onClick={back}>Back to overview</button>
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
      {/* Submit confirmation dialog */}
      {confirmSubmit && (
        <div className="dialog-backdrop" role="presentation" onMouseDown={() => setConfirmSubmit(false)}>
          <section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="submit-modal-title">
            <p className="eyebrow eyebrow--red">Final submission</p>
            <h2 id="submit-modal-title">Submit {version.reporting_year} Report?</h2>
            <p>
              You have completed <strong>{answered} of {visible.length}</strong> questions ({Math.round((answered / visible.length) * 100)}%).
            </p>
            <div className="confirm-dialog__question confirm-dialog__question--spaced">
              <span>Once submitted, your report is locked for review. An administrator must reopen it if any revisions are needed.</span>
            </div>
            <div className="confirm-dialog__actions">
              <button type="button" className="button button--secondary" onClick={() => setConfirmSubmit(false)}>
                Continue editing
              </button>
              <button
                type="button"
                className="button button--primary"
                onClick={async () => {
                  setConfirmSubmit(false);
                  await submit();
                }}
              >
                Confirm &amp; submit report
              </button>
            </div>
          </section>
        </div>
      )}

      <aside className="report-outline">
        <button className="back-link" onClick={back}>Back to overview</button>
        <div className="report-header-row">
          <p className="eyebrow eyebrow--tight">Annual report {version.reporting_year}</p>
          <span className="live-autosave-pill">
            {readOnly ? <><LockKeyhole size={13} /> Read only</> : saving ? <><Clock3 size={13} /> Saving…</> : <><Check size={13} /> Saved</>}
          </span>
        </div>
        <h2>{active.sectionTitle}</h2>
        <div className="outline-progress">
          <span>
            <i style={{ width: `${visible.length ? (answered / visible.length) * 100 : 0}%` }} />
          </span>
          <small>{answered} of {visible.length} answered ({visible.length ? Math.round((answered / visible.length) * 100) : 0}%)</small>
        </div>

        {/* Section Filter */}
        {sectionKeys.length > 1 && (
          <div className="section-filter-wrap">
            <select
              value={selectedSection}
              onChange={(e) => setSelectedSection(e.target.value)}
              className="section-filter-select"
            >
              <option value="all">All sections ({visible.length} questions)</option>
              {sectionKeys.map(([k, t]) => (
                <option key={k} value={k}>{t} ({visible.filter((q) => q.sectionKey === k).length})</option>
              ))}
            </select>
          </div>
        )}

        <div className="palette-panel">
          <div className="palette-header">
            <span>Question navigator</span>
            <strong>{answered}/{visible.length}</strong>
          </div>
          <div className="palette-legend" aria-label="Question status legend">
            <span><i className="legend-dot legend-dot--answered" />Answered</span>
            <span><i className="legend-dot" />Unanswered</span>
            <span><i className="legend-dot legend-dot--active" />Current</span>
          </div>
          <div className="question-index" role="navigation" aria-label="Question navigator" tabIndex={0}>
            {filteredVisible.map((q) => {
              const overallIdx = visible.indexOf(q);
              return (
                <button
                  key={q.id}
                  className={`${q.id === active.id ? "active " : ""}${isAnswered(answers[q.id]) ? "answered" : "unanswered"}`}
                  aria-label={`Question ${overallIdx + 1}, ${isAnswered(answers[q.id]) ? "answered" : "not answered"}: ${q.prompt}`}
                  title={`${overallIdx + 1}. ${q.prompt}`}
                  onClick={() => setActiveId(q.id)}
                >
                  <span>{overallIdx + 1}</span>
                  <div>
                    <strong>{q.stableKey}</strong>
                    <small>{q.sectionTitle}</small>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </aside>

      <section className="question-stage">
        <div className="question-card" key={active.id}>
          <div className="question-meta">
            <span>Question {index + 1} of {visible.length}</span>
            <div className="question-meta-actions">
              <span className="question-save-indicator">
                {readOnly ? <><LockKeyhole size={13} /> Submitted · read only</> : saving ? <><Clock3 size={13} /> Saving securely…</> : <><Check size={13} /> All changes saved</>}
              </span>
              <code>{active.stableKey}</code>
            </div>
          </div>
          <p className="section-kicker">{active.sectionTitle} / {active.category}</p>
          <h1>{active.prompt}</h1>
          {active.helpText && <p className="question-help">{active.helpText}</p>}
          {active.carryForwardEnabled && isAnswered(answers[active.id]) && !readOnly && (
            <div className="previous-answer">
              <span><Check size={14} /> Prefilled from previous verified report</span>
              <p>Please review and confirm this response remains accurate, or update it below.</p>
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
              <ArrowLeft size={16} aria-hidden="true" /> Previous
            </button>
            {index < visible.length - 1 ? (
              <button
                className="button button--primary"
                onClick={async () => {
                  await commit(answers[active.id] ?? null);
                  setActiveId(visible[index + 1].id);
                }}
              >
                Save &amp; next <ArrowRight size={16} aria-hidden="true" />
              </button>
            ) : readOnly ? (
              <button className="button button--secondary" onClick={() => print()}>
                <Printer size={16} aria-hidden="true" /> Print / save PDF
              </button>
            ) : (
              <button className="button button--primary" onClick={() => setConfirmSubmit(true)}>
                Review &amp; submit <Check size={16} aria-hidden="true" />
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
    setPwNotice({ kind: "success", message: "Password updated successfully." });
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
              placeholder={nameLoaded ? "Your full name" : "Loading…"}
              disabled={!nameLoaded || nameBusy}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>
          <button className="button button--primary" disabled={!nameLoaded || nameBusy}>
            {nameBusy ? "Saving…" : "Save display name"}
          </button>
        </form>

        <form className="panel-form" onSubmit={changePassword}>
          <h3>Change password</h3>
          {pwNotice && (
            <p className={pwNotice.kind === "error" ? "form-error" : "form-success"}>{pwNotice.message}</p>
          )}
          <label>
            New password
            <input type="password" value={password} minLength={8} placeholder="Min. 8 characters" onChange={(e) => setPassword(e.target.value)} required />
          </label>
          <label>
            Confirm password
            <input type="password" value={confirm} placeholder="Repeat new password" onChange={(e) => setConfirm(e.target.value)} required />
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
          <button className="button button--secondary" onClick={() => void supabase?.auth.signOut()}>Sign out</button>
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
                    ● {submission.status.replace("_", " ")}
                  </span>
                  <h2>{version.name}</h2>
                  <p>Approved persistent question mappings preserve reliable prior-year responses for review.</p>
                  <button className="button button--ink" onClick={() => setView("report")}>
                    {submission.status === "submitted" ? "View submission" : "Continue reporting"}
                    <ArrowRight size={16} aria-hidden="true" />
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
                  <p>{answered} of {visible.length} responses completed</p>
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
                          {s.answered === s.total ? <Check size={16} aria-label="Complete" /> : `${Math.round((s.answered / s.total) * 100)}%`}
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
                  <div>
                    <span className="eyebrow info-card__eyebrow">
                      Baseline data
                    </span>
                    <div className="info-card__number">
                      {questions.filter((q) => q.carryForwardEnabled && isAnswered(answers[q.id])).length}
                    </div>
                    <h3 className="info-card__title">responses prefilled</h3>
                    <p className="info-card__copy">
                      Verified responses from prior reporting cycles are automatically carried forward for your review.
                    </p>
                  </div>
                  <button className="button info-card__action" onClick={() => setView("report")}>
                    Review responses <ArrowRight size={16} aria-hidden="true" />
                  </button>
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
              <p>Review and reference historical submissions and validated transition plans.</p>
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
                    <p>{s.submitted_at ? `Submitted ${formatDate(s.submitted_at)}` : `Last saved ${formatDate(s.updated_at)}`}</p>
                  </div>
                  <strong>● {s.status}</strong>
                  <button onClick={() => void open(v)}>View report <ArrowRight size={15} aria-hidden="true" /></button>
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

  // Filters & Search
  const [dashSearch, setDashSearch] = useState("");
  const [dashStatusFilter, setDashStatusFilter] = useState<string>("all");
  const [qSearch, setQSearch] = useState("");
  const [qSectionFilter, setQSectionFilter] = useState("");
  const [orgSearch, setOrgSearch] = useState("");
  const [orgStatusFilter, setOrgStatusFilter] = useState<CompanyStatusFilter>("all");
  const [orgPage, setOrgPage] = useState(0);

  // Reopen modal
  const [reopenTarget, setReopenTarget] = useState<ProgressRow | null>(null);
  const [reopenReason, setReopenReason] = useState("");

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

  // Company management (Modals & Edit)
  const [addOrgModalOpen, setAddOrgModalOpen] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [newOrgSlug, setNewOrgSlug] = useState("");
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [editingOrg, setEditingOrg] = useState<Organization | null>(null);
  const [editOrgForm, setEditOrgForm] = useState({ name: "", contactEmail: "", externalReference: "" });
  const [membersModalOrg, setMembersModalOrg] = useState<Organization | null>(null);
  const [orgMembersCache, setOrgMembersCache] = useState<Record<number, MemberRow[]>>({});
  const [membersBusy, setMembersBusy] = useState(false);

  // Data / export
  const [exports, setExports] = useState<ExportRow[]>([]);
  const [exportFormat, setExportFormat] = useState<"flat" | "pivot">("flat");
  const [exportPage, setExportPage] = useState(0);
  const [year, setYear] = useState("");
  const [company, setCompany] = useState("");
  const [question, setQuestion] = useState("");
  const [importFileName, setImportFileName] = useState("");

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
  
  const filteredDashboardRows = useMemo(() => {
    return currentRows.filter((r) => {
      const matchesSearch =
        !dashSearch ||
        r.organization_name.toLowerCase().includes(dashSearch.toLowerCase()) ||
        (r.contact_email && r.contact_email.toLowerCase().includes(dashSearch.toLowerCase()));
      const matchesStatus =
        dashStatusFilter === "all" ||
        (dashStatusFilter === "submitted" && r.status === "submitted") ||
        (dashStatusFilter === "in_progress" && (r.status === "draft" || r.status === "reopened")) ||
        (dashStatusFilter === "not_started" && r.status === "not_started");
      return matchesSearch && matchesStatus;
    });
  }, [currentRows, dashSearch, dashStatusFilter]);

  const submitted = currentRows.filter((r) => r.status === "submitted").length;
  const inProgress = currentRows.filter((r) => r.status === "draft" || r.status === "reopened").length;
  const notStarted = currentRows.filter((r) => r.status === "not_started").length;
  const years = [...new Set(rows.map((r) => r.reporting_year))].sort((a, b) => b - a);
  const visibleExports = exports.slice(exportPage * EXPORT_PAGE_SIZE, (exportPage + 1) * EXPORT_PAGE_SIZE);

  const filteredQuestions = useMemo(() => {
    return questions.filter((q) => {
      const matchesSearch =
        !qSearch ||
        q.stableKey.toLowerCase().includes(qSearch.toLowerCase()) ||
        q.prompt.toLowerCase().includes(qSearch.toLowerCase()) ||
        q.sectionTitle.toLowerCase().includes(qSearch.toLowerCase());
      const matchesSection = !qSectionFilter || q.sectionKey === qSectionFilter;
      return matchesSearch && matchesSection;
    });
  }, [qSearch, qSectionFilter, questions]);

  const filteredOrgs = useMemo(() => {
    return orgs.filter((o) => {
      const matchesSearch =
        !orgSearch ||
        o.name.toLowerCase().includes(orgSearch.toLowerCase()) ||
        o.slug.toLowerCase().includes(orgSearch.toLowerCase()) ||
        (o.contact_email && o.contact_email.toLowerCase().includes(orgSearch.toLowerCase())) ||
        (o.external_reference && o.external_reference.toLowerCase().includes(orgSearch.toLowerCase()));
      const matchesStatus =
        orgStatusFilter === "all" ||
        (orgStatusFilter === "active" && o.is_active) ||
        (orgStatusFilter === "inactive" && !o.is_active);
      return matchesSearch && matchesStatus;
    });
  }, [orgSearch, orgStatusFilter, orgs]);

  const totalOrgPages = Math.max(1, Math.ceil(filteredOrgs.length / ORG_PAGE_SIZE));
  const paginatedOrgs = useMemo(() => {
    return filteredOrgs.slice(orgPage * ORG_PAGE_SIZE, (orgPage + 1) * ORG_PAGE_SIZE);
  }, [filteredOrgs, orgPage]);

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
      setNotice({ kind: "success", message: `${q.stableKey} removed from the draft.` });
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
    if (!supabase || !selectedVersion) return;
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
    if (!supabase || !selectedVersion) return;
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
    setAddOrgModalOpen(false);
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

  async function openMembersModal(o: Organization) {
    setMembersModalOrg(o);
    if (orgMembersCache[o.id]) return;
    if (!supabase) return;
    setMembersBusy(true);
    try {
      const r = await supabase.rpc("get_organization_members", { target_organization_id: o.id });
      if (r.error) throw r.error;
      setOrgMembersCache((prev) => ({ ...prev, [o.id]: (r.data ?? []) as MemberRow[] }));
    } catch (e) {
      setNotice({ kind: "error", message: e instanceof Error ? e.message : "Unable to load members" });
    } finally {
      setMembersBusy(false);
    }
  }

  async function removeMember(orgId: number, userId: string, email: string) {
    if (!supabase) return;
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

  async function executeReopen() {
    if (!supabase || !reopenTarget || !reopenTarget.submission_id || !reopenReason.trim()) return;
    setBusy(true);
    const x = await supabase.rpc("reopen_submission", {
      target_submission_id: reopenTarget.submission_id,
      reason: reopenReason.trim(),
    });
    setBusy(false);
    if (x.error) {
      setNotice({ kind: "error", message: x.error.message });
    } else {
      setNotice({ kind: "success", message: `Reopened report for ${reopenTarget.organization_name}.` });
      setReopenTarget(null);
      setReopenReason("");
      await load(true, selected ?? undefined);
    }
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
      setImportFileName("");
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

      {/* ── Add company modal dialog ── */}
      {addOrgModalOpen && (
        <div
          className="dialog-backdrop"
          role="presentation"
          onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) setAddOrgModalOpen(false); }}
        >
          <section className="confirm-dialog confirm-dialog--wide" role="dialog" aria-modal="true" aria-labelledby="add-org-title">
            <p className="eyebrow eyebrow--red">New registration</p>
            <h2 id="add-org-title">Add Company &amp; Send Invitation</h2>
            <p>Register a participating company and invite their administrator via email.</p>
            <form onSubmit={invite} className="dialog-form">
              <div className="form-grid">
                <label>
                  Company name
                  <input
                    name="companyName"
                    value={newOrgName}
                    onChange={(e) => {
                      setNewOrgName(e.target.value);
                      if (!slugManuallyEdited) {
                        setNewOrgSlug(slugify(e.target.value));
                      }
                    }}
                    placeholder="e.g. Nordic Weave AB"
                    required
                  />
                </label>
                <label>
                  Company code / slug
                  <input
                    name="companySlug"
                    value={newOrgSlug}
                    onChange={(e) => {
                      setNewOrgSlug(e.target.value);
                      setSlugManuallyEdited(true);
                    }}
                    pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                    placeholder="e.g. nordic-weave-ab"
                    required
                  />
                </label>
              </div>
              <div className="form-grid">
                <label>
                  Administrator name
                  <input name="fullName" placeholder="e.g. Anna Lindberg" required />
                </label>
                <label>
                  Administrator email
                  <input name="email" type="email" placeholder="e.g. anna@nordicweave.com" required />
                </label>
              </div>
              <label>
                External reference
                <input name="externalReference" placeholder="Optional, e.g. STICA-2026-057" />
              </label>
              <div className="confirm-dialog__actions">
                <button type="button" className="button button--secondary" onClick={() => setAddOrgModalOpen(false)} disabled={busy}>
                  Cancel
                </button>
                <button type="submit" className="button button--primary" disabled={busy} aria-busy={busy}>
                  {busy ? "Sending invitation…" : <><Send size={16} aria-hidden="true" /> Send invitation</>}
                </button>
              </div>
            </form>
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

      {/* ── Manage members modal dialog ── */}
      {membersModalOrg && (
        <div
          className="dialog-backdrop"
          role="presentation"
          onMouseDown={(e) => { if (e.target === e.currentTarget && !membersBusy) setMembersModalOrg(null); }}
        >
          <section className="confirm-dialog confirm-dialog--wide" role="dialog" aria-modal="true" aria-labelledby="members-modal-title">
            <p className="eyebrow eyebrow--red">Team management</p>
            <h2 id="members-modal-title">Members of {membersModalOrg.name}</h2>
            <p>Users who have access to this company's reporting workspace.</p>
            
            <div className="members-modal-body">
              {membersBusy && !orgMembersCache[membersModalOrg.id] ? (
                <p className="members-empty members-empty--loading">Loading members…</p>
              ) : (orgMembersCache[membersModalOrg.id] ?? []).length === 0 ? (
                <div className="members-empty">
                  <p>No linked users for this company.</p>
                </div>
              ) : (
                <div className="table-scroll members-table-scroll">
                  <table className="members-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Role</th>
                        <th>Joined</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(orgMembersCache[membersModalOrg.id] ?? []).map((m) => (
                        <tr key={m.user_id}>
                          <td><strong>{m.full_name}</strong></td>
                          <td><small>{m.email}</small></td>
                          <td>
                            <select
                              value={m.role}
                              disabled={membersBusy}
                              onChange={(e) => void changeMemberRole(membersModalOrg.id, m.user_id, e.target.value)}
                              className="member-role-select"
                            >
                              <option value="member">Member</option>
                              <option value="company_admin">Company admin</option>
                            </select>
                          </td>
                          <td><small>{formatDate(m.created_at)}</small></td>
                          <td>
                            <button
                              type="button"
                              className="danger-link"
                              disabled={membersBusy}
                              onClick={() => void removeMember(membersModalOrg.id, m.user_id, m.email)}
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="confirm-dialog__actions">
              <button
                type="button"
                className="button button--secondary"
                onClick={() => setMembersModalOrg(null)}
              >
                Close
              </button>
            </div>
          </section>
        </div>
      )}

      {/* ── Reopen dialog ── */}
      {reopenTarget && (
        <div
          className="dialog-backdrop"
          role="presentation"
          onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) setReopenTarget(null); }}
        >
          <section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="reopen-title">
            <p className="eyebrow eyebrow--red">Reopen submission</p>
            <h2 id="reopen-title">Reopen for {reopenTarget.organization_name}?</h2>
            <p>This allows the company to edit and resubmit their responses for reporting year {reopenTarget.reporting_year}.</p>
            <div className="dialog-form">
              <label>
                Reason for reopening (logged to audit trail)
                <textarea
                  rows={3}
                  value={reopenReason}
                  placeholder="e.g. Correction requested for Scope 3 emissions data"
                  onChange={(e) => setReopenReason(e.target.value)}
                  required
                />
              </label>
              <div className="confirm-dialog__actions">
                <button type="button" className="button button--secondary" onClick={() => setReopenTarget(null)} disabled={busy}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="button button--primary"
                  onClick={() => void executeReopen()}
                  disabled={busy || !reopenReason.trim()}
                >
                  {busy ? "Reopening…" : "Confirm & reopen"}
                </button>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* ── Confirm delete question dialog ── */}
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
              Manage survey years <ArrowRight size={16} aria-hidden="true" />
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
              <strong>{notStarted}</strong>
            </article>
          </section>

          <section className="admin-table">
            <div className="admin-table__head">
              <div>
                <p className="eyebrow">Company status</p>
                <h3>{current?.reporting_year ?? "No active year"}</h3>
              </div>
              <div className="table-toolbar">
                <input
                  type="search"
                  placeholder="Search company or email…"
                  value={dashSearch}
                  onChange={(e) => setDashSearch(e.target.value)}
                  className="dashboard-search"
                />
                <button className="button button--secondary toolbar-button" onClick={() => setView("data")}>
                  Export data
                </button>
              </div>
            </div>

            {/* Status Filter Tabs */}
            <div className="table-filters">
              {[
                ["all", `All (${currentRows.length})`],
                ["submitted", `Submitted (${submitted})`],
                ["in_progress", `In Progress (${inProgress})`],
                ["not_started", `Not Started (${notStarted})`],
              ].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setDashStatusFilter(key)}
                  className={dashStatusFilter === key ? "filter-pill filter-pill--active" : "filter-pill"}
                >
                  {label}
                </button>
              ))}
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
                  {filteredDashboardRows.map((r) => (
                    <tr key={`${r.organization_id}-${r.survey_version_id}`}>
                      <td data-label="Company"><strong>{r.organization_name}</strong></td>
                      <td data-label="Contact">{r.contact_email ?? "Not set"}</td>
                      <td data-label="Progress">
                        <div className="table-progress">
                          <span><i style={{ width: `${r.completion_percent}%` }} /></span>
                          {r.completion_percent}%
                        </div>
                      </td>
                      <td data-label="Status">
                        <span className={`table-status ${r.status === "submitted" ? "table-status--submitted" : r.status === "not_started" ? "table-status--not-started" : ""}`}>
                          {r.status.replace("_", " ")}
                        </span>
                      </td>
                      <td data-label="Action">
                        {r.status === "submitted" && (
                          <button className="table-action" onClick={() => setReopenTarget(r)}>
                            Reopen
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filteredDashboardRows.length === 0 && (
                    <tr>
                      <td colSpan={5} className="empty-row">No companies matching the filter.</td>
                    </tr>
                  )}
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
              <PageHeader
                eyebrow="Survey management"
                title="Survey builder"
                description="Manage annual question sets, carry-forward mappings, and publishing status."
                actions={(
                  <Button icon={Plus} variant="primary" onClick={beginCreateYear}>
                    New reporting year
                  </Button>
                )}
              />
              <section className="survey-year-overview">
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">Reporting cycles</p>
                    <h3>{versions.length} reporting years</h3>
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
                        <strong>{surveyDisplayTitle(v.name)}</strong>
                        <small>
                          <span className={`status-chip status-chip--${v.status}`}>{v.status}</span>
                        </small>
                      </div>
                      <em>{busy && selected === v.id ? "Opening…" : <>Open workspace <ArrowRight size={15} aria-hidden="true" /></>}</em>
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
                  <span>Creating a year creates an editable draft. It will not be visible to companies until you publish it.</span>
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
                  Clone from existing year
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
                    {busy ? "Creating draft…" : "Create draft cycle"}
                  </button>
                </div>
              </form>
            </>
          )}

          {/* Workspace */}
          {surveyView === "workspace" && selectedVersion && (
            <>
              <SurveyWorkspaceHeader
                version={selectedVersion}
                questionCount={questions.length}
                previewMode={previewMode}
                busy={busy}
                onBack={() => {
                  setSurveyView("overview");
                  setPreviewMode(false);
                }}
                onTogglePreview={() => setPreviewMode((currentPreview) => !currentPreview)}
                onAddQuestion={() => {
                  setForm(EMPTY_Q);
                  setSurveyView("question");
                }}
                onPublish={() => void publishYear()}
                onClose={() => void closeYear()}
              />

              {selectedVersion.status !== "draft" && (
                <div className="builder-lock-note" role="note">
                  <div>
                    <strong>This reporting year is {selectedVersion.status === "published" ? "published (active)" : "closed (archived)"}</strong>
                    <span>
                      {selectedVersion.status === "published"
                        ? "Published questions are locked to preserve stable IDs and longitudinal integrity. To modify question structure, create a new draft year."
                        : "Closed reporting years are preserved for historical reporting and audit."}
                    </span>
                  </div>
                  {selectedVersion.status === "published" && (
                    <button type="button" className="button button--secondary" onClick={beginCreateYear}>
                      Create new draft year
                    </button>
                  )}
                </div>
              )}

              {/* Preview mode */}
              {previewMode ? (
                <section className="preview-panel">
                  <div className="preview-banner">
                    <strong>Simulator preview</strong>
                    <span>This interactive view mimics what participating companies see. Responses are not saved.</span>
                  </div>
                  <div className="preview-list">
                    {questions.map((q, i) => (
                      <div key={q.id} className="preview-item">
                        <div className="preview-item__meta">
                          <span className="preview-item__num">{i + 1}</span>
                          <code>{q.stableKey}</code>
                          <span className="preview-item__section">{q.sectionTitle}</span>
                          {q.required && <em className="preview-item__required">Required</em>}
                          {carry[q.id] && <span className="preview-item__carry"><RotateCcw size={13} aria-hidden="true" /> Carried from {carry[q.id]}</span>}
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
                      <div className="builder-heading-row">
                        <div>
                          <p className="eyebrow">Question library</p>
                          <h3>{questions.length} questions</h3>
                        </div>
                        {questions.length > 0 && (
                          <SearchField
                            aria-label="Search survey questions"
                            placeholder="Search questions"
                            value={qSearch}
                            onChange={(event) => setQSearch(event.target.value)}
                            className="catalog-search"
                          />
                        )}
                      </div>
                    </div>

                    {openingVersion === selectedVersion.id ? (
                      <div className="empty-catalog loading-catalog" role="status">
                        <strong>Loading questions…</strong>
                        <p>Preparing the question workspace.</p>
                      </div>
                    ) : filteredQuestions.length === 0 ? (
                      <EmptyState
                        icon={ClipboardPlus}
                        title={questions.length === 0 ? "Start the question library" : "No matching questions"}
                        description={questions.length === 0
                          ? "Add the first question to prepare this reporting year. Persistent IDs keep answers aligned across years."
                          : "Try a different search term or section filter."}
                        action={selectedVersion.status === "draft" && questions.length === 0 ? (
                          <Button
                            icon={Plus}
                            variant="primary"
                            onClick={() => {
                              setForm(EMPTY_Q);
                              setSurveyView("question");
                            }}
                          >
                            Add first question
                          </Button>
                        ) : undefined}
                      />
                    ) : (
                      filteredQuestions.slice(questionPage * Q_PAGE_SIZE, questionPage * Q_PAGE_SIZE + Q_PAGE_SIZE).map((q) => (
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

                    {filteredQuestions.length > Q_PAGE_SIZE && (
                      <div className="catalog-pager">
                        <button
                          type="button"
                          disabled={questionPage === 0}
                          onClick={() => setQuestionPage((p) => Math.max(0, p - 1))}
                        >
                          <ArrowLeft size={15} aria-hidden="true" /> Previous
                        </button>
                        <span>
                          Page {questionPage + 1} of {Math.max(1, Math.ceil(filteredQuestions.length / Q_PAGE_SIZE))}
                        </span>
                        <button
                          type="button"
                          disabled={(questionPage + 1) * Q_PAGE_SIZE >= filteredQuestions.length}
                          onClick={() => setQuestionPage((p) => p + 1)}
                        >
                          Next <ArrowRight size={15} aria-hidden="true" />
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
                  Question prompt
                  <textarea
                    rows={4}
                    value={form.prompt}
                    onChange={(e) => setForm({ ...form, prompt: e.target.value })}
                    placeholder="Write the question prompt clearly as companies will see it."
                    required
                  />
                </label>
                <label>
                  Help text / Guidance
                  <textarea
                    value={form.help}
                    onChange={(e) => setForm({ ...form, help: e.target.value })}
                    placeholder="Optional definitions, calculation methodologies, or reporting boundaries."
                  />
                </label>
                <div className="form-grid">
                  <label>
                    Response type
                    <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as QuestionType })}>
                      {["text", "textarea", "number", "yes_no", "single_choice", "multiple_choice", "date"].map((x) => (
                        <option key={x} value={x}>{x.replace("_", " ")}</option>
                      ))}
                    </select>
                  </label>
                  <label className="checkbox-label checkbox-label--aligned">
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
                    Options (one per line)
                    <textarea
                      rows={4}
                      value={form.options}
                      onChange={(e) => setForm({ ...form, options: e.target.value })}
                      placeholder={"Option one\nOption two\nOption three"}
                    />
                  </label>
                )}
                <fieldset className="mapping-fieldset">
                  <legend className="fieldset-legend">Carry-forward mapping</legend>
                  <p className="fieldset-help">Use when this question inherits validated answers from an approved previous-year question ID.</p>
                  <label>
                    Source question ID
                    <input
                      value={form.carry}
                      onChange={(e) => setForm({ ...form, carry: e.target.value.toUpperCase() })}
                      placeholder="Optional, e.g. GOV-015"
                    />
                  </label>
                </fieldset>
                <fieldset className="mapping-fieldset">
                  <legend className="fieldset-legend">Conditional visibility</legend>
                  <p className="fieldset-help">Leave Depends on empty to show this question unconditionally.</p>
                  <div className="form-grid">
                    <label>
                      Depends on question ID
                      <input
                        value={form.condition}
                        onChange={(e) => setForm({ ...form, condition: e.target.value.toUpperCase() })}
                        placeholder="e.g. GOV-001"
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
                    <label className="expected-value-field">
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
          <PageHeader
            eyebrow="Participation"
            title="Companies"
            description="Manage organizations, members, and secure access."
            actions={(
              <Button
                icon={Plus}
                variant="primary"
                onClick={() => {
                  setAddOrgModalOpen(true);
                  setNewOrgName("");
                  setNewOrgSlug("");
                  setSlugManuallyEdited(false);
                }}
              >
                Add company
              </Button>
            )}
          />

          <section className="metric-grid metric-grid--four admin-metric-grid">
            <article>
              <span>Total registered</span>
              <strong>{orgs.length}</strong>
            </article>
            <article>
              <span>Active companies</span>
              <strong>{orgs.filter((o) => o.is_active).length}</strong>
            </article>
            <article>
              <span>Archived</span>
              <strong>{orgs.filter((o) => !o.is_active).length}</strong>
            </article>
            <article>
              <span>Reporting in {current?.reporting_year ?? "2026"}</span>
              <strong>{currentRows.filter((r) => r.status !== "not_started").length}</strong>
            </article>
          </section>

          <CompanyDirectory
            organizations={paginatedOrgs}
            totalOrganizations={orgs.length}
            totalActive={orgs.filter((organization) => organization.is_active).length}
            statusFilter={orgStatusFilter}
            search={orgSearch}
            page={orgPage}
            totalPages={totalOrgPages}
            filteredCount={filteredOrgs.length}
            onSearch={(value) => {
              setOrgSearch(value);
              setOrgPage(0);
            }}
            onStatusFilter={(filter) => {
              setOrgStatusFilter(filter);
              setOrgPage(0);
            }}
            onPage={setOrgPage}
            onEdit={beginEditOrg}
            onMembers={(organization) => void openMembersModal(organization)}
            onToggleActive={(organization) => void toggleActive(organization)}
          />
        </div>
      )}

      {/* ══════════════════════════ DATA ═════════════════════════════════════ */}
      {view === "data" && (
        <div className="page">
          <div className="page-intro">
            <div>
              <p className="eyebrow eyebrow--red">Portable reporting data</p>
              <h1>Import &amp; export</h1>
              <p>Export responses to Excel, generate longitudinal pivot tables, or bulk-import historical responses.</p>
            </div>
          </div>

          <section className="data-grid">
            {/* Import */}
            <form className="panel-form" onSubmit={importHistory}>
              <h3>Historical Excel / CSV import</h3>
              <p className="muted import-help">
                Required headers: <code>company_name, company_slug, reporting_year, question_key, answer</code>
              </p>
              <div className="file-dropzone">
                <input
                  name="historyFile"
                  type="file"
                  accept=".xlsx,.csv"
                  required
                  onChange={(e) => setImportFileName(e.target.files?.[0]?.name ?? "")}
                  className="visually-hidden"
                  id="file-upload"
                />
                <label htmlFor="file-upload" className="file-dropzone__label">
                  <span className="file-dropzone__icon">📂</span>
                  <strong>{importFileName ? importFileName : "Click to select .xlsx or .csv file"}</strong>
                  <span className="file-dropzone__hint">Supports Excel workbooks and UTF-8 CSV</span>
                </label>
              </div>
              <button className="button button--ink" disabled={busy || !importFileName}>
                {busy ? "Importing data…" : "Import historical responses"}
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
                  Pivot / matrix format
                </button>
              </div>
              <p className="export-format-desc">
                {exportFormat === "flat"
                  ? "One row per answer — ideal for data warehousing and statistical analysis."
                  : "One row per company per year, columns per question — ideal for comparisons and board reporting."}
              </p>
              <div className="form-grid">
                <label>
                  Year
                  <select value={year} onChange={(e) => setYear(e.target.value)}>
                    <option value="">All reporting years</option>
                    {years.map((y) => <option key={y} value={y}>{y}</option>)}
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
                <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="e.g. GOV-001 (Optional)" />
              </label>
              <button className="button button--secondary" onClick={() => void prepare()} disabled={busy}>
                {busy ? "Preparing preview…" : "Preview export data"}
              </button>
              <div className="export-actions">
                <button className="button button--primary" onClick={() => void downloadExport()} disabled={busy}>
                  {busy ? "Generating file…" : `⬇️ Download Excel (${exportFormat})`}
                </button>
                <button className="button button--secondary" onClick={() => print()}>
                  <Printer size={16} aria-hidden="true" /> Print / PDF
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
                    <ArrowLeft size={15} aria-hidden="true" /> Previous
                  </button>
                  <span>
                    {exportPage * EXPORT_PAGE_SIZE + 1}–{Math.min((exportPage + 1) * EXPORT_PAGE_SIZE, exports.length)} of {exports.length}
                  </span>
                  <button
                    type="button"
                    disabled={(exportPage + 1) * EXPORT_PAGE_SIZE >= exports.length}
                    onClick={() => setExportPage((p) => p + 1)}
                  >
                    Next <ArrowRight size={15} aria-hidden="true" />
                  </button>
                </div>
              </div>
              <div className="table-scroll">
                <table className="responsive-table responsive-table--export">
                  <thead>
                    <tr>
                      <th>Year</th>
                      <th>Company</th>
                      <th>Question ID</th>
                      <th>Question prompt</th>
                      <th>Answer</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleExports.map((r, i) => (
                      <tr key={i}>
                        <td data-label="Year"><strong>{r.reporting_year}</strong></td>
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
              <p>Track annual submission progress, cohort completion rates, and company reporting trajectories.</p>
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
              <h3>Current status distribution</h3>
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
                  <h3>Company reporting trajectory</h3>
                  <p>Annual reporting completion timeline across participating brands</p>
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

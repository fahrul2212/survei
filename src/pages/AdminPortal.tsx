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
import { supabase } from "../lib/supabase";
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
} from "../lib/portal";
import { exportPivotXlsx, exportResponsesXlsx, readImportWorkbook } from "../lib/spreadsheet";
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
} from "../components/ui";
import { AuditLogView } from "../components/admin/AuditLogView";
import { CompanyDirectory, type CompanyStatusFilter } from "../components/admin/CompanyDirectory";
import { SurveyWorkspaceHeader } from "../components/admin/SurveyWorkspaceHeader";
import { AdminDashboard } from "../components/admin/AdminDashboard";
import { SurveyBuilder } from "../components/admin/SurveyBuilder";
import { AdminCompanies } from "../components/admin/AdminCompanies";

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


export function AdminPortal({ session }: { session: Session }) {
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
  // Reopen modal
  const [reopenTarget, setReopenTarget] = useState<ProgressRow | null>(null);
  const [reopenReason, setReopenReason] = useState("");

  // Company management (Modals & Edit)
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

      {/* ══════════════════════════ DASHBOARD ════════════════════════════════ */}
      {view === "dashboard" && (
        <AdminDashboard
          versions={versions}
          orgs={orgs}
          rows={rows}
          setView={setView}
        />
      )}

      {/* ══════════════════════════ SURVEY BUILDER ════════════════════════════ */}
      {view === "surveys" && (
        <SurveyBuilder
          versions={versions}
          questions={questions}
          carry={carry}
          selected={selected}
          busy={busy}
          qSearch={qSearch}
          qSectionFilter={qSectionFilter}
          setQSearch={setQSearch}
          setQSectionFilter={setQSectionFilter}
          setBusy={setBusy}
          setNotice={setNotice}
          setSelected={setSelected}
          setVersions={setVersions}
          setQuestions={setQuestions}
          setCarry={setCarry}
          loadQuestions={loadQuestions}
          load={load}
        />
      )}

      {/* ══════════════════════════ COMPANIES ════════════════════════════════ */}
      {view === "companies" && (
        <AdminCompanies
          orgs={orgs}
          current={current}
          currentRows={currentRows}
          selected={selected}
          busy={busy}
          setBusy={setBusy}
          setNotice={setNotice}
          load={load}
        />
      )}

      {/* ══════════════════════════ DATA ═════════════════════════════════════ */}
      {view === "data" && (
        <div className="mx-auto w-full max-w-[1400px] animate-[rise_0.4s_ease_both] px-4 py-8 md:px-8 lg:px-12 lg:pb-20">
          <div className="mb-10 flex flex-col items-start gap-3">
            <div>
              <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-[#d91f17]">Portable reporting data</p>
              <h1 className="text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">Import &amp; export</h1>
              <p className="mt-2 text-slate-500">Export responses to Excel, generate longitudinal pivot tables, or bulk-import historical responses.</p>
            </div>
          </div>

          <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Import */}
            <form className="flex flex-col gap-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8" onSubmit={importHistory}>
              <h3 className="text-xl font-bold text-slate-900">Historical Excel / CSV import</h3>
              <p className="text-sm text-slate-500">
                Required headers: <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-bold text-slate-600">company_name, company_slug, reporting_year, question_key, answer</code>
              </p>
              <div className="relative mt-2">
                <input
                  name="historyFile"
                  type="file"
                  accept=".xlsx,.csv"
                  required
                  onChange={(e) => setImportFileName(e.target.files?.[0]?.name ?? "")}
                  className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
                  id="file-upload"
                />
                <label htmlFor="file-upload" className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition-colors ${importFileName ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-slate-100'}`}>
                  <span className="text-3xl">📂</span>
                  <strong className={`text-sm font-bold ${importFileName ? 'text-emerald-700' : 'text-slate-700'}`}>
                    {importFileName ? importFileName : "Click to select .xlsx or .csv file"}
                  </strong>
                  <span className="text-xs font-semibold text-slate-500">Supports Excel workbooks and UTF-8 CSV</span>
                </label>
              </div>
              <div className="mt-auto pt-2 text-right">
                <Button disabled={busy || !importFileName}>
                  {busy ? "Importing data…" : "Import historical responses"}
                </Button>
              </div>
            </form>

            {/* Export */}
            <div className="flex flex-col gap-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
              <h3 className="text-xl font-bold text-slate-900">Flexible export</h3>
              
              <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-1">
                <button
                  type="button"
                  className={`flex-1 rounded-md px-3 py-2 text-[13px] font-bold transition-all ${exportFormat === "flat" ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200" : "text-slate-500 hover:text-slate-900"}`}
                  onClick={() => setExportFormat("flat")}
                >
                  Flat / long format
                </button>
                <button
                  type="button"
                  className={`flex-1 rounded-md px-3 py-2 text-[13px] font-bold transition-all ${exportFormat === "pivot" ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200" : "text-slate-500 hover:text-slate-900"}`}
                  onClick={() => setExportFormat("pivot")}
                >
                  Pivot / matrix format
                </button>
              </div>
              
              <p className="text-[13px] font-semibold text-slate-500">
                {exportFormat === "flat"
                  ? "One row per answer — ideal for data warehousing and statistical analysis."
                  : "One row per company per year, columns per question — ideal for comparisons and board reporting."}
              </p>
              
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <label className="flex flex-col gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
                  Year
                  <select 
                    value={year} 
                    onChange={(e) => setYear(e.target.value)}
                    className="w-full rounded-lg border-[1.5px] border-slate-200 bg-white px-4 py-3 text-[15px] font-normal normal-case tracking-normal text-slate-900 outline-none transition-all focus:border-[#d91f17] focus:ring-3 focus:ring-[#d91f17]/10"
                  >
                    <option value="">All reporting years</option>
                    {years.map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
                  Company
                  <select 
                    value={company} 
                    onChange={(e) => setCompany(e.target.value)}
                    className="w-full rounded-lg border-[1.5px] border-slate-200 bg-white px-4 py-3 text-[15px] font-normal normal-case tracking-normal text-slate-900 outline-none transition-all focus:border-[#d91f17] focus:ring-3 focus:ring-[#d91f17]/10"
                  >
                    <option value="">All companies</option>
                    {orgs.map((o) => <option key={o.id} value={o.slug}>{o.name}</option>)}
                  </select>
                </label>
              </div>
              
              <label className="flex flex-col gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
                Question ID filter
                <input 
                  value={question} 
                  onChange={(e) => setQuestion(e.target.value)} 
                  placeholder="e.g. GOV-001 (Optional)"
                  className="w-full rounded-lg border-[1.5px] border-slate-200 bg-white px-4 py-3 text-[15px] font-normal normal-case tracking-normal text-slate-900 outline-none transition-all focus:border-[#d91f17] focus:ring-3 focus:ring-[#d91f17]/10"
                />
              </label>
              
              <Button variant="secondary" onClick={() => void prepare()} disabled={busy}>
                {busy ? "Preparing preview…" : "Preview export data"}
              </Button>
              
              <div className="mt-2 flex flex-col justify-end gap-3 border-t border-slate-200 pt-6 sm:flex-row">
                <Button variant="secondary" onClick={() => print()}>
                  <Printer size={16} aria-hidden="true" className="mr-1.5" /> Print / PDF
                </Button>
                <Button onClick={() => void downloadExport()} disabled={busy}>
                  {busy ? "Generating file…" : `⬇️ Download Excel (${exportFormat})`}
                </Button>
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
        <div className="mx-auto w-full max-w-[1400px] animate-[rise_0.4s_ease_both] px-4 py-8 md:px-8 lg:px-12 lg:pb-20">
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

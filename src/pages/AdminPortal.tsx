import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ClipboardPlus,
  Clock3,
  FileSpreadsheet,
  FileText,
  LockKeyhole,
  Plus,
  Printer,
  RotateCcw,
  Send,
  Table,
  UploadCloud,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { SticaProgressReportDocument } from "../components/admin/SticaProgressReportDocument";
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
  PageContainer,
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
import { AdminAnalytics } from "../components/admin/AdminAnalytics";
import { SurveyBuilder } from "../components/admin/SurveyBuilder";
import { AdminCompanies } from "../components/admin/AdminCompanies";
import { AdminOperations } from "../components/admin/AdminOperations";
import { AdminSummaryModal } from "../components/admin/AdminSummaryModal";

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

function errorMessage(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return fallback;
}

function retryableAdminLoad(error: unknown) {
  if (!error || typeof error !== "object") return true;
  const status = "status" in error ? Number(error.status) : 0;
  const code = "code" in error ? String(error.code) : "";
  return (
    !status ||
    [401, 403, 408, 425, 429, 500, 502, 503, 504, 520].includes(status) ||
    ["PGRST000", "PGRST001", "PGRST002", "PGRST003"].includes(code)
  );
}

function shortDelay(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
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
  const [monitoringSurveyId, setMonitoringSurveyId] = useState<number | null>(null);
  const [carry, setCarry] = useState<Record<number, string>>({});

  // Filters & Search
  const [qSearch, setQSearch] = useState("");
  const [qSectionFilter, setQSectionFilter] = useState("");
  // Reopen modal
  const [reopenTarget, setReopenTarget] = useState<ProgressRow | null>(null);
  const [reopenReason, setReopenReason] = useState("");
  // AI Summary modal
  const [summaryTarget, setSummaryTarget] = useState<{ submissionId: number; organizationName: string; surveyName: string } | null>(null);

  // Company management (Modals & Edit)
  const [exports, setExports] = useState<ExportRow[]>([]);
  const [exportFormat, setExportFormat] = useState<"flat" | "pivot">("flat");
  const [exportPreviewMode, setExportPreviewMode] = useState<"report" | "table">("report");
  const [exportPage, setExportPage] = useState(0);
  const [year, setYear] = useState("");
  const [company, setCompany] = useState("");
  const [question, setQuestion] = useState("");
  const [importFileName, setImportFileName] = useState("");

  // Global state
  const [notice, setNotice] = useState<Notice>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const loadRequest = useRef(0);

  // ── Loaders ──────────────────────────────────────────────────────────────

  const fetchQuestions = useCallback(async (id: number) => {
    if (!supabase) return { questions: [] as SurveyQuestion[], carry: {} as Record<number, string> };
    const [a, b] = await Promise.all([
      supabase.from("survey_questions").select(QUESTION_SELECT).eq("survey_version_id", id).order("display_order"),
      supabase.from("question_carry_forward_rules").select("target_survey_question_id,source:question_definitions!inner(stable_key)"),
    ]);
    if (a.error) throw a.error;
    if (b.error) throw b.error;
    return {
      questions: (a.data ?? []).map(parseSurveyQuestion),
      carry: Object.fromEntries(
        (b.data ?? []).map((x) => [
          x.target_survey_question_id,
          (Array.isArray(x.source) ? x.source[0] : x.source)?.stable_key ?? "",
        ]),
      ),
    };
  }, []);

  const loadQuestions = useCallback(async (id: number) => {
    const data = await fetchQuestions(id);
    setQuestions(data.questions);
    setCarry(data.carry);
  }, [fetchQuestions]);

  const load = useCallback(async (silent = false, preferredId?: number) => {
    if (!supabase) return;
    const client = supabase;
    const requestId = ++loadRequest.current;
    if (!silent) setLoading(true);

    const fetchSnapshot = async () => {
      const sessionResult = await client.auth.getSession();
      if (sessionResult.error) throw sessionResult.error;
      if (!sessionResult.data.session) {
        const restored = await client.auth.setSession({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
        });
        if (restored.error) throw restored.error;
      }

      const [a, b, c] = await Promise.all([
        client.from("survey_versions").select("*").order("reporting_year", { ascending: false }).order("id", { ascending: false }),
        client.from("organizations").select("*").order("name"),
        client.from("admin_submission_progress").select("*").order("reporting_year", { ascending: false }),
      ]);
      if (a.error) throw a.error;
      if (b.error) throw b.error;
      if (c.error) throw c.error;

      const nextVersions = (a.data ?? []) as SurveyVersion[];
      const nextSelected = preferredId ?? nextVersions[0]?.id ?? null;
      const questionData = nextSelected
        ? await fetchQuestions(nextSelected)
        : { questions: [] as SurveyQuestion[], carry: {} as Record<number, string> };

      return {
        versions: nextVersions,
        orgs: (b.data ?? []) as Organization[],
        rows: (c.data ?? []) as ProgressRow[],
        selected: nextSelected,
        ...questionData,
      };
    };

    try {
      let snapshot;
      try {
        snapshot = await fetchSnapshot();
      } catch (firstError) {
        if (!retryableAdminLoad(firstError)) throw firstError;
        await shortDelay(250);
        const refreshed = await client.auth.refreshSession();
        if (refreshed.error) throw firstError;
        snapshot = await fetchSnapshot();
      }

      if (requestId !== loadRequest.current) return;
      setVersions(snapshot.versions);
      setOrgs(snapshot.orgs);
      setRows(snapshot.rows);
      setSelected(snapshot.selected);
      setQuestions(snapshot.questions);
      setCarry(snapshot.carry);
      if (!silent) setNotice(null);
    } catch (e) {
      if (requestId === loadRequest.current) {
        setNotice({ kind: "error", message: errorMessage(e, "Unable to load admin data") });
      }
    } finally {
      if (!silent && requestId === loadRequest.current) setLoading(false);
    }
  }, [fetchQuestions, session.access_token, session.refresh_token]);

  useEffect(() => { void load(); }, [load]);

  // ── Derived state ─────────────────────────────────────────────────────────

  const selectedVersion = versions.find((v) => v.id === selected);
  const current = versions.find((v) => v.id === monitoringSurveyId && v.status === "published")
    ?? versions.find((v) => v.status === "published");
  const currentRows = current ? rows.filter((r) => r.survey_version_id === current.id) : [];
  
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
    ["operations", "Reminders & AI"],
    ["audit", "Audit log"],
  ];

  return (
    <Shell admin view={view} setView={setView} items={navItems} user={session.user} name="STICA Administration">
      <NoticeBar notice={notice} clear={() => setNotice(null)} />

      {/* ── Reopen dialog ── */}
      {reopenTarget && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4"
          role="presentation"
          onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) setReopenTarget(null); }}
        >
          <section className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl md:p-8" role="dialog" aria-modal="true" aria-labelledby="reopen-title">
            <p className="mb-2 text-[11px] font-extrabold uppercase tracking-widest text-[#d91f17]">Reopen submission</p>
            <h2 id="reopen-title" className="text-2xl font-bold tracking-tight text-slate-900">Reopen for {reopenTarget.organization_name}?</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">This allows the company to edit and resubmit their responses for reporting year {reopenTarget.reporting_year}.</p>
            <div className="mt-6 flex flex-col gap-5">
              <label className="flex flex-col gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
                Reason for reopening (logged to audit trail)
                <textarea
                  className="min-h-28 w-full resize-y rounded-lg border border-slate-300 bg-white px-3.5 py-3 text-sm font-normal normal-case tracking-normal text-slate-900 outline-none transition focus:border-[#d91f17] focus:ring-2 focus:ring-red-100"
                  rows={3}
                  value={reopenReason}
                  placeholder="e.g. Correction requested for Scope 3 emissions data"
                  onChange={(e) => setReopenReason(e.target.value)}
                  required
                />
              </label>
              <div className="flex flex-col-reverse justify-end gap-2 border-t border-slate-100 pt-5 sm:flex-row">
                <button type="button" className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition-colors hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-50" onClick={() => setReopenTarget(null)} disabled={busy}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="inline-flex min-h-10 items-center justify-center rounded-lg bg-[#d91f17] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#b81711] disabled:pointer-events-none disabled:opacity-50"
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

      {/* ── AI Summary dialog ── */}
      {summaryTarget && (
        <AdminSummaryModal
          submissionId={summaryTarget.submissionId}
          organizationName={summaryTarget.organizationName}
          surveyName={summaryTarget.surveyName}
          onClose={() => setSummaryTarget(null)}
          setNotice={setNotice}
        />
      )}

      {/* ══════════════════════════ DASHBOARD ════════════════════════════════ */}
      {view === "dashboard" && (
        <AdminDashboard
          versions={versions}
          orgs={orgs}
          rows={rows}
          currentSurveyId={current?.id ?? null}
          onCurrentSurveyChange={setMonitoringSurveyId}
          setView={setView}
          onReopen={setReopenTarget}
          onOpenSummary={(row) => {
            if (row.submission_id) {
              setSummaryTarget({
                submissionId: row.submission_id,
                organizationName: row.organization_name,
                surveyName: `${row.reporting_year} · ${row.survey_name}`,
              });
            }
          }}
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
          versions={versions}
          current={current}
          currentRows={currentRows}
          onCurrentSurveyChange={setMonitoringSurveyId}
          selected={selected}
          busy={busy}
          setBusy={setBusy}
          setNotice={setNotice}
          load={load}
        />
      )}

      {/* ══════════════════════════ DATA ═════════════════════════════════════ */}
      {view === "data" && (
        <PageContainer>
          <PageHeader eyebrow="Portable reporting data" title="Import & export" description="Move historical responses into STICA and export clean datasets for analysis." />

          <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Import */}
            <form className="flex flex-col gap-5 rounded-xl border border-slate-200 bg-white p-6 sm:p-8" onSubmit={importHistory}>
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
                   <UploadCloud size={28} className={importFileName ? "text-emerald-600" : "text-slate-400"} aria-hidden="true" />
                  <strong className={`text-sm font-bold ${importFileName ? 'text-emerald-700' : 'text-slate-700'}`}>
                    {importFileName ? importFileName : "Click to select .xlsx or .csv file"}
                  </strong>
                  <span className="text-xs font-semibold text-slate-500">Supports Excel workbooks and UTF-8 CSV</span>
                </label>
              </div>
              <div className="mt-auto pt-2 text-right">
                 <Button icon={UploadCloud} disabled={busy || !importFileName}>
                  {busy ? "Importing data…" : "Import historical responses"}
                </Button>
              </div>
            </form>

            {/* Export */}
            <div className="flex flex-col gap-5 rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
              <h3 className="text-xl font-bold text-slate-900">Flexible export</h3>
              
              <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-1">
                <button
                  type="button"
                  className={`flex-1 rounded-md border px-3 py-2 text-[13px] font-bold transition-colors ${exportFormat === "flat" ? "border-slate-300 bg-white text-slate-900" : "border-transparent text-slate-500 hover:text-slate-900"}`}
                  onClick={() => setExportFormat("flat")}
                >
                  Flat / long format
                </button>
                <button
                  type="button"
                  className={`flex-1 rounded-md border px-3 py-2 text-[13px] font-bold transition-colors ${exportFormat === "pivot" ? "border-slate-300 bg-white text-slate-900" : "border-transparent text-slate-500 hover:text-slate-900"}`}
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
                <Button
                  variant="secondary"
                  onClick={async () => {
                    if (exports.length === 0) {
                      await prepare();
                    }
                    setExportPreviewMode("report");
                    window.setTimeout(() => window.print(), 120);
                  }}
                  disabled={busy}
                >
                  <Printer size={16} aria-hidden="true" className="mr-1.5" /> Print / Save Official PDF
                </Button>
                <Button icon={FileSpreadsheet} onClick={() => void downloadExport()} disabled={busy}>
                  {busy ? "Generating file…" : `Download Excel (${exportFormat})`}
                </Button>
              </div>
            </div>
          </section>

          {/* Export preview */}
          {exports.length > 0 && (
            <section className="mt-8 space-y-6">
              <div className="no-print flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setExportPreviewMode("report")}
                    className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold uppercase tracking-wider transition-all ${
                      exportPreviewMode === "report"
                        ? "bg-[#d91f17] text-white shadow-xs"
                        : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <FileText size={15} /> Official STICA Progress Report
                  </button>
                  <button
                    type="button"
                    onClick={() => setExportPreviewMode("table")}
                    className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold uppercase tracking-wider transition-all ${
                      exportPreviewMode === "table"
                        ? "bg-slate-900 text-white shadow-xs"
                        : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <Table size={15} /> Raw Data Rows ({exports.length})
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    size="small"
                    onClick={() => {
                      setExportPreviewMode("report");
                      window.setTimeout(() => window.print(), 120);
                    }}
                  >
                    <Printer size={15} aria-hidden="true" className="mr-1.5" /> Print / Save PDF
                  </Button>
                </div>
              </div>

              {exportPreviewMode === "report" ? (
                <SticaProgressReportDocument
                  exports={exports}
                  orgs={orgs}
                  rows={rows}
                  cycles={versions}
                  selectedYear={year ? Number(year) : undefined}
                  selectedCompanySlug={company || undefined}
                  onPrint={() => window.print()}
                />
              ) : (
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                  <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <h3 className="text-lg font-bold text-slate-900">{exports.length} response rows</h3>
                    <div className="flex items-center gap-2">
                      <button
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:pointer-events-none disabled:opacity-40"
                        type="button"
                        disabled={exportPage === 0}
                        onClick={() => setExportPage((p) => p - 1)}
                      >
                        <ArrowLeft size={15} aria-hidden="true" /> Previous
                      </button>
                      <span className="text-xs font-semibold text-slate-600">
                        {exportPage * EXPORT_PAGE_SIZE + 1}–{Math.min((exportPage + 1) * EXPORT_PAGE_SIZE, exports.length)} of {exports.length}
                      </span>
                      <button
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:pointer-events-none disabled:opacity-40"
                        type="button"
                        disabled={(exportPage + 1) * EXPORT_PAGE_SIZE >= exports.length}
                        onClick={() => setExportPage((p) => p + 1)}
                      >
                        Next <ArrowRight size={15} aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                  <div className="w-full overflow-x-auto">
                    <table className="w-full min-w-[760px] text-left text-sm text-slate-600">
                      <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                        <tr className="border-b border-slate-200">
                          <th>Year</th>
                          <th>Survey</th>
                          <th>Company</th>
                          <th>Question ID</th>
                          <th>Question prompt</th>
                          <th>Answer</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleExports.map((r, i) => (
                          <tr key={i} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                            <td className="px-4 py-3 font-bold text-slate-900">{r.reporting_year}</td>
                            <td className="max-w-64 truncate px-4 py-3" title={r.survey_name}>{r.survey_name}</td>
                            <td className="max-w-52 truncate px-4 py-3" title={r.company_name}>{r.company_name}</td>
                            <td className="px-4 py-3"><code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">{r.question_key}</code></td>
                            <td className="max-w-[28rem] truncate px-4 py-3" title={r.question_prompt}>{r.question_prompt}</td>
                            <td className="max-w-64 truncate px-4 py-3" title={valueAsText(r.answer)}>{valueAsText(r.answer)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </section>
          )}
        </PageContainer>
      )}

      {/* ══════════════════════════ ANALYTICS ════════════════════════════════ */}
      {view === "analytics" && (
        <AdminAnalytics organizations={orgs} rows={rows} currentRows={currentRows} />
      )}

      {view === "operations" && (
        <AdminOperations
          versions={versions}
          organizations={orgs}
          setNotice={setNotice}
          onOpenSummary={(submissionId, organizationName, surveyName) => {
            setSummaryTarget({ submissionId, organizationName, surveyName });
          }}
        />
      )}

      {/* ══════════════════════════ AUDIT LOG ════════════════════════════════ */}
      {view === "audit" && <AuditLogView orgs={orgs} />}
    </Shell>
  );
}

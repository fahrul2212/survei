import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { ArrowRight, CalendarDays, Check, FileClock, ShieldCheck } from "lucide-react";
import { supabase } from "../lib/supabase";
import {
  evaluateVisibility,
  formatDate,
  isAnswered,
  parseSurveyQuestion,
  type AnswerRecord,
  type CompanyRole,
  type JsonAnswer,
  type Organization,
  type Submission,
  type SurveyQuestion,
  type SurveyVersion,
} from "../lib/portal";
import { EmptyState, Loading, NoticeBar, PageContainer, PageHeader, Shell, StatusBadge, type Notice, Logo, Button } from "../components/ui";
import { AccountSettings } from "./AccountSettings";
import { Report } from "./Report";
import { CompanyTeam } from "../components/company/CompanyTeam";
import { CompanyDocuments } from "../components/company/CompanyDocuments";
import { CompanyBenchmark } from "../components/company/CompanyBenchmark";
import { CompanySummary } from "../components/company/CompanySummary";

const QUESTION_SELECT = `id,survey_version_id,display_order,is_required,carry_forward_enabled,visibility_rule,section_key,section_title,question_revision:question_revisions!inner(id,prompt,help_text,question_type,options,validation,question:question_definitions!inner(id,stable_key,category))`;

export function CompanyPortal({ session }: { session: Session }) {
  const [view, setView] = useState("overview");
  const [org, setOrg] = useState<Organization | null>(null);
  const [versions, setVersions] = useState<SurveyVersion[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [version, setVersion] = useState<SurveyVersion | null>(null);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [questions, setQuestions] = useState<SurveyQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<number, JsonAnswer>>({});
  const [answerProvenance, setAnswerProvenance] = useState<Record<number, AnswerRecord["provenance"]>>({});
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<Notice>(null);
  const [role, setRole] = useState<CompanyRole>("viewer");

  const loadSurvey = useCallback(async (v: SurveyVersion, known: Submission[], allowCreate = role !== "viewer") => {
    if (!supabase) return;
    let s = known.find((x) => x.survey_version_id === v.id) ?? null;
    if (!s && v.status === "published" && allowCreate) {
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
    const answerRows = (ar.data ?? []) as AnswerRecord[];
    setAnswers(Object.fromEntries(answerRows.map((a) => [a.survey_question_id, a.value])));
    setAnswerProvenance(Object.fromEntries(answerRows.map((a) => [a.survey_question_id, a.provenance])));
  }, [role]);

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      const m = await supabase
        .from("organization_members")
        .select("role,organization:organizations!inner(*)")
        .eq("user_id", session.user.id)
        .limit(1)
        .maybeSingle();
      if (m.error) throw m.error;
      const o = Array.isArray(m.data?.organization) ? m.data.organization[0] : m.data?.organization;
      if (!o) { setOrg(null); return; }
      setOrg(o as Organization);
      const memberRole = (m.data?.role ?? "viewer") as CompanyRole;
      setRole(memberRole);

      const [vr, sr] = await Promise.all([
        supabase.from("survey_versions").select("*").in("status", ["published", "closed"]).order("reporting_year", { ascending: false }).order("id", { ascending: false }),
        supabase.from("company_submissions").select("*").eq("organization_id", o.id),
      ]);
      if (vr.error) throw vr.error;
      if (sr.error) throw sr.error;

      const vv = (vr.data ?? []) as SurveyVersion[];
      const ss = (sr.data ?? []) as Submission[];
      setVersions(vv);
      setSubmissions(ss);

      const current = vv.find((x) => x.status === "published") ?? vv[0];
      if (current) await loadSurvey(current, ss, memberRole !== "viewer");
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
  const openSurveys = versions.filter((survey) => survey.status === "published");
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
    if (!supabase || role === "viewer" || !submission || submission.status === "submitted" || version?.status !== "published") return;
    const r = await supabase.from("answers").upsert(
      { submission_id: submission.id, survey_question_id: q.id, value: v, provenance: "manual", updated_by: session.user.id },
      { onConflict: "submission_id,survey_question_id" },
    );
    if (r.error) {
      setNotice({ kind: "error", message: r.error.message });
      throw r.error;
    }
    setAnswerProvenance((current) => ({ ...current, [q.id]: "manual" }));
  }

  async function submit() {
    if (!supabase || role === "viewer" || !submission || version?.status !== "published") return;
    const missing = visible.filter((q) => q.required && !isAnswered(answers[q.id]));
    if (missing.length) return setNotice({ kind: "error", message: `${missing.length} required response(s) are missing.` });
    const r = await supabase.rpc("submit_submission", { target_submission_id: submission.id });
    if (r.error) return setNotice({ kind: "error", message: r.error.message });
    setNotice({ kind: "success", message: "Report submitted successfully." });
    setView("overview");
    await load();
  }

  async function open(v: SurveyVersion) {
    if (role === "viewer" && !submissions.some((item) => item.survey_version_id === v.id)) {
      setNotice({ kind: "error", message: "Viewer access is read-only. A contributor must start this survey first." });
      return;
    }
    setLoading(true);
    try {
      await loadSurvey(v, submissions, role !== "viewer");
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
      <main className="grid min-h-[100dvh] place-items-center bg-slate-50 p-6">
        <section className="flex w-full max-w-md flex-col items-center gap-5 rounded-2xl border border-slate-200 bg-white p-8 text-center">
          <Logo />
          <h1 className="text-xl font-bold text-slate-900">Account awaiting company access</h1>
          <p className="text-slate-500">Ask a STICA administrator to link this account to a participating company.</p>
          <Button variant="secondary" onClick={() => void supabase?.auth.signOut()}>Sign out</Button>
        </section>
      </main>
    );
  }

  const navItems: Array<[string, string, string?]> = [
    ["overview", "Overview"],
    ["report", version ? version.name : "Current survey", `${answered}/${visible.length}`],
    ["history", "Survey archive"],
    ["documents", "Documents"],
    ["benchmark", "Benchmark"],
    ["summary", "AI summary"],
    ["team", "Team"],
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
          answerProvenance={answerProvenance}
          setAnswers={setAnswers}
          setAnswerProvenance={setAnswerProvenance}
          save={save}
          submit={submit}
          back={() => setView("overview")}
          editable={role !== "viewer"}
        />
      )}

      {/* ── Overview ── */}
      {view === "overview" && (
        <PageContainer>
          <PageHeader
            eyebrow="Company climate action programme"
            title={org.name}
            description={openSurveys.length > 1 ? `${openSurveys.length} surveys are open for reporting.` : version ? `Your ${version.reporting_year} survey is ready for review.` : "No reporting cycle is open."}
            meta={version && submission ? <StatusBadge status={submission.status} /> : undefined}
          />
          <div className="mb-7 flex flex-wrap items-center justify-between gap-4">
            {version?.closes_at && (
              <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
                <CalendarDays size={18} className="text-[#d91f17]" aria-hidden="true" />
                <span className="grid gap-0.5">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Submission deadline</span>
                  <strong className="text-sm text-slate-900">{formatDate(version.closes_at)}</strong>
                </span>
              </div>
            )}
          </div>

          {openSurveys.length > 1 && (
            <section className="mb-7 overflow-hidden rounded-xl border border-slate-200 bg-white" aria-labelledby="open-surveys-title">
              <div className="border-b border-slate-200 bg-slate-50 px-5 py-4 md:px-6">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Active reporting</p>
                <h2 id="open-surveys-title" className="mt-1 text-lg font-bold text-slate-900">Open surveys</h2>
              </div>
              <div className="divide-y divide-slate-100">
                {openSurveys.map((survey) => {
                  const surveySubmission = submissions.find((item) => item.survey_version_id === survey.id);
                  return (
                    <button
                      key={survey.id}
                      type="button"
                      className="grid w-full gap-3 px-5 py-4 text-left transition-colors hover:bg-slate-50 sm:grid-cols-[5rem_minmax(0,1fr)_auto] sm:items-center md:px-6"
                      onClick={() => void open(survey)}
                    >
                      <strong className="tabular-nums text-slate-900">{survey.reporting_year}</strong>
                      <span className="min-w-0">
                        <span className="block truncate font-bold text-slate-900">{survey.name}</span>
                        <small className="mt-0.5 block text-xs text-slate-500">{survey.closes_at ? `Closes ${formatDate(survey.closes_at)}` : "No deadline set"}</small>
                      </span>
                      <span className="flex items-center justify-between gap-3 sm:justify-end">
                        <StatusBadge status={surveySubmission?.status ?? "not_started"} />
                        <ArrowRight size={16} className="text-slate-500" aria-hidden="true" />
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {version && submission ? (
            <>
              <section className="mb-7 grid min-h-[280px] grid-cols-1 overflow-hidden rounded-xl border border-slate-200 bg-white lg:grid-cols-[minmax(0,1.35fr)_minmax(250px,0.65fr)]">
                <div className="min-w-0 p-6 sm:p-7 md:p-9 lg:p-10">
                  <StatusBadge status={submission.status} />
                  <h2 className="mb-3 mt-5 text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">{version.name}</h2>
                  <p className="max-w-xl leading-6 text-slate-600">Review the responses carried forward from your last verified report, update anything that changed, then submit when the report is complete.</p>
                  <button className="mt-6 inline-flex items-center gap-2 rounded-lg bg-[#d91f17] px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#b81711]" onClick={() => setView("report")}>
                    {submission.status === "submitted" ? "View submission" : "Continue reporting"}
                    <ArrowRight size={16} aria-hidden="true" />
                  </button>
                </div>
                <div className="flex flex-col justify-center border-t border-slate-200 bg-slate-50 p-6 sm:p-7 md:border-l md:border-t-0 md:p-8 xl:p-9">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Overall completion</span>
                  <strong className="mt-2 text-5xl font-extrabold tracking-tight text-slate-900">{progress}%</strong>
                  <div className="mt-5 h-2.5 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-label="Overall report completion" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
                    <div className="h-full rounded-full bg-[#d91f17]" style={{ width: `${progress}%` }} />
                  </div>
                  <p className="mt-3 text-sm font-semibold text-slate-600">{answered} of {visible.length} responses completed</p>
                </div>
              </section>

              <section className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
                <div className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white">
                  <div className="flex items-center justify-between border-b border-slate-200 p-5 md:px-6">
                    <div>
                      <p className="mb-2 inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-widest text-slate-500">Reporting sections</p>
                      <h3 className="text-lg font-bold text-slate-900">Section progress</h3>
                    </div>
                    <span className="text-sm font-semibold text-slate-500">{sections.length} sections</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2">
                    {sections.map((s) => (
                      <button
                        key={s.key}
                        type="button"
                        className="group flex flex-col justify-between border-b border-slate-100 p-4 text-left transition-colors hover:bg-slate-50 sm:p-5 sm:[&:nth-child(odd)]:border-r"
                        onClick={() => setView("report")}
                      >
                        <div className="flex w-full items-center gap-3.5 min-w-0">
                          <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-slate-200 bg-slate-50 text-xs font-bold text-slate-600">
                            {s.answered === s.total ? <Check size={16} aria-label="Complete" /> : `${Math.round((s.answered / s.total) * 100)}%`}
                          </span>
                          <div className="flex min-w-0 flex-1 flex-col">
                            <strong className="truncate text-sm font-bold text-slate-900" title={s.title}>
                              {s.title}
                            </strong>
                            <small className="mt-0.5 text-xs font-semibold text-slate-500">
                              {s.answered} of {s.total} answered
                            </small>
                          </div>
                        </div>
                        <div className="mt-3.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={Math.round((s.answered / s.total) * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={`${s.title} progress`}>
                          <div
                            className="h-full rounded-full bg-[#d91f17] transition-all"
                            style={{ width: `${(s.answered / s.total) * 100}%` }}
                          />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <aside className="flex flex-col justify-between rounded-xl border border-slate-200 border-l-4 border-l-emerald-600 bg-white p-6 md:p-7 text-slate-900 md:flex-row md:items-center md:gap-6 xl:flex-col xl:items-start xl:gap-0">
                  <div className="flex-1 min-w-0">
                    <span className="mb-2 block text-[11px] font-extrabold uppercase tracking-widest text-emerald-700">
                      Baseline data
                    </span>
                    <div className="my-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="text-4xl font-extrabold leading-none text-slate-900 md:text-5xl">
                        {questions.filter((q) => isAnswered(answers[q.id]) && (answerProvenance[q.id] === "prefilled" || answerProvenance[q.id] === "historical_import")).length}
                      </span>
                      <h3 className="text-lg font-bold text-slate-900 md:text-xl">responses prefilled</h3>
                    </div>
                    <p className="max-w-xl text-sm leading-relaxed text-slate-600">
                      Verified responses from prior reporting cycles are automatically carried forward for your review.
                    </p>
                  </div>
                  <button className="mt-5 inline-flex shrink-0 w-fit items-center gap-2 rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-bold text-slate-900 transition-colors hover:border-slate-400 hover:bg-slate-50 md:mt-0 xl:mt-5" onClick={() => setView("report")}>
                    Review responses <ArrowRight size={16} aria-hidden="true" />
                  </button>
                </aside>
              </section>
            </>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50">
              <EmptyState icon={FileClock} title="No published survey" description="A new reporting cycle has not been opened yet. STICA will notify you when the next cycle is ready." />
            </div>
          )}
        </PageContainer>
      )}

      {/* ── History ── */}
      {view === "history" && (
        <PageContainer>
          <PageHeader eyebrow="Reporting archive" title="Survey archive" description="Review closed surveys and historical submissions without changing their recorded answers." />
          <div className="grid overflow-hidden rounded-xl border border-slate-200 bg-white">
            {versions.filter((v) => v.status === "closed").map((v) => {
              const s = submissions.find((x) => x.survey_version_id === v.id);
              return s ? (
                <article key={v.id} className="flex flex-col items-start gap-4 border-b border-slate-100 p-5 transition-colors hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between md:p-6">
                  <span className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-lg font-bold text-slate-700">{v.reporting_year}</span>
                  <div className="flex-1">
                    <h3 className="text-lg font-bold text-slate-900">{v.name}</h3>
                    <p className="text-sm text-slate-500">{s.submitted_at ? `Submitted ${formatDate(s.submitted_at)}` : `Last saved ${formatDate(s.updated_at)}`}</p>
                  </div>
                  <StatusBadge status={s.status} />
                  <button className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-900 transition-colors hover:border-slate-400 hover:bg-slate-50 hover:text-[#d91f17]" onClick={() => void open(v)}>View report <ArrowRight size={15} aria-hidden="true" /></button>
                </article>
              ) : null;
            })}
          </div>
          {versions.filter((v) => v.status === "closed").every((v) => !submissions.some((s) => s.survey_version_id === v.id)) && (
            <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-slate-50">
              <EmptyState icon={ShieldCheck} title="No previous submissions yet" description="Submitted reports will appear here for reference across reporting years." />
            </div>
          )}
        </PageContainer>
      )}

      {view === "documents" && <CompanyDocuments organization={org} submissions={submissions} versions={versions} canEdit={role !== "viewer"} setNotice={setNotice} />}
      {view === "benchmark" && <CompanyBenchmark versions={versions} setNotice={setNotice} />}
      {view === "summary" && <CompanySummary submissions={submissions} versions={versions} canGenerate={role !== "viewer"} setNotice={setNotice} />}
      {view === "team" && <CompanyTeam organization={org} canManage={role === "company_admin"} setNotice={setNotice} />}

      {/* ── Account ── */}
      {view === "account" && <AccountSettings session={session} />}
    </Shell>
  );
}

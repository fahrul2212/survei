import { useEffect, useMemo, useState } from "react";
import { BarChart3, Search, ShieldCheck } from "lucide-react";
import { getQuestionBenchmarks, type QuestionBenchmarkResponse } from "../../features/benchmarks/api";
import { supabase } from "../../lib/supabase";
import { valueAsText, type BenchmarkResult, type JsonAnswer, type SurveyVersion } from "../../lib/portal";
import { EmptyState, PageContainer, PageHeader, type Notice } from "../ui";

const percentage = (value: number | null) => `${Math.round(value ?? 0)}%`;

export function CompanyBenchmark({ versions, setNotice }: { versions: SurveyVersion[]; setNotice: (notice: Notice) => void }) {
  const eligible = useMemo(() => versions.filter((version) => version.status === "published" || version.status === "closed"), [versions]);
  const [surveyId, setSurveyId] = useState(eligible[0]?.id ?? 0);
  const [result, setResult] = useState<BenchmarkResult | null>(null);
  const [questionResult, setQuestionResult] = useState<QuestionBenchmarkResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");

  useEffect(() => {
    if (!surveyId && eligible[0]) setSurveyId(eligible[0].id);
  }, [eligible, surveyId]);

  useEffect(() => {
    if (!supabase || !surveyId) return;
    let active = true;
    setLoading(true);
    setResult(null);
    setQuestionResult(null);
    void Promise.all([
      supabase.rpc("get_company_benchmark", { target_survey_version_id: surveyId }),
      getQuestionBenchmarks(surveyId),
    ]).then(([completion, questions]) => {
      if (!active) return;
      if (completion.error) throw completion.error;
      setResult(((completion.data ?? [])[0] ?? null) as BenchmarkResult | null);
      setQuestionResult(questions);
    }).catch((error) => {
      if (active) setNotice({ kind: "error", message: error instanceof Error ? error.message : "Unable to load benchmark" });
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [setNotice, surveyId]);

  const categories = useMemo(() => Array.from(new Set((questionResult?.questions ?? []).map((item) => item.category))).sort(), [questionResult]);
  const questions = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (questionResult?.questions ?? []).filter((item) => (category === "all" || item.category === category) && (!term || item.prompt.toLowerCase().includes(term) || item.questionKey.toLowerCase().includes(term)));
  }, [category, questionResult, search]);

  return <PageContainer>
    <PageHeader eyebrow="Anonymous cohort insight" title="Company benchmark" description="Compare your results with an anonymous cohort. Individual companies and written answers are never shown." />
    <label className="mb-6 grid max-w-xl gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">Survey<select value={surveyId} onChange={(event) => { setSurveyId(Number(event.target.value)); setCategory("all"); setSearch(""); }} className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal normal-case tracking-normal text-slate-900 outline-none focus:border-[#d91f17] focus:ring-2 focus:ring-red-100">{eligible.map((version) => <option key={version.id} value={version.id}>{version.reporting_year} · {version.name}</option>)}</select></label>
    {loading ? <section className="rounded-xl border border-slate-200 bg-white"><EmptyState icon={BarChart3} title="Loading anonymous benchmark" description="Calculating permitted cohort comparisons…" /></section> : !result ? <section className="rounded-xl border border-slate-200 bg-white"><EmptyState icon={BarChart3} title="Benchmark unavailable" description="Choose a survey with company reporting activity." /></section> : result.suppressed ? (
      <section className="rounded-xl border border-slate-200 bg-white"><EmptyState icon={ShieldCheck} title="Cohort privacy threshold not reached" description={`Your completion is ${result.own_completion}%. Anonymous comparison appears once at least five active companies are in this survey; the current cohort has ${result.cohort_size}.`} /></section>
    ) : <div className="grid gap-6">
      <div className="grid gap-5 lg:grid-cols-3">
        {[
          { label: "Your completion", value: result.own_completion, note: "Current answers completed" },
          { label: "Cohort average", value: result.cohort_average, note: `${result.cohort_size} participating companies` },
          { label: "Percentile position", value: result.percentile_rank, note: "Share of cohort at or below your completion" },
        ].map((item) => <article key={item.label} className="rounded-xl border border-slate-200 bg-white p-5 md:p-6"><span className="text-xs font-bold uppercase tracking-wider text-slate-500">{item.label}</span><strong className="mt-3 block text-4xl font-extrabold tracking-tight text-slate-900">{percentage(item.value)}</strong><p className="mt-2 text-sm text-slate-500">{item.note}</p></article>)}
        <article className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-3 md:p-6"><h2 className="text-lg font-bold text-slate-900">Completion comparison</h2><div className="mt-6 grid gap-5">{[
          { label: "Your company", value: result.own_completion, color: "bg-[#d91f17]" },
          { label: "Cohort average", value: result.cohort_average ?? 0, color: "bg-slate-700" },
          { label: "Cohort median", value: result.cohort_median ?? 0, color: "bg-slate-400" },
        ].map((item) => <div key={item.label} className="grid gap-2 sm:grid-cols-[9rem_minmax(0,1fr)_3rem] sm:items-center"><span className="text-sm font-semibold text-slate-600">{item.label}</span><div className="h-2.5 overflow-hidden rounded-full bg-slate-100"><i className={`block h-full rounded-full ${item.color}`} style={{ width: `${item.value}%` }} /></div><strong className="text-right text-sm tabular-nums text-slate-900">{percentage(item.value)}</strong></div>)}</div></article>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-5 md:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div><span className="text-xs font-bold uppercase tracking-wider text-[#d91f17]">Question-level comparison</span><h2 className="mt-1 text-xl font-bold text-slate-900">Your answers against the cohort</h2><p className="mt-1 text-sm text-slate-500">Only numeric and choice questions with enough responses are included.</p></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-xs font-bold uppercase tracking-wider text-slate-500"><span>Search</span><span className="relative"><Search aria-hidden="true" size={16} className="absolute left-3 top-3 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Question or ID" className="min-h-10 w-full rounded-lg border border-slate-300 pl-9 pr-3 text-sm font-normal normal-case tracking-normal text-slate-900 outline-none focus:border-[#d91f17] focus:ring-2 focus:ring-red-100" /></span></label>
            <label className="grid gap-1 text-xs font-bold uppercase tracking-wider text-slate-500"><span>Category</span><select value={category} onChange={(event) => setCategory(event.target.value)} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal normal-case tracking-normal text-slate-900 outline-none focus:border-[#d91f17] focus:ring-2 focus:ring-red-100"><option value="all">All categories</option>{categories.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          </div>
        </div>
        {!questionResult?.available ? <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Question comparisons will appear when at least {questionResult?.threshold ?? 5} companies have submitted data.</div> : questions.length === 0 ? <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">No permitted benchmark questions match these filters.</div> : <div className="mt-6 grid gap-4 xl:grid-cols-2">
          {questions.map((item) => <article key={item.questionKey} className="rounded-xl border border-slate-200 bg-slate-50 p-4 md:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><span className="text-xs font-bold uppercase tracking-wider text-slate-500">{item.category} · {item.questionKey}</span><h3 className="mt-1 text-sm font-bold leading-6 text-slate-900">{item.prompt}</h3></div><span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 shadow-sm">{item.cohortSize} responses</span></div>
            {item.questionType === "number" ? <div className="mt-5 grid grid-cols-3 gap-3 text-center"><Metric label="Your answer" value={valueAsText(item.ownValue as JsonAnswer)} /><Metric label="Average" value={String(item.average ?? "—")} /><Metric label="Median" value={String(item.median ?? "—")} /></div> : <div className="mt-5 grid gap-3">{(item.distribution ?? []).map((choice) => <div key={choice.label}><div className="mb-1 flex items-center justify-between gap-3 text-xs"><span className="font-semibold text-slate-700">{choice.label}</span><span className="tabular-nums text-slate-500">{choice.percent}%</span></div><div className="h-2 overflow-hidden rounded-full bg-white"><span className="block h-full rounded-full bg-slate-700" style={{ width: `${choice.percent}%` }} /></div></div>)}<p className="text-xs text-slate-500">Your answer: <strong className="text-slate-700">{valueAsText(item.ownValue as JsonAnswer) || "—"}</strong></p></div>}
          </article>)}
        </div>}
      </section>
    </div>}
  </PageContainer>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-white p-3"><span className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</span><strong className="mt-1 block break-words text-lg text-slate-900">{value || "—"}</strong></div>;
}

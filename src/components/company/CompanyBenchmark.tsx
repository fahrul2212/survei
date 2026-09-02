import { useEffect, useState } from "react";
import { BarChart3, ShieldCheck } from "lucide-react";
import { supabase } from "../../lib/supabase";
import type { BenchmarkResult, SurveyVersion } from "../../lib/portal";
import { EmptyState, PageContainer, PageHeader, type Notice } from "../ui";

export function CompanyBenchmark({ versions, setNotice }: { versions: SurveyVersion[]; setNotice: (notice: Notice) => void }) {
  const eligible = versions.filter((version) => version.status === "published" || version.status === "closed");
  const [surveyId, setSurveyId] = useState(eligible[0]?.id ?? 0);
  const [result, setResult] = useState<BenchmarkResult | null>(null);

  useEffect(() => {
    if (!supabase || !surveyId) return;
    void supabase.rpc("get_company_benchmark", { target_survey_version_id: surveyId }).then(({ data, error }) => {
      if (error) setNotice({ kind: "error", message: error.message });
      else setResult(((data ?? [])[0] ?? null) as BenchmarkResult | null);
    });
  }, [setNotice, surveyId]);

  return <PageContainer>
    <PageHeader eyebrow="Anonymous cohort insight" title="Company benchmark" description="Compare reporting completion with the participating cohort without exposing another company’s data." />
    <label className="mb-6 grid max-w-xl gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">Survey<select value={surveyId} onChange={(event) => setSurveyId(Number(event.target.value))} className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal normal-case tracking-normal text-slate-900 outline-none focus:border-[#d91f17] focus:ring-2 focus:ring-red-100">{eligible.map((version) => <option key={version.id} value={version.id}>{version.reporting_year} · {version.name}</option>)}</select></label>
    {!result ? <section className="rounded-xl border border-slate-200 bg-white"><EmptyState icon={BarChart3} title="Benchmark unavailable" description="Choose a survey with company reporting activity." /></section> : result.suppressed ? (
      <section className="rounded-xl border border-slate-200 bg-white"><EmptyState icon={ShieldCheck} title="Cohort privacy threshold not reached" description={`Your completion is ${result.own_completion}%. Anonymous comparison appears once at least five active companies are in this survey; the current cohort has ${result.cohort_size}.`} /></section>
    ) : <div className="grid gap-5 lg:grid-cols-3">
      {[['Your completion', result.own_completion, 'Current answers completed'], ['Cohort average', result.cohort_average, `${result.cohort_size} active companies`], ['Percentile position', result.percentile_rank, 'Share of cohort at or below your completion']].map(([label, value, note]) => <article key={String(label)} className="rounded-xl border border-slate-200 bg-white p-5 md:p-6"><span className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</span><strong className="mt-3 block text-4xl font-extrabold tracking-tight text-slate-900">{value}%</strong><p className="mt-2 text-sm text-slate-500">{note}</p></article>)}
      <article className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-3 md:p-6"><h2 className="text-lg font-bold text-slate-900">Completion comparison</h2><div className="mt-6 grid gap-5">{[['Your company', result.own_completion, 'bg-[#d91f17]'], ['Cohort average', result.cohort_average ?? 0, 'bg-slate-700'], ['Cohort median', result.cohort_median ?? 0, 'bg-slate-400']].map(([label, value, color]) => <div key={String(label)} className="grid gap-2 sm:grid-cols-[9rem_minmax(0,1fr)_3rem] sm:items-center"><span className="text-sm font-semibold text-slate-600">{label}</span><div className="h-2.5 overflow-hidden rounded-full bg-slate-100"><i className={`block h-full rounded-full ${color}`} style={{ width: `${value}%` }} /></div><strong className="text-right text-sm tabular-nums text-slate-900">{value}%</strong></div>)}</div></article>
    </div>}
  </PageContainer>;
}

import { useCallback, useEffect, useState } from "react";
import { Bot, RefreshCw, Sparkles } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { formatDateTime, type AiSummary, type AiSummaryContent, type Submission, type SurveyVersion } from "../../lib/portal";
import { Button, EmptyState, PageContainer, PageHeader, type Notice } from "../ui";
import { generateAiSummary } from "../../features/ai-control/api";

export function CompanySummary({ submissions, versions, canGenerate, setNotice }: {
  submissions: Submission[];
  versions: SurveyVersion[];
  canGenerate: boolean;
  setNotice: (notice: Notice) => void;
}) {
  const submitted = submissions.filter((item) => item.status === "submitted");
  const [submissionId, setSubmissionId] = useState(submitted[0]?.id ?? 0);
  const [summary, setSummary] = useState<AiSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    if (!supabase || !submissionId) { setSummary(null); return; }
    const { data, error } = await supabase.from("ai_summaries").select("*").eq("submission_id", submissionId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error) setNotice({ kind: "error", message: error.message }); else setSummary(data as AiSummary | null);
  }, [setNotice, submissionId]);
  useEffect(() => { void load(); }, [load]);

  async function generate() {
    if (!supabase || !submissionId) return;
    setBusy(true);
    try {
      await generateAiSummary(submissionId);
      setNotice({ kind: "success", message: "AI summary generated from the submitted snapshot." });
      await load();
    } catch (error) {
      setNotice({ kind: "error", message: error instanceof Error ? error.message : "Unable to generate summary" });
    }
    setBusy(false);
  }

  const content = summary?.status === "completed" ? summary.content as AiSummaryContent : null;
  const label = (submission: Submission) => { const version = versions.find((item) => item.id === submission.survey_version_id); return version ? `${version.reporting_year} · ${version.name}` : `Submission ${submission.id}`; };

  return <PageContainer>
    <PageHeader eyebrow="AI-assisted review" title="Climate plan summary" description="Generate a structured draft from an immutable submitted report. Always verify the source responses before external use." />
    <section className="mb-6 rounded-xl border border-slate-200 bg-white p-5 md:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <label className="grid min-w-0 flex-1 gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">Submitted survey<select value={submissionId} onChange={(event) => setSubmissionId(Number(event.target.value))} className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal normal-case tracking-normal text-slate-900 outline-none focus:border-[#d91f17] focus:ring-2 focus:ring-red-100"><option value={0}>Choose a submitted report</option>{submitted.map((item) => <option key={item.id} value={item.id}>{label(item)}</option>)}</select></label>
        <Button icon={summary ? RefreshCw : Sparkles} disabled={!submissionId || !canGenerate || busy} onClick={() => void generate()}>{busy ? "Generating…" : summary ? "Regenerate summary" : "Generate AI summary"}</Button>
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-500">Generating sends the selected submitted responses to the configured OpenAI API for analysis. The result is an AI-assisted draft and must be verified before use.</p>
    </section>
    {!canGenerate && <p className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">Viewer accounts can read existing summaries but cannot send report data to the AI service.</p>}
    {!content ? <section className="rounded-xl border border-slate-200 bg-white"><EmptyState icon={Bot} title={summary?.status === "failed" ? "Summary generation failed" : "No AI summary yet"} description={summary?.error_message ?? "Select a submitted report and generate a concise evidence-grounded draft."} /></section> : <div className="grid gap-5 lg:grid-cols-2">
      <article className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-2 md:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-bold text-slate-900">Executive summary</h2><span className="text-xs text-slate-500">{summary?.model} · {formatDateTime(summary?.updated_at)}</span></div><p className="mt-4 max-w-5xl text-sm leading-7 text-slate-700">{content.executive_summary}</p></article>
      {[['Strengths', content.strengths], ['Evidence gaps', content.gaps], ['Notable changes', content.notable_changes]].map(([title, items]) => <article key={String(title)} className="rounded-xl border border-slate-200 bg-white p-5 md:p-6"><h2 className="text-lg font-bold text-slate-900">{title}</h2><ul className="mt-4 grid gap-3">{(items as string[]).map((item, index) => <li key={index} className="flex gap-3 text-sm leading-6 text-slate-600"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-[#d91f17]" />{item}</li>)}</ul></article>)}
      <article className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-2 md:p-6"><h2 className="text-lg font-bold text-slate-900">Priority actions</h2><div className="mt-4 divide-y divide-slate-100">{content.priority_actions.map((item, index) => <div key={index} className="py-4 first:pt-0 last:pb-0"><strong className="text-sm text-slate-900">{index + 1}. {item.action}</strong><p className="mt-1 text-sm leading-6 text-slate-600">{item.rationale}</p><span className="mt-2 block text-xs font-semibold text-slate-500">Sources: question {item.source_question_ids.join(", ") || "not specified"}</span></div>)}</div></article>
    </div>}
  </PageContainer>;
}

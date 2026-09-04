import { useMemo, useState, type FormEvent } from "react";
import { Bot, Building2, Check, LockKeyhole, Search, ShieldCheck, Sparkles } from "lucide-react";
import type { Organization, SurveyVersion } from "../../lib/portal";
import { Button, EmptyState, PageContainer, PageHeader, type Notice } from "../../components/ui";
import { exploreSurveyData } from "./api";
import type { SurveyAiResult } from "./types";

type Props = {
  mode: "admin" | "company";
  versions: SurveyVersion[];
  organizations?: Organization[];
  setNotice: (notice: Notice) => void;
};

const examples = {
  admin: [
    "Compare the strongest climate transition commitments across the selected companies.",
    "What evidence gaps occur most often, and which question IDs support that conclusion?",
    "Summarise the main differences between the selected reporting years.",
  ],
  company: [
    "Summarise our strongest climate transition commitments and the evidence gaps.",
    "Where is our company above or below the anonymised group average?",
    "Which answers should we review before the next reporting cycle?",
  ],
};

function toggle(values: number[], value: number): number[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function ResultList({ title, items, tone }: { title: string; items: string[]; tone: "green" | "blue" | "amber" }) {
  if (!items.length) return null;
  const colours = tone === "green" ? "border-emerald-200 bg-emerald-50/40 text-emerald-700" : tone === "blue" ? "border-blue-200 bg-blue-50/40 text-blue-700" : "border-amber-200 bg-amber-50/40 text-amber-800";
  return (
    <section className={`rounded-xl border p-5 ${colours}`}>
      <h3 className="text-sm font-extrabold text-slate-900">{title}</h3>
      <ul className="mt-3 grid gap-2.5 text-sm leading-6 text-slate-700">
        {items.map((item, index) => <li key={`${title}-${index}`} className="flex gap-2"><Check size={15} className="mt-1 shrink-0" aria-hidden="true" /><span>{item}</span></li>)}
      </ul>
    </section>
  );
}

export function SurveyAiExplorer({ mode, versions, organizations = [], setNotice }: Props) {
  const availableYears = useMemo(() => Array.from(new Set(versions.map((version) => version.reporting_year))).sort((a, b) => b - a), [versions]);
  const [question, setQuestion] = useState("");
  const [years, setYears] = useState<number[]>([]);
  const [organizationIds, setOrganizationIds] = useState<number[]>([]);
  const [result, setResult] = useState<SurveyAiResult | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (question.trim().length < 5) {
      setNotice({ kind: "error", message: "Enter a clear question about the survey data." });
      return;
    }
    setBusy(true);
    try {
      setResult(await exploreSurveyData({ question: question.trim(), years, organizationIds: mode === "admin" ? organizationIds : undefined }));
    } catch (error) {
      setNotice({ kind: "error", message: error instanceof Error ? error.message : "Unable to analyse the survey data" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Evidence-grounded survey analysis"
        title="AI survey explorer"
        description={mode === "admin"
          ? "Ask questions across reporting years and selected companies. Each answer is limited to authorised survey evidence and includes source question IDs."
          : "Ask about your own responses and compare them with eligible anonymised group statistics. Other companies’ individual answers are never shown."}
        actions={<span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700"><ShieldCheck size={15} /> Permission-aware</span>}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_330px]">
        <form onSubmit={submit} className="rounded-xl border border-slate-200 bg-white p-5 sm:p-7">
          <label className="block text-sm font-bold text-slate-900" htmlFor="ai-survey-question">What would you like to understand?</label>
          <textarea
            id="ai-survey-question"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            maxLength={1000}
            rows={5}
            placeholder="For example: Compare reported net-zero targets and identify the most common evidence gaps."
            className="mt-2 w-full resize-y rounded-xl border border-slate-300 bg-white px-4 py-3 text-[15px] leading-6 text-slate-900 outline-none transition focus:border-[#d91f17] focus:ring-2 focus:ring-red-100"
          />
          <div className="mt-4 flex flex-wrap gap-2">
            {examples[mode].map((example) => (
              <button key={example} type="button" onClick={() => setQuestion(example)} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-left text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-white hover:text-slate-900">
                {example}
              </button>
            ))}
          </div>

          <div className="mt-6 border-t border-slate-100 pt-5">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Reporting years</span>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" onClick={() => setYears([])} className={`rounded-lg border px-3 py-2 text-xs font-bold ${years.length === 0 ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700"}`}>All years</button>
              {availableYears.map((year) => <button key={year} type="button" onClick={() => setYears(toggle(years, year))} className={`rounded-lg border px-3 py-2 text-xs font-bold ${years.includes(year) ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700"}`}>{year}</button>)}
            </div>
          </div>

          {mode === "admin" && organizations.length > 0 && (
            <details className="mt-5 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
              <summary className="cursor-pointer text-sm font-bold text-slate-900">Companies {organizationIds.length ? `(${organizationIds.length} selected)` : "(all)"}</summary>
              <div className="mt-4 grid max-h-56 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                {organizations.map((organization) => (
                  <label key={organization.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                    <input type="checkbox" checked={organizationIds.includes(organization.id)} onChange={() => setOrganizationIds(toggle(organizationIds, organization.id))} className="accent-[#d91f17]" />
                    <span className="truncate">{organization.name}</span>
                  </label>
                ))}
              </div>
              {organizationIds.length > 0 && <button type="button" onClick={() => setOrganizationIds([])} className="mt-3 text-xs font-bold text-[#d91f17]">Clear selection</button>}
            </details>
          )}

          <div className="mt-6 flex flex-col-reverse items-start justify-between gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center">
            <p className="max-w-xl text-xs leading-5 text-slate-500">AI may make mistakes. Verify conclusions using the cited survey question IDs before sharing or publishing.</p>
            <Button type="submit" variant="primary" icon={busy ? undefined : Sparkles} disabled={busy || question.trim().length < 5}>{busy ? "Analysing…" : "Analyse survey"}</Button>
          </div>
        </form>

        <aside className="grid content-start gap-4">
          <article className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-start gap-3"><LockKeyhole size={18} className="mt-0.5 shrink-0 text-[#d91f17]" /><div><h2 className="text-sm font-bold text-slate-900">Data boundary</h2><p className="mt-1 text-xs leading-5 text-slate-500">{mode === "admin" ? "Your administrator permissions control which company records can be analysed." : "Your detailed responses stay private. Group comparisons appear only after the configured minimum cohort size is met."}</p></div></div>
          </article>
          <article className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-start gap-3"><Building2 size={18} className="mt-0.5 shrink-0 text-slate-500" /><div><h2 className="text-sm font-bold text-slate-900">Current scope</h2><p className="mt-1 text-xs leading-5 text-slate-500">{years.length ? years.join(", ") : "All available years"} · {mode === "admin" ? (organizationIds.length ? `${organizationIds.length} selected companies` : "all companies") : "your company + eligible anonymous benchmarks"}</p></div></div>
          </article>
        </aside>
      </div>

      <section className="mt-6" aria-live="polite">
        {!result ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50"><EmptyState icon={Search} title="Ready for a survey question" description="Choose a suggested question or write your own. The answer and its sources will appear here." /></div>
        ) : (
          <div className="grid gap-5">
            <article className="rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
              <div className="flex items-center gap-2 text-[#d91f17]"><Bot size={18} /><span className="text-xs font-extrabold uppercase tracking-wider">AI analysis</span></div>
              <p className="mt-4 whitespace-pre-wrap text-[15px] leading-7 text-slate-700">{result.content.answer}</p>
              <div className="mt-5 flex flex-wrap gap-2 text-xs text-slate-500"><span>{result.scope.evidence_rows} evidence rows</span><span aria-hidden="true">·</span><span>{result.usage.total.toLocaleString()} tokens</span>{result.usage.costUsd !== null && <><span aria-hidden="true">·</span><span>${result.usage.costUsd.toFixed(4)}</span></>}</div>
            </article>
            <div className="grid gap-5 lg:grid-cols-3">
              <ResultList title="Key findings" items={result.content.key_findings} tone="green" />
              <ResultList title="Comparisons" items={result.content.comparisons} tone="blue" />
              <ResultList title="Caveats" items={result.content.caveats} tone="amber" />
            </div>
            {result.content.sources.length > 0 && (
              <article className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
                <h3 className="text-sm font-bold text-slate-900">Source references</h3>
                <div className="mt-3 flex flex-wrap gap-2">{result.content.sources.map((source, index) => <span key={`${source.question_key}-${source.reporting_year}-${index}`} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700">{source.question_key} · {source.reporting_year} · {source.scope.replaceAll("_", " ")}</span>)}</div>
              </article>
            )}
          </div>
        )}
      </section>
    </PageContainer>
  );
}

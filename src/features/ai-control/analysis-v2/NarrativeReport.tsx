import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import type { AnalysisPackage, Evidence, Narrative } from "../../../../shared/analysis/contracts";
import { Dialog } from "../../../components/common/Dialog";
import { Sources } from "./SourceList";
import {
  factPeriod,
  factUnit,
  findingReferences,
  formatValue,
  measureLabel,
  metricTitle,
} from "./presentation";

export function NarrativeReport({
  result,
  narrative,
}: {
  result: AnalysisPackage;
  narrative: Narrative;
}) {
  const [selected, setSelected] = useState<{ title: string; items: Evidence[] } | null>(null);
  return (
    <section aria-label="Analysis interpretation">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Interpretation
          </p>
          <h3 className="mt-2 text-xl font-bold tracking-tight text-slate-900">Key observations</h3>
        </div>
        <p className="max-w-xs text-xs leading-5 text-slate-500">
          Prepared with AI · Review the interpretation against its cited measurements before
          sharing.
        </p>
      </header>
      <div className="divide-y divide-slate-200">
        {narrative.findings.map((finding, index) => {
          const { facts, sources } = findingReferences(finding, result);
          const titles = [...new Set(facts.map((fact) => metricTitle(result, fact.metricCode)))];
          const title = titles.length
            ? titles.join(" / ")
            : (sources[0]?.prompt ?? "Source observation");
          return (
            <article
              key={index}
              className="grid min-w-0 gap-3 py-6 sm:grid-cols-[2rem_minmax(0,1fr)] sm:gap-5"
            >
              <span
                className="pt-1 text-xs font-semibold tabular-nums text-slate-400"
                aria-hidden="true"
              >
                {String(index + 1).padStart(2, "0")}
              </span>
              <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,0.75fr)]">
                <div className="min-w-0">
                  <h4 className="break-words text-base font-semibold leading-6 text-slate-900">
                    {title}
                  </h4>
                  <p className="mt-2 max-w-3xl whitespace-pre-wrap break-words text-sm leading-7 text-slate-700">
                    {finding.text}
                  </p>
                  {!!sources.length && (
                    <button
                      type="button"
                      onClick={() =>
                        setSelected({ title: `Sources · Observation ${index + 1}`, items: sources })
                      }
                      className="mt-3 inline-flex min-h-11 items-center gap-2 rounded text-xs font-semibold text-slate-700 underline decoration-slate-300 underline-offset-4 hover:text-slate-950"
                    >
                      Inspect {sources.length} {sources.length === 1 ? "source" : "sources"} for
                      observation {index + 1}
                      <ArrowUpRight size={14} aria-hidden="true" />
                    </button>
                  )}
                </div>
                {!!facts.length && (
                  <div className="min-w-0 border-y border-slate-200 bg-slate-50 px-4">
                    <p className="pt-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      Supporting measurements
                    </p>
                    <dl className="divide-y divide-slate-200">
                      {facts.map((fact) => (
                        <div
                          key={fact.id}
                          className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 py-3"
                        >
                          <dt className="min-w-0 flex-1 text-xs leading-5 text-slate-600">
                            {titles.length > 1 && (
                              <span className="block font-semibold">
                                {metricTitle(result, fact.metricCode)}
                              </span>
                            )}
                            <span className="break-words">{measureLabel(fact, result)}</span>
                            <span className="block text-slate-500">
                              {factPeriod(fact)} · {fact.responses}{" "}
                              {fact.baselineYear !== undefined
                                ? "respondents in end year"
                                : fact.responses === 1
                                  ? "respondent"
                                  : "respondents"}
                            </span>
                          </dt>
                          <dd
                            className="max-w-full break-words text-right text-lg font-semibold tabular-nums text-slate-900"
                            title={`Exact value: ${fact.value} ${factUnit(fact)}`}
                          >
                            {formatValue(fact.value)}{" "}
                            <span className="text-xs font-normal text-slate-500">
                              {factUnit(fact)}
                            </span>
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>
      {!narrative.findings.length && (
        <p className="py-6 text-sm text-slate-600">
          No supported observations were returned. Review the measurements and sources directly.
        </p>
      )}
      {!!narrative.limitations.length && (
        <aside className="border-t border-slate-200 pt-5">
          <h4 className="text-sm font-semibold">Interpretation limitations</h4>
          <ul className="mt-3 list-disc space-y-2 pl-4 text-sm leading-6 text-slate-600">
            {narrative.limitations.map((limitation, index) => (
              <li key={index} className="break-words">
                {limitation}
              </li>
            ))}
          </ul>
        </aside>
      )}
      {selected && (
        <Dialog title={selected.title} close={() => setSelected(null)}>
          <Sources items={selected.items} />
        </Dialog>
      )}
    </section>
  );
}

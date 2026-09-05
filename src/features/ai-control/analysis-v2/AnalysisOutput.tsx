import { useId, useState, type KeyboardEvent } from "react";
import type { AnalysisRun } from "../../../../shared/analysis/contracts";
import { Explanation } from "./Explanation";
import { ResultCharts } from "./ResultCharts";
import { Sources } from "./SourceList";
import { resultYears } from "./presentation";

const sections = ["Overview", "Measurements", "Sources"] as const;
type Section = (typeof sections)[number];

export function AnalysisOutput({
  run,
  change,
  stale = false,
}: {
  run: AnalysisRun;
  change: (run: AnalysisRun) => void;
  stale?: boolean;
}) {
  const [section, setSection] = useState<Section>(run.narrative ? "Overview" : "Measurements");
  const id = useId();
  const result = run.result;
  if (!result || run.invalidated) return null;
  const years = resultYears(result);
  const counts = {
    Overview: run.narrative?.findings.length,
    Measurements: result.charts.length,
    Sources: result.evidence.length,
  };
  function navigate(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? sections.length - 1
          : event.key === "ArrowRight"
            ? (index + 1) % sections.length
            : event.key === "ArrowLeft"
              ? (index + sections.length - 1) % sections.length
              : null;
    if (next === null) return;
    event.preventDefault();
    setSection(sections[next]);
    document.getElementById(`${id}-tab-${sections[next]}`)?.focus();
  }
  return (
    <section
      aria-label="Analysis report"
      className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white"
    >
      <header className="border-b border-slate-200 p-5 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Analysis report
          </p>
          <div className="flex flex-wrap gap-2 text-xs font-semibold">
            {result.dataset === "synthetic" && (
              <span className="rounded border border-amber-200 bg-amber-50 px-2.5 py-1 text-amber-900">
                Synthetic test data
              </span>
            )}
            <span className="rounded border border-slate-200 px-2.5 py-1 text-slate-600">
              {stale
                ? "Previous filter selection"
                : result.coverage.status === "partial"
                  ? "Partial comparison"
                  : "Comparison prepared"}
            </span>
          </div>
        </div>
        <h2 className="mt-3 text-2xl font-bold tracking-tight text-slate-950">
          Survey findings & comparisons
        </h2>
        <p className="mt-2 text-xs leading-5 text-slate-500">
          Prepared{" "}
          <time dateTime={run.createdAt}>
            {new Date(run.createdAt).toLocaleString("en-GB", {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </time>{" "}
          · Calculations and AI interpretation are shown separately.
        </p>
        <dl className="mt-6 grid gap-4 border-t border-slate-200 pt-5 sm:grid-cols-3">
          <div>
            <dt className="text-xs text-slate-500">Reporting years in results</dt>
            <dd className="mt-1 text-sm font-semibold">
              {years.join(", ") || "No available sources"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Comparison basis</dt>
            <dd className="mt-1 text-sm font-semibold">
              {result.cohortMode === "matched_panel"
                ? "Same respondents across years"
                : "Available respondents each year"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Comparability review</dt>
            <dd className="mt-1 text-sm font-semibold">
              {result.coverage.comparable} comparable · {result.coverage.needsReview} need review ·{" "}
              {result.coverage.unavailable} unavailable
            </dd>
          </div>
        </dl>
      </header>
      {!!result.warnings.length && (
        <details
          className="border-b border-slate-200 bg-slate-50 px-5 py-4 sm:px-7"
          open={result.coverage.status === "partial"}
        >
          <summary className="cursor-pointer text-xs font-semibold text-slate-700">
            Comparison notes · {result.warnings.length}
          </summary>
          <ul className="mt-3 list-disc space-y-2 pl-4 text-xs leading-5 text-slate-600">
            {result.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </details>
      )}
      <div
        role="tablist"
        aria-label="Report sections"
        className="flex border-b border-slate-200 px-3 sm:px-7"
      >
        {sections.map((item, index) => (
          <button
            key={item}
            id={`${id}-tab-${item}`}
            type="button"
            role="tab"
            aria-selected={section === item}
            aria-controls={`${id}-panel-${item}`}
            tabIndex={section === item ? 0 : -1}
            onKeyDown={(event) => navigate(event, index)}
            onClick={() => setSection(item)}
            className="flex min-h-12 min-w-0 flex-1 items-center justify-center gap-2 border-b-2 border-transparent px-2 text-xs font-semibold text-slate-500 hover:text-slate-900 aria-selected:border-[#d91f17] aria-selected:text-slate-950 sm:flex-none sm:px-5 sm:text-sm"
          >
            {item}
            {counts[item] !== undefined && (
              <span className="text-[11px] font-normal tabular-nums text-slate-500">
                {counts[item]}
              </span>
            )}
          </button>
        ))}
      </div>
      <p role="status" className="sr-only">
        {run.narrative
          ? "Interpretation is available in Overview."
          : run.narrativeState === "not_requested" && result.evidence.length > 0 && !stale
            ? "Calculated measurements are available. Open Overview to request an interpretation."
            : "Calculated measurements remain available. Open Overview for the interpretation status."}
      </p>
      <div className="p-5 sm:p-7">
        <div
          id={`${id}-panel-Overview`}
          role="tabpanel"
          aria-labelledby={`${id}-tab-Overview`}
          hidden={section !== "Overview"}
          tabIndex={0}
        >
          <Explanation run={run} change={change} stale={stale} />
        </div>
        <div
          id={`${id}-panel-Measurements`}
          role="tabpanel"
          aria-labelledby={`${id}-tab-Measurements`}
          hidden={section !== "Measurements"}
          tabIndex={0}
        >
          <ResultCharts result={result} />
        </div>
        <div
          id={`${id}-panel-Sources`}
          role="tabpanel"
          aria-labelledby={`${id}-tab-Sources`}
          hidden={section !== "Sources"}
          tabIndex={0}
        >
          <h3 className="text-xl font-bold tracking-tight">Source register</h3>
          <p className="mb-6 mt-2 text-sm leading-6 text-slate-600">
            Original answers and group references used in this report. Group statistics show their
            method and response count; individual answers appear only where your access permits.
          </p>
          <Sources items={result.evidence} />
        </div>
      </div>
      <footer className="border-t border-slate-200 bg-slate-50 px-5 py-4 text-xs leading-5 text-slate-500 sm:px-7">
        {result.dataset === "synthetic"
          ? "Test data only. These results do not describe real company performance."
          : "Results reflect the source data and approved question mappings at the time this analysis was prepared."}
      </footer>
    </section>
  );
}

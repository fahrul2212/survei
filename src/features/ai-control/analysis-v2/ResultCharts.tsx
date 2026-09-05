import { useState } from "react";
import { Dialog } from "../../../components/common/Dialog";
import type { AnalysisPackage, ChartSpec } from "../../../../shared/analysis/contracts";
import { Sources } from "./SourceList";
import {
  factPeriod,
  factUnit,
  formatValue as number,
  measureLabel,
  metricTitle,
} from "./presentation";
function Chart({ chart, result }: { chart: ChartSpec; result: AnalysisPackage }) {
  const [selected, setSelected] = useState<string[]>([]);
  const companies = chart.series.filter((s) => s.role === "company");
  const [showCompanies, setShowCompanies] = useState(
    companies.length <= 4 || companies.length === chart.series.length,
  );
  const [minimum, maximum] = chart.domain,
    span = maximum - minimum;
  const position = (value: number) => (100 * (value - minimum)) / span;
  return (
    <article className="min-w-0 border-b border-slate-200 py-6 first:pt-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="font-bold text-slate-900">{chart.title}</h3>
        <span className="text-xs text-slate-500">{chart.unit}</span>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Shared scale across all displayed years and companies.{" "}
        {chart.multiSelect && "Multiple selections allowed; percentages may total more than 100%."}
      </p>
      {companies.length > 4 && companies.length !== chart.series.length && (
        <button
          type="button"
          aria-pressed={showCompanies}
          onClick={() => setShowCompanies(!showCompanies)}
          className="mt-3 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold"
        >
          {showCompanies ? "Show group summary" : "Show company measurements"}
        </button>
      )}
      <div
        className="relative mt-5 flex justify-between text-xs tabular-nums text-slate-500"
        aria-hidden="true"
      >
        <span>{number(String(minimum))}</span>
        {minimum < 0 && (
          <span className="absolute -translate-x-1/2" style={{ left: `${position(0)}%` }}>
            0
          </span>
        )}
        <span>{number(String(maximum))}</span>
      </div>
      <div className="mt-2 grid gap-4" role="list" aria-label={`${chart.title} comparison`}>
        {chart.series
          .filter((s) => showCompanies || s.role !== "company")
          .map((s, index) => {
            const value = Number(s.value),
              start = Math.min(position(0), position(value)),
              width = Math.abs(position(value) - position(0));
            return (
              <div key={`${s.label}-${index}`} role="listitem">
                <div className="mb-1 flex flex-wrap justify-between gap-x-3 text-sm">
                  <span className="break-words">{s.label}</span>
                  <strong className="tabular-nums">
                    {number(s.value)} {chart.unit}
                  </strong>
                </div>
                <div className="relative h-5 bg-slate-100" aria-hidden="true">
                  <span
                    className={`absolute top-0 h-full ${s.role === "company" ? "bg-slate-400" : "bg-slate-800"}`}
                    style={{ left: `${start}%`, width: `${width}%` }}
                  />
                  <span
                    className="absolute top-0 h-full border-l border-slate-700"
                    style={{ left: `${position(0)}%` }}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setSelected(s.evidenceIds)}
                  className="mt-1 min-h-10 rounded text-xs font-semibold text-slate-600 underline decoration-slate-300 underline-offset-4"
                >
                  View source · {s.responses} {s.responses === 1 ? "respondent" : "respondents"}
                </button>
              </div>
            );
          })}
      </div>
      {selected.length > 0 && (
        <Dialog title="Source evidence" close={() => setSelected([])}>
          <Sources items={result.evidence.filter((e) => selected.includes(e.id))} />
        </Dialog>
      )}
      <details className="mt-5 border-t border-slate-200 pt-4">
        <summary className="cursor-pointer text-sm font-bold">Data table and changes</summary>
        <div
          className="mt-3 overflow-x-auto"
          tabIndex={0}
          role="region"
          aria-label={`${chart.title} data table`}
        >
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Verified statistics for {chart.title}</caption>
            <thead>
              <tr>
                <th className="p-2">Period</th>
                <th className="p-2">Measure</th>
                <th className="p-2">Value</th>
                <th className="p-2">Respondents*</th>
              </tr>
            </thead>
            <tbody>
              {result.facts
                .filter((f) => f.metricCode === chart.metricCode)
                .map((f) => (
                  <tr key={f.id} className="border-t border-slate-100">
                    <td className="whitespace-nowrap p-2">{factPeriod(f)}</td>
                    <td className="p-2">{measureLabel(f, result)}</td>
                    <td
                      className="whitespace-nowrap p-2 tabular-nums"
                      title={`Exact value: ${f.value} ${factUnit(f)}`}
                    >
                      {number(f.value)} {factUnit(f)}
                    </td>
                    <td className="p-2">{f.responses}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs leading-5 text-slate-500">
          *For changes across years, this is the end-year response count. Values marked ≈ are
          rounded for display.
        </p>
      </details>
    </article>
  );
}
export function ResultCharts({ result }: { result: AnalysisPackage }) {
  return (
    <div className="grid gap-5">
      <header>
        <h3 className="text-xl font-bold tracking-tight">Calculated measurements</h3>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Each chart uses a shared scale. Open the data table for individual values and available
          changes between years.
        </p>
      </header>
      {result.charts.map((chart) => (
        <Chart key={chart.id} chart={chart} result={result} />
      ))}
      {!result.charts.length && (
        <p className="rounded-lg border border-slate-200 bg-white p-6 text-sm">
          No comparable measurements are available in this scope. Choose another scope or ask an
          administrator to review the question mappings. Available answers can still be inspected in
          Sources.
        </p>
      )}
      {result.dataQuality && result.dataQuality.length > 0 && (
        <details className="border-b border-slate-200 pb-5">
          <summary className="cursor-pointer text-sm font-bold">
            Data coverage and exclusions
          </summary>
          <ul className="mt-3 grid gap-3 text-sm">
            {result.dataQuality.map((q, i) => (
              <li key={`${q.metricCode}:${q.year}:${i}`} className="break-words">
                <strong>
                  {q.year} · {metricTitle(result, q.metricCode)}
                </strong>
                <p>
                  {q.used} used / {q.reports} reports · {q.missing} blank · {q.notApplicable} not
                  applicable · {q.unknown} unknown applicability · {q.invalid} invalid ·{" "}
                  {q.panelExcluded} outside matched group
                </p>
              </li>
            ))}
          </ul>
        </details>
      )}
      <details>
        <summary className="cursor-pointer font-bold">
          Comparison review · {result.coverage.comparable} comparable ·{" "}
          {result.coverage.needsReview} need review
        </summary>
        <ul className="mt-4 grid max-h-80 gap-3 overflow-y-auto text-sm">
          {result.decisions.map((d) => (
            <li key={d.id} className="break-words border-b border-slate-100 pb-2">
              <strong>{metricTitle(result, d.metricCode)}</strong> · {d.status.replaceAll("_", " ")}
              <p className="mt-1 text-xs text-slate-500">
                {d.reasons.map((r) => r.toLowerCase().replaceAll("_", " ")).join("; ") ||
                  "Source revisions match the approved metric contract."}
              </p>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

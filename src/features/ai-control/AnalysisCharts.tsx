import { useState } from "react";
import type { ComparisonChart } from "./types";
import { YearTrend } from "./YearTrend";

const format = (value: number) =>
  new Intl.NumberFormat("en", { maximumFractionDigits: 2 }).format(value);

export function AnalysisCharts({ charts }: { charts: ComparisonChart[] }) {
  const [selected, setSelected] = useState("");
  const keys = [...new Set(charts.map((chart) => chart.question_key))];
  const active = keys.includes(selected) ? selected : keys[0];
  const visible = charts.filter((chart) => chart.question_key === active);
  return (
    <section className="rounded-xl border border-slate-300 bg-white p-5 sm:p-7">
      <h2 className="text-xl font-bold text-slate-900">Answer comparisons</h2>
      <p className="mt-1 text-sm leading-6 text-slate-600">
        Calculated directly from submitted answers. Each survey is shown separately; missing answers
        are excluded.
      </p>
      {!charts.length ? (
        <p className="mt-4 text-sm text-slate-600">
          No comparable numeric or choice responses are available. Small anonymous groups and
          identifying distributions are suppressed.
        </p>
      ) : (
        <>
          <label className="mt-4 grid gap-2 text-sm font-medium">
            Question
            <select
              value={active}
              onChange={(event) => setSelected(event.target.value)}
              className="min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3"
            >
              {keys.map((key) => (
                <option key={key} value={key}>
                  {key} — {charts.find((chart) => chart.question_key === key)?.prompt}
                </option>
              ))}
            </select>
          </label>
          <YearTrend charts={visible} />
          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            {visible.map((chart) => {
              const summary = chart.aggregate;
              const numericRows = chart.companies.flatMap((company) =>
                typeof company.value === "number" ||
                (typeof company.value === "string" &&
                  company.value.trim() &&
                  Number.isFinite(Number(company.value)))
                  ? [{ label: company.name, value: Number(company.value) }]
                  : [],
              );
              if (summary.average !== undefined)
                numericRows.push({ label: "Group average", value: summary.average });
              const maximum = Math.max(1, ...numericRows.map((row) => Math.abs(row.value)));
              const rows = summary.distribution
                ? Object.entries(summary.distribution).map(([label, count]) => ({
                    label,
                    value: (count / summary.responses) * 100,
                  }))
                : numericRows;
              return (
                <article
                  key={`${chart.survey_version_id}-${chart.field ?? ""}`}
                  className="rounded-lg border border-slate-200 p-4"
                >
                  <h3 className="font-bold text-slate-900">
                    {chart.reporting_year} {chart.field ? `· ${chart.field}` : ""}
                  </h3>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    {chart.survey_name} · {summary.responses} valid responses ·{" "}
                    {chart.aggregate.average !== undefined
                      ? `Unit: ${chart.unit ?? "as reported"}`
                      : "Share of respondents (%)"}
                  </p>
                  {summary.average !== undefined && (
                    <p className="mt-1 text-xs text-slate-500">
                      Bar lengths are scaled within this survey.
                    </p>
                  )}
                  <div className="mt-4 grid gap-3">
                    {rows.map((row) => (
                      <div key={row.label}>
                        <div className="mb-1 flex justify-between gap-3 text-xs leading-5">
                          <span>{row.label}</span>
                          <strong className="shrink-0 tabular-nums">
                            {format(row.value)}
                            {summary.distribution ? "%" : ""}
                          </strong>
                        </div>
                        <div className="h-2 bg-slate-100" aria-hidden="true">
                          <div
                            className="h-full bg-red-600"
                            style={{
                              width: `${Math.min(100, (Math.abs(row.value) / (summary.distribution ? 100 : maximum)) * 100)}%`,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  {summary.distribution && (
                    <details className="mt-4 text-xs leading-5">
                      <summary className="cursor-pointer font-semibold">Company answers</summary>
                      <ul className="mt-2 grid gap-2">
                        {chart.companies.map((company) => (
                          <li key={company.name}>
                            {company.name}:{" "}
                            {Array.isArray(company.value)
                              ? company.value.join(", ")
                              : String(company.value ?? "No answer")}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </article>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}

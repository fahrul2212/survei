import type { SurveyAiResult } from "./types";

function display(value: unknown): string {
  if (value === null || value === undefined) return "No answer";
  if (Array.isArray(value)) return value.map(display).join(", ");
  if (typeof value === "object")
    return Object.entries(value)
      .map(([key, item]) => `${key}: ${display(item)}`)
      .join("\n");
  return String(value);
}

export function SourceEvidence({ result }: { result: SurveyAiResult }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
      <h3 className="font-bold text-slate-900">Source answers</h3>
      <p className="mt-1 text-sm text-slate-600">
        Open a reference to inspect the permitted evidence used for this analysis.
      </p>
      <div className="mt-4 grid gap-3">
        {result.content.sources.map((source, index) => {
          const rows = (result.evidence ?? []).filter(
            (row) =>
              row.question_key === source.question_key &&
              row.reporting_year === source.reporting_year &&
              row.scope === source.scope,
          );
          return (
            <details key={index} className="rounded-lg border border-slate-200 p-3">
              <summary className="cursor-pointer text-sm font-semibold">
                {source.question_key} · {source.reporting_year} ·{" "}
                {source.scope.replaceAll("_", " ")}
              </summary>
              {rows.map((row, rowIndex) => (
                <article
                  key={rowIndex}
                  className="mt-3 border-t border-slate-200 pt-3 text-sm leading-6"
                >
                  <p className="font-semibold">
                    {row.organization ?? "Anonymous group"} · {row.survey_name}
                  </p>
                  <p className="mt-1 text-slate-600">
                    {row.prompt}
                    {row.field ? ` — ${row.field}` : ""}
                  </p>
                  <p className="mt-2 whitespace-pre-wrap break-words">
                    {display(row.aggregate ?? row.answer)}
                  </p>
                </article>
              ))}
            </details>
          );
        })}
      </div>
    </section>
  );
}

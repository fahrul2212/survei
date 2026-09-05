import { useState } from "react";
import { valueAsText, type HistoricalImportRow, type SurveyQuestion } from "../../lib/portal";
import type { SurveyMonkeyParseResult } from "../../lib/spreadsheet";
import type { ImportChange } from "./historical-plan";
import { ImportChanges } from "./ImportChanges";

export type PreparedImport =
  | {
      kind: "surveymonkey";
      name: string;
      surveyId: number;
      target: string;
      result: SurveyMonkeyParseResult;
      questions: SurveyQuestion[];
      existing: string[];
    }
  | { kind: "canonical"; name: string; rows: HistoricalImportRow[]; changes: ImportChange[] };

export function ImportPreview({ prepared }: { prepared: PreparedImport }) {
  const [company, setCompany] = useState(0);
  const source = prepared.kind === "surveymonkey" ? prepared : null;
  const row = source?.result.rows[company];
  const samples =
    source && row
      ? source.questions.map((q) => ({
          company: row.company_name,
          key: q.stableKey,
          prompt: q.prompt,
          answer: row.answers[q.stableKey],
        }))
      : prepared.kind === "canonical"
        ? prepared.rows.slice(0, 30).map((r) => ({
            company: `${r.company_name} · ${r.reporting_year}`,
            key: r.question_key,
            prompt: r.question_prompt ?? "Existing question definition",
            answer: r.answer,
          }))
        : [];
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
      <h4 className="font-bold">Review mapping and answers</h4>
      {prepared.kind === "canonical" && (
        <ImportChanges rows={prepared.rows} changes={prepared.changes} />
      )}
      <p className="mt-2 leading-6 text-slate-600">
        {source
          ? `Target: ${source.target}. ${source.existing.length} existing submissions will be skipped; ${source.result.rows.length - source.existing.length} new company reports will be imported.`
          : "Target: each row’s reporting year. Existing historical answers with the same company, year and question ID will be updated. Review this file carefully before replacing historical data."}
      </p>
      {source && (
        <label className="my-4 grid gap-2 font-semibold">
          Preview company
          <select
            className="min-h-11 min-w-0 max-w-full rounded-lg border border-slate-300 bg-white px-3 font-normal"
            value={company}
            onChange={(e) => setCompany(Number(e.target.value))}
          >
            {source.result.rows.map((r, index) => (
              <option key={r.company_slug} value={index}>
                {r.company_name}
                {source.existing.includes(r.company_slug) ? " (will be skipped)" : " (new report)"}
              </option>
            ))}
          </select>
        </label>
      )}
      {source && source.result.warnings.length > 0 && (
        <details className="my-3 rounded border border-amber-300 bg-amber-50 p-3">
          <summary className="cursor-pointer font-semibold">
            {source.result.warnings.length} warnings — review before importing
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {source.result.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </details>
      )}
      <div className="mt-4 max-h-80 overflow-auto rounded border border-slate-200">
        <table className="w-full min-w-[560px] text-left text-xs">
          <thead className="sticky top-0 bg-slate-50">
            <tr>
              {["Company", "Question ID and mapping", "Imported answer"].map((label) => (
                <th key={label} className="p-3">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {samples.map((sample, index) => (
              <tr key={index} className="border-t border-slate-200 align-top">
                <td className="p-3">{sample.company}</td>
                <td className="max-w-64 p-3">
                  <strong>{sample.key}</strong>
                  <p className="mt-1 leading-5">{sample.prompt}</p>
                </td>
                <td className="max-w-80 whitespace-pre-wrap break-words p-3">
                  {valueAsText(sample.answer) || "No answer"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-slate-500">
        {source
          ? "All mapped questions for the selected company are shown."
          : `Showing the first ${samples.length} of ${prepared.kind === "canonical" ? prepared.rows.length : 0} rows.`}{" "}
        Preview does not change saved data. Existing records are checked again when the import runs.
      </p>
    </section>
  );
}

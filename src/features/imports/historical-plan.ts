import { sameAnswer } from "../../../shared/question-comparison";
import type { HistoricalImportRow, JsonAnswer } from "../../lib/portal";

export type ImportChange = {
  row: number;
  key: string;
  status: "new" | "changed" | "unchanged" | "rejected";
  previous?: JsonAnswer;
  reason?: string;
};
export const importKey = (row: {
  company_slug: string;
  reporting_year: number;
  question_key: string;
}) => `${row.company_slug}:${row.reporting_year}:${row.question_key}`;
export const archiveName = (year: number) => `Climate Transition Plan Annual Report ${year}`;

export function historicalPlan(
  rows: HistoricalImportRow[],
  existing: Map<string, JsonAnswer>,
  blockedYears: Set<number> = new Set(),
) {
  const seen = new Set<string>();
  return rows.map((row, index): ImportChange => {
    const key = importKey(row);
    let reason = "";
    if (
      !row.company_name ||
      !row.company_slug ||
      !/^[A-Z][A-Z0-9]*-[0-9]{3,}$/.test(row.question_key)
    )
      reason = "Company name, valid slug and stable question ID are required.";
    else if (row.reporting_year < 2020 || row.reporting_year > 2200)
      reason = "Reporting year must be between 2020 and 2200.";
    else if (seen.has(key)) reason = "Duplicate company/year/question ID in this file.";
    else if (blockedYears.has(row.reporting_year))
      reason = "The target annual archive is published and cannot be imported into.";
    else if (row.submitted_at && !Number.isFinite(Date.parse(row.submitted_at)))
      reason = "Invalid submission date.";
    seen.add(key);
    if (reason) return { row: index + 2, key, status: "rejected", reason };
    return {
      row: index + 2,
      key,
      status: !existing.has(key)
        ? "new"
        : sameAnswer(existing.get(key), row.answer)
          ? "unchanged"
          : "changed",
      previous: existing.get(key),
    };
  });
}

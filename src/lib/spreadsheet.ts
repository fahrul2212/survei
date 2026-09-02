import type { ExportRow } from "./portal";
import { valueAsText } from "./portal";

type Cell = {
  value: string | number;
  fontWeight?: "bold";
  backgroundColor?: string;
  color?: string;
  wrap?: boolean;
};

// ── Flat / long-format export ─────────────────────────────────────────────────

export async function exportResponsesXlsx(rows: ExportRow[], fileName: string): Promise<void> {
  const module = await import("write-excel-file/browser");
  const writeXlsx = module.default as unknown as (
    data: Cell[][],
    options: { fileName: string; columns: Array<{ width: number }> },
  ) => Promise<void>;

  const headers = [
    "Reporting year",
    "Survey",
    "Company",
    "Company slug",
    "External reference",
    "Status",
    "Submitted at",
    "Section",
    "Order",
    "Question ID",
    "Category",
    "Question",
    "Question type",
    "Answer",
    "Provenance",
    "Updated at",
  ];

  const headerRow: Cell[] = headers.map((value) => ({
    value,
    fontWeight: "bold",
    backgroundColor: "E32219",
    color: "FFFFFF",
    wrap: true,
  }));

  const dataRows: Cell[][] = rows.map((row) => [
    { value: row.reporting_year },
    { value: row.survey_name },
    { value: row.company_name },
    { value: row.company_slug },
    { value: row.external_reference ?? "" },
    { value: row.status },
    { value: row.submitted_at ?? "" },
    { value: row.section_title },
    { value: row.display_order },
    { value: row.question_key },
    { value: row.category },
    { value: row.question_prompt, wrap: true },
    { value: row.question_type },
    { value: valueAsText(row.answer), wrap: true },
    { value: row.provenance },
    { value: row.updated_at },
  ]);

  await writeXlsx([headerRow, ...dataRows], {
    fileName,
    columns: [12, 32, 24, 20, 18, 14, 20, 22, 8, 16, 22, 52, 16, 44, 18, 20].map((width) => ({ width })),
  });
}

// ── Pivot / wide-format export ────────────────────────────────────────────────
// One row per company per year, one column per question_key.

export async function exportPivotXlsx(rows: ExportRow[], fileName: string): Promise<void> {
  const module = await import("write-excel-file/browser");
  const writeXlsx = module.default as unknown as (
    data: Cell[][],
    options: { fileName: string; columns: Array<{ width: number }> },
  ) => Promise<void>;

  if (rows.length === 0) {
    await writeXlsx([[{ value: "No data" }]], { fileName, columns: [{ width: 20 }] });
    return;
  }

  // Collect ordered unique question keys (preserve display_order sort)
  const questionKeys = [...new Set(
    [...rows].sort((a, b) => a.display_order - b.display_order).map((r) => r.question_key),
  )];

  // Fixed meta columns
  const metaHeaders = ["Year", "Survey", "Company", "Company slug", "External ref", "Status", "Submitted at"];
  const allHeaders = [...metaHeaders, ...questionKeys];

  const headerRow: Cell[] = allHeaders.map((value) => ({
    value,
    fontWeight: "bold",
    backgroundColor: "E32219",
    color: "FFFFFF",
    wrap: true,
  }));

  // Group rows by (survey, company) so same-year surveys remain distinct.
  type PivotKey = string;
  const groups = new Map<PivotKey, { meta: ExportRow; answers: Map<string, string> }>();

  for (const row of rows) {
    const key: PivotKey = `${row.survey_version_id}||${row.company_slug}`;
    if (!groups.has(key)) {
      groups.set(key, { meta: row, answers: new Map() });
    }
    groups.get(key)!.answers.set(row.question_key, valueAsText(row.answer));
  }

  const dataRows: Cell[][] = [...groups.values()].map(({ meta, answers }) => [
    { value: meta.reporting_year },
    { value: meta.survey_name },
    { value: meta.company_name },
    { value: meta.company_slug },
    { value: meta.external_reference ?? "" },
    { value: meta.status },
    { value: meta.submitted_at ?? "" },
    ...questionKeys.map((key) => ({ value: answers.get(key) ?? "", wrap: true })),
  ]);

  const metaWidths = [8, 32, 28, 20, 18, 14, 20];
  const questionWidths = questionKeys.map(() => 36);

  await writeXlsx([headerRow, ...dataRows], {
    fileName,
    columns: [...metaWidths, ...questionWidths].map((width) => ({ width })),
  });
}

// ── Import ────────────────────────────────────────────────────────────────────

export async function readImportWorkbook(file: File): Promise<unknown[][]> {
  if (file.name.toLowerCase().endsWith(".csv")) {
    const { parseCsv } = await import("./portal");
    return parseCsv(await file.text());
  }

  const module = await import("read-excel-file/browser");
  const readXlsx = module.default as unknown as (source: File) => Promise<unknown[][]>;
  return readXlsx(file);
}

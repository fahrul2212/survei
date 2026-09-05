import type { ExportRow, JsonAnswer, SurveyQuestion } from "./portal";
import { slugify, valueAsText } from "./portal";

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
  const readXlsx = module.default as unknown as (source: File) => Promise<unknown>;
  const workbook = await readXlsx(file);
  if (Array.isArray(workbook) && workbook.length > 0 && !Array.isArray(workbook[0])) {
    const firstSheet = workbook[0] as { data?: unknown[][] };
    if (Array.isArray(firstSheet.data)) return firstSheet.data;
  }
  return Array.isArray(workbook) ? workbook as unknown[][] : [];
}

export type SurveyMonkeyImportRow = {
  company_name: string;
  company_slug: string;
  contact_email?: string;
  external_reference?: string;
  submitted_at: string | null;
  answers: Record<string, JsonAnswer>;
};

export type SurveyMonkeyParseResult = {
  rows: SurveyMonkeyImportRow[];
  sourceResponses: number;
  questionBlocks: number;
  mappedQuestions: number;
  warnings: string[];
};

function present(value: unknown): boolean {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

export function isSurveyMonkeyExport(matrix: unknown[][]): boolean {
  return String(matrix[0]?.[0] ?? "").trim().toLowerCase() === "respondent id"
    && String(matrix[0]?.[1] ?? "").trim().toLowerCase() === "collector id";
}

function importDate(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (!present(value)) return null;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function answerForBlock(row: unknown[], subHeaders: unknown[], start: number, end: number, question: SurveyQuestion): JsonAnswer {
  const entries: Array<{ label: string; value: unknown }> = [];
  for (let column = start; column < end; column += 1) {
    if (!present(row[column])) continue;
    entries.push({ label: String(subHeaders[column] ?? "").trim(), value: row[column] });
  }
  if (!entries.length) return null;
  if (question.type === "number") {
    const value = Number(entries[0].value);
    return Number.isFinite(value) ? value : String(entries[0].value).trim();
  }
  if (question.type === "multiple_choice") {
    const selected = entries.flatMap(({ label, value }) => {
      const text = String(value).trim();
      const marker = typeof value === "boolean" || /^(?:1|yes|true|selected|checked)$/i.test(text);
      if (marker && label && !/^response$/i.test(label)) return [label];
      return text.split(/\s*[;|]\s*/).filter(Boolean);
    });
    return Array.from(new Set(selected));
  }
  if (question.type === "textarea" && (end - start) > 1) {
    return entries.map(({ label, value }) => `${label && !/^response$/i.test(label) ? `${label} ` : ""}${String(value).trim()}`).join("\n");
  }
  if (question.type === "yes_no" || question.type === "single_choice" || question.type === "date") {
    return String(entries[0].value).trim();
  }
  return entries.map(({ value }) => String(value).trim()).join("\n");
}

export function parseSurveyMonkeyExport(matrix: unknown[][], questions: SurveyQuestion[]): SurveyMonkeyParseResult {
  if (!isSurveyMonkeyExport(matrix) || matrix.length < 3) throw new Error("This workbook is not a recognised SurveyMonkey detailed export.");
  const headers = matrix[0];
  const subHeaders = matrix[1] ?? [];
  const firstQuestion = headers.findIndex((value, index) => index >= 5 && /^\s*1\.\s/.test(String(value ?? "")));
  if (firstQuestion < 0) throw new Error("SurveyMonkey question columns could not be found.");
  const starts = headers.map((value, index) => index >= firstQuestion && present(value) ? index : -1).filter((index) => index >= 0);
  if (starts.length !== questions.length) {
    throw new Error(`Question mapping stopped: the workbook contains ${starts.length} question blocks but the selected survey contains ${questions.length}. Choose the matching survey version.`);
  }
  const orderedQuestions = [...questions].sort((left, right) => left.displayOrder - right.displayOrder);
  const firstEnd = starts[1] ?? headers.length;
  const companyColumn = Array.from({ length: firstEnd - starts[0] }, (_, offset) => starts[0] + offset)
    .find((column) => /^company:?$/i.test(String(subHeaders[column] ?? "").trim()));
  const emailColumn = Array.from({ length: firstEnd - starts[0] }, (_, offset) => starts[0] + offset)
    .find((column) => /^email address:?$/i.test(String(subHeaders[column] ?? "").trim()));
  const warnings: string[] = [];
  const rows = matrix.slice(2).filter((row) => row.some(present)).map((row, responseIndex) => {
    const respondentId = String(row[0] ?? `row-${responseIndex + 1}`).trim();
    const companyFromContact = companyColumn === undefined ? "" : String(row[companyColumn] ?? "").trim();
    const companyFromCustomData = String(row[8] ?? "").trim();
    const companyName = companyFromContact || companyFromCustomData || `SurveyMonkey respondent ${respondentId}`;
    if (!companyFromContact && !companyFromCustomData) warnings.push(`Response ${responseIndex + 1} has no company field; a respondent-based placeholder will be used.`);
    const answers = Object.fromEntries(orderedQuestions.map((question, index) => {
      const start = starts[index];
      const end = starts[index + 1] ?? headers.length;
      return [question.stableKey, answerForBlock(row, subHeaders, start, end, question)];
    }));
    const baseSlug = slugify(companyName) || `surveymonkey-${slugify(respondentId) || responseIndex + 1}`;
    return {
      company_name: companyName.slice(0, 300),
      company_slug: baseSlug.slice(0, 160),
      contact_email: emailColumn === undefined ? undefined : String(row[emailColumn] ?? "").trim().toLowerCase() || undefined,
      external_reference: respondentId || undefined,
      submitted_at: importDate(row[3]),
      answers,
    };
  });
  const duplicateSlugs = rows.map((row) => row.company_slug).filter((slug, index, all) => all.indexOf(slug) !== index);
  if (duplicateSlugs.length) throw new Error(`Duplicate company detected in the workbook: ${duplicateSlugs[0]}. Resolve the duplicate before importing.`);
  return { rows, sourceResponses: rows.length, questionBlocks: starts.length, mappedQuestions: questions.length, warnings: Array.from(new Set(warnings)) };
}

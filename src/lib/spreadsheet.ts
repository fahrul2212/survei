import type { ExportRow } from "./portal";
import { valueAsText } from "./portal";

type Cell = {
  value: string | number;
  fontWeight?: "bold";
  backgroundColor?: string;
  color?: string;
  wrap?: boolean;
};

export async function exportResponsesXlsx(rows: ExportRow[], fileName: string): Promise<void> {
  const module = await import("write-excel-file/browser");
  const writeXlsx = module.default as unknown as (
    data: Cell[][],
    options: { fileName: string; columns: Array<{ width: number }> },
  ) => Promise<void>;

  const headers = [
    "Reporting year",
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
    columns: [12, 24, 20, 18, 14, 20, 22, 8, 16, 22, 52, 16, 44, 18, 20].map((width) => ({ width })),
  });
}

export async function readImportWorkbook(file: File): Promise<unknown[][]> {
  if (file.name.toLowerCase().endsWith(".csv")) {
    const { parseCsv } = await import("./portal");
    return parseCsv(await file.text());
  }

  const module = await import("read-excel-file/browser");
  const readXlsx = module.default as unknown as (source: File) => Promise<unknown[][]>;
  return readXlsx(file);
}

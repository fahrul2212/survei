import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, UploadCloud } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { normalizeImportMatrix, parseSurveyQuestion, type HistoricalImportRow, type SurveyVersion } from "../../lib/portal";
import { isSurveyMonkeyExport, parseSurveyMonkeyExport, readImportWorkbook, type SurveyMonkeyParseResult } from "../../lib/spreadsheet";
import { Button, type Notice } from "../../components/ui";

const QUESTION_SELECT = `id,survey_version_id,display_order,is_required,carry_forward_enabled,visibility_rule,section_key,section_title,question_revision:question_revisions!inner(id,prompt,help_text,question_type,options,validation,question:question_definitions!inner(id,stable_key,category))`;

type Prepared =
  | { kind: "surveymonkey"; name: string; surveyId: number; result: SurveyMonkeyParseResult }
  | { kind: "canonical"; name: string; rows: HistoricalImportRow[] };

export function SurveyDataImport({ versions, setNotice, onImported }: {
  versions: SurveyVersion[];
  setNotice: (notice: Notice) => void;
  onImported: () => Promise<void>;
}) {
  const eligible = useMemo(() => versions.filter((version) => version.status !== "published").sort((a, b) => b.reporting_year - a.reporting_year || b.id - a.id), [versions]);
  const [surveyId, setSurveyId] = useState(eligible[0]?.id ?? 0);
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!surveyId && eligible[0]) setSurveyId(eligible[0].id);
  }, [eligible, surveyId]);

  async function prepare(file: File | null) {
    setPrepared(null);
    if (!file || !supabase) return;
    setBusy(true);
    try {
      const matrix = await readImportWorkbook(file);
      if (isSurveyMonkeyExport(matrix)) {
        if (!surveyId) throw new Error("Select the matching target survey before uploading a SurveyMonkey export.");
        const questionResult = await supabase.from("survey_questions").select(QUESTION_SELECT).eq("survey_version_id", surveyId).order("display_order");
        if (questionResult.error) throw questionResult.error;
        const parsed = parseSurveyMonkeyExport(matrix, (questionResult.data ?? []).map(parseSurveyQuestion));
        setPrepared({ kind: "surveymonkey", name: file.name, surveyId, result: parsed });
      } else {
        const rows = normalizeImportMatrix(matrix);
        if (!rows.length) throw new Error("The import file contains no response rows.");
        setPrepared({ kind: "canonical", name: file.name, rows });
      }
    } catch (error) {
      setNotice({ kind: "error", message: error instanceof Error ? error.message : "Unable to read the import file" });
    } finally { setBusy(false); }
  }

  async function runImport() {
    if (!supabase || !prepared) return;
    const detail = prepared.kind === "surveymonkey"
      ? `${prepared.result.sourceResponses} company responses into the selected survey`
      : `${prepared.rows.length} historical answer rows`;
    const safeguard = prepared.kind === "surveymonkey"
      ? " Existing submissions are skipped and will not be overwritten."
      : " Existing historical answers with the same import key will be updated.";
    if (!window.confirm(`Import ${detail}?${safeguard}`)) return;
    setBusy(true);
    try {
      if (prepared.kind === "surveymonkey") {
        const result = await supabase.rpc("import_surveymonkey_responses", {
          target_survey_version_id: prepared.surveyId,
          import_rows: prepared.result.rows,
        });
        if (result.error) throw result.error;
        const summary = result.data as { companies?: number; answers?: number; skippedExisting?: number; unknownAnswers?: number };
        setNotice({ kind: "success", message: `Imported ${summary.companies ?? 0} companies and ${summary.answers ?? 0} answers. ${summary.skippedExisting ?? 0} existing submissions skipped.` });
      } else {
        const result = await supabase.rpc("import_historical_responses", { import_rows: prepared.rows });
        if (result.error) throw result.error;
        setNotice({ kind: "success", message: `${result.data} historical answer rows imported.` });
      }
      setPrepared(null);
      if (inputRef.current) inputRef.current.value = "";
      await onImported();
    } catch (error) {
      setNotice({ kind: "error", message: error instanceof Error ? error.message : "Import failed" });
    } finally { setBusy(false); }
  }

  return (
    <section className="flex flex-col gap-5 rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
      <div><h3 className="text-xl font-bold text-slate-900">SurveyMonkey and historical import</h3><p className="mt-1 text-sm leading-6 text-slate-500">Upload a native SurveyMonkey detailed XLSX export or the standard STICA long-format workbook.</p></div>
      <label className="grid gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">Target survey for SurveyMonkey files<select value={surveyId} onChange={(event) => { setSurveyId(Number(event.target.value)); setPrepared(null); if (inputRef.current) inputRef.current.value = ""; }} className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal normal-case tracking-normal text-slate-900 outline-none focus:border-[#d91f17] focus:ring-2 focus:ring-red-100">{eligible.map((version) => <option key={version.id} value={version.id}>{version.reporting_year} · {version.name} ({version.status})</option>)}</select></label>
      <div className="relative">
        <input ref={inputRef} type="file" accept=".xlsx,.csv" onChange={(event) => void prepare(event.target.files?.[0] ?? null)} className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0" aria-label="Select SurveyMonkey or historical response file" />
        <div className={`flex min-h-32 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center ${prepared ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-slate-50"}`}>
          {prepared ? <CheckCircle2 size={28} className="text-emerald-600" /> : <UploadCloud size={28} className="text-slate-400" />}
          <strong className={`text-sm ${prepared ? "text-emerald-800" : "text-slate-700"}`}>{busy ? "Reading and validating file…" : prepared?.name ?? "Choose .xlsx or .csv file"}</strong>
          <span className="text-xs text-slate-500">The file is validated and previewed before any database change.</span>
        </div>
      </div>
      {prepared && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-start gap-3"><FileSpreadsheet size={18} className="mt-0.5 shrink-0 text-[#d91f17]" /><div><strong className="text-sm text-slate-900">{prepared.kind === "surveymonkey" ? "SurveyMonkey detailed export" : "STICA long-format import"}</strong><p className="mt-1 text-xs leading-5 text-slate-600">{prepared.kind === "surveymonkey" ? `${prepared.result.sourceResponses} responses · ${prepared.result.mappedQuestions}/${prepared.result.questionBlocks} question blocks mapped` : `${prepared.rows.length} answer rows ready`}</p></div></div>
          {prepared.kind === "surveymonkey" && prepared.result.warnings.length > 0 && <div className="mt-3 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800"><AlertTriangle size={15} className="mt-0.5 shrink-0" /><span>{prepared.result.warnings.slice(0, 3).join(" ")}</span></div>}
          {prepared.kind === "surveymonkey" && <p className="mt-3 truncate text-xs text-slate-500" title={prepared.result.rows.map((row) => row.company_name).join(", ")}>Companies: {prepared.result.rows.slice(0, 4).map((row) => row.company_name).join(", ")}{prepared.result.rows.length > 4 ? ` and ${prepared.result.rows.length - 4} more` : ""}</p>}
        </div>
      )}
      <div className="mt-auto flex justify-end"><Button variant="primary" icon={UploadCloud} disabled={!prepared || busy} onClick={() => void runImport()}>{busy ? "Working…" : "Import validated data"}</Button></div>
    </section>
  );
}

import { supabase } from "../../lib/supabase";
import type { HistoricalImportRow, JsonAnswer } from "../../lib/portal";
import { archiveName, historicalPlan, importKey } from "./historical-plan";

export async function loadHistoricalPlan(rows: HistoricalImportRow[]) {
  if (!supabase) throw new Error("Portal connection is unavailable");
  const years = [...new Set(rows.map((row) => row.reporting_year))];
  const versions = await supabase
    .from("survey_versions")
    .select("id,reporting_year,name,status")
    .in("reporting_year", years);
  if (versions.error) throw versions.error;
  const targets = (versions.data ?? []).filter(
    (version) => version.name === archiveName(version.reporting_year),
  );
  const existing = new Map<string, JsonAnswer>();
  if (targets.length) {
    for (let offset = 0; ; offset += 500) {
      const result = await supabase
        .from("reporting_export")
        .select("company_slug,reporting_year,question_key,answer,provenance")
        .in(
          "survey_version_id",
          targets.map((target) => target.id),
        )
        .not("provenance", "is", null)
        .order("survey_version_id")
        .order("company_slug")
        .order("question_key")
        .range(offset, offset + 499);
      if (result.error) throw result.error;
      for (const row of result.data ?? []) existing.set(importKey(row), row.answer);
      if ((result.data?.length ?? 0) < 500) break;
      if (offset >= 50_000)
        throw new Error("This preview exceeds the safe row limit. Import fewer years at a time.");
    }
  }
  return historicalPlan(
    rows,
    existing,
    new Set(targets.filter((t) => t.status === "published").map((t) => t.reporting_year)),
  );
}

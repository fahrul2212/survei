import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuthenticatedCaller } from "../lib/supabase";
import { databaseError } from "../lib/supabase";
import { json, readJsonObject, requireMethod, requireSameOrigin } from "../lib/http";
import { loadAnalysis } from "../services/analysis/load";
import { buildEvidence } from "../services/analysis/evidence";

export async function analysisRoute(
  request: Request,
  admin: SupabaseClient,
  caller: AuthenticatedCaller,
) {
  requireMethod(request, "POST");
  requireSameOrigin(request);
  const body = await readJsonObject(request, 24_000);
  const data = await loadAnalysis(admin, caller, body);
  const settings = await admin
    .from("ai_settings")
    .select("benchmark_minimum")
    .eq("id", 1)
    .maybeSingle();
  if (settings.error) throw databaseError(settings.error, "Unable to load benchmark settings");
  const threshold = Math.max(3, Number(settings.data?.benchmark_minimum ?? 5));
  const { charts } = buildEvidence(data, threshold);
  return json({
    charts,
    threshold: caller.platformAdmin ? 1 : threshold + 1,
    reportingYears: data.versions.map((row) => row.reporting_year),
    submittedReports: caller.platformAdmin ? data.submissions.length : undefined,
  });
}

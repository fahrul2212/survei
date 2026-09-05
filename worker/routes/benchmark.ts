import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuthenticatedCaller } from "../lib/supabase";
import { databaseError } from "../lib/supabase";
import { ApiError, json, requireMethod, requireSameOrigin } from "../lib/http";
import { loadAnalysis } from "../services/analysis/load";
import { buildEvidence } from "../services/analysis/evidence";

export async function questionBenchmarkRoute(
  request: Request,
  admin: SupabaseClient,
  caller: AuthenticatedCaller,
) {
  requireMethod(request, "GET");
  requireSameOrigin(request);
  if (caller.platformAdmin) throw new ApiError(403, "Company account required", "company_required");
  const surveyVersionId = Number(new URL(request.url).searchParams.get("surveyVersionId"));
  if (!Number.isSafeInteger(surveyVersionId) || surveyVersionId <= 0)
    throw new ApiError(400, "Valid survey version required", "survey_required");
  const settings = await admin
    .from("ai_settings")
    .select("benchmark_minimum")
    .eq("id", 1)
    .maybeSingle();
  if (settings.error) throw databaseError(settings.error, "Unable to load benchmark settings");
  const threshold = Math.max(3, Number(settings.data?.benchmark_minimum ?? 5));
  let data;
  try {
    data = await loadAnalysis(admin, caller, { surveyVersionIds: [surveyVersionId] });
  } catch (error) {
    if (error instanceof ApiError && error.code === "submission_not_found")
      return json({
        available: false,
        reason: "no_submissions",
        threshold: threshold + 1,
        cohortSize: 0,
        questions: [],
      });
    throw error;
  }
  const { charts } = buildEvidence(data, threshold);
  const own = data.submissions.filter(
    (row) => Number(row.organization_id) === data.ownOrganizationId,
  );
  const ownIds = new Set(own.map((row) => Number(row.id)));
  const ownAnswers = data.answers.filter((row) => ownIds.has(Number(row.submission_id)));
  const ownMetrics = buildEvidence(
    { ...data, submissions: own, answers: ownAnswers, ownOrganizationId: null },
    1,
  ).charts;
  const questions = charts
    .filter((chart) => chart.companies.length)
    .map((chart) => ({
      questionKey: `${chart.question_key}${chart.field ? ` / ${chart.field}` : ""}`,
      prompt: chart.prompt,
      category: chart.category,
      questionType: chart.aggregate?.average !== undefined ? "number" : "single_choice",
      ownValue: chart.companies[0].value,
      cohortSize: chart.aggregate!.responses,
      average: chart.aggregate?.average ?? null,
      median: chart.aggregate?.median ?? null,
      distribution: chart.aggregate?.distribution
        ? Object.entries(chart.aggregate.distribution).map(([label, count]) => ({
            label,
            count,
            percent: Math.round((count / chart.aggregate!.responses) * 1000) / 10,
          }))
        : null,
    }));
  return json({
    available: questions.length > 0,
    reason: questions.length
      ? null
      : !own.length
        ? "no_own_submission"
        : !ownMetrics.length
          ? "no_comparable_answers"
          : "privacy_threshold",
    threshold: threshold + 1,
    cohortSize: data.submissions.length,
    questions,
  });
}

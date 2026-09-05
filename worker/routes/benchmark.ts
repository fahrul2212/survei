import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuthenticatedCaller } from "../lib/supabase";
import { databaseError } from "../lib/supabase";
import { ApiError, json, requireMethod, requireSameOrigin } from "../lib/http";

type AnswerRow = { submission_id: number; survey_question_id: number; value: unknown };
type BenchmarkQuestion = {
  questionKey: string;
  prompt: string;
  category: string;
  questionType: string;
  ownValue: unknown;
  cohortSize: number;
  average: number | null;
  median: number | null;
  distribution: Array<{ label: string; count: number; percent: number }> | null;
};

function isAnswered(value: unknown): boolean {
  return value !== null && value !== "" && (!Array.isArray(value) || value.length > 0);
}

function numeric(value: unknown): number | null {
  const result = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(result) ? result : null;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function categories(value: unknown): string[] {
  if (Array.isArray(value)) return Array.from(new Set(value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.slice(0, 200))));
  if (typeof value === "string" || typeof value === "boolean") return [String(value).slice(0, 200)];
  return [];
}

async function loadAnswers(admin: SupabaseClient, submissionIds: number[]): Promise<AnswerRow[]> {
  const rows: AnswerRow[] = [];
  for (let from = 0; from < 20_000; from += 1000) {
    const result = await admin.from("answers").select("submission_id,survey_question_id,value").in("submission_id", submissionIds).range(from, from + 999);
    if (result.error) throw databaseError(result.error, "Unable to load benchmark answers");
    rows.push(...((result.data ?? []) as AnswerRow[]));
    if ((result.data?.length ?? 0) < 1000) break;
  }
  return rows;
}

export async function questionBenchmarkRoute(request: Request, admin: SupabaseClient, caller: AuthenticatedCaller): Promise<Response> {
  requireMethod(request, "GET");
  requireSameOrigin(request);
  if (caller.platformAdmin) throw new ApiError(403, "Company account required", "company_required");
  const surveyVersionId = Number(new URL(request.url).searchParams.get("surveyVersionId"));
  if (!Number.isInteger(surveyVersionId) || surveyVersionId <= 0) throw new ApiError(400, "Valid survey version required", "survey_required");

  const membership = await admin.from("organization_members").select("organization_id").eq("user_id", caller.user.id).order("organization_id").limit(1).maybeSingle();
  if (membership.error) throw databaseError(membership.error, "Unable to verify company access");
  if (!membership.data) throw new ApiError(403, "Company membership required", "company_required");
  const organizationId = Number(membership.data.organization_id);

  const [submissions, settings, questions] = await Promise.all([
    admin.from("company_submissions").select("id,organization_id").eq("survey_version_id", surveyVersionId).eq("status", "submitted").limit(500),
    admin.from("ai_control_settings").select("benchmark_minimum").eq("id", 1).maybeSingle(),
    admin.from("survey_questions").select("id,display_order,question_revision:question_revisions(prompt,question_type,question:question_definitions(stable_key,category))").eq("survey_version_id", surveyVersionId).order("display_order").limit(500),
  ]);
  if (submissions.error) throw databaseError(submissions.error, "Unable to load benchmark cohort");
  if (questions.error) throw databaseError(questions.error, "Unable to load benchmark questions");
  const threshold = Math.max(3, Number(settings.data?.benchmark_minimum ?? 5));
  const ownSubmission = submissions.data?.find((row) => Number(row.organization_id) === organizationId);
  if (!ownSubmission) return json({ available: false, threshold, cohortSize: submissions.data?.length ?? 0, questions: [] });
  const submissionIds = (submissions.data ?? []).map((row) => Number(row.id));
  const answers = await loadAnswers(admin, submissionIds);
  const answersByQuestion = new Map<number, AnswerRow[]>();
  answers.forEach((answer) => answersByQuestion.set(answer.survey_question_id, [...(answersByQuestion.get(answer.survey_question_id) ?? []), answer]));

  const output = (questions.data ?? []).flatMap<BenchmarkQuestion>((row) => {
    const revisionValue = row.question_revision;
    const revision = Array.isArray(revisionValue) ? revisionValue[0] : revisionValue;
    const definitionValue = revision?.question;
    const definition = Array.isArray(definitionValue) ? definitionValue[0] : definitionValue;
    const type = String(revision?.question_type ?? "text");
    if (!new Set(["number", "yes_no", "single_choice", "multiple_choice"]).has(type)) return [];
    const questionAnswers = (answersByQuestion.get(Number(row.id)) ?? []).filter((answer) => isAnswered(answer.value));
    const ownAnswer = questionAnswers.find((answer) => answer.submission_id === Number(ownSubmission.id));
    const respondingCompanies = new Set(questionAnswers.map((answer) => answer.submission_id)).size;
    if (!ownAnswer || respondingCompanies < threshold) return [];
    const common = {
      questionKey: String(definition?.stable_key ?? ""), prompt: String(revision?.prompt ?? ""),
      category: String(definition?.category ?? "General"), questionType: type,
      ownValue: ownAnswer.value, cohortSize: respondingCompanies,
    };
    if (type === "number") {
      const values = questionAnswers.map((answer) => numeric(answer.value)).filter((value): value is number => value !== null);
      if (values.length < threshold) return [];
      return [{ ...common, average: values.reduce((sum, value) => sum + value, 0) / values.length, median: median(values), distribution: null }];
    }
    const counts = new Map<string, number>();
    questionAnswers.forEach((answer) => categories(answer.value).forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1)));
    return [{ ...common, average: null, median: null, distribution: Array.from(counts, ([label, count]) => ({ label, count, percent: Math.round((count / respondingCompanies) * 1000) / 10 })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)) }];
  });
  return json({ available: true, threshold, cohortSize: submissions.data?.length ?? 0, questions: output });
}

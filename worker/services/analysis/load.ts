import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuthenticatedCaller } from "../../lib/supabase";
import { databaseError } from "../../lib/supabase";
import { ApiError } from "../../lib/http";
import { numberArray, stringArray } from "./filters";
import { allRows } from "./pagination";

export type QuestionMeta = {
  id: number;
  surveyVersionId: number;
  key: string;
  category: string;
  prompt: string;
  type: string;
  options: string[];
  validation: Record<string, unknown>;
};

export async function loadAnalysis(
  admin: SupabaseClient,
  caller: AuthenticatedCaller,
  body: Record<string, unknown>,
) {
  const years = numberArray(body.years, 100);
  const surveyVersionIds = numberArray(body.surveyVersionIds, 100);
  const organizationIds = numberArray(body.organizationIds, 200);
  const questionKeys = stringArray(body.questionKeys, 200, 100);
  const categories = stringArray(body.categories, 100);
  let ownOrganizationId: number | null = null;
  if (!caller.platformAdmin) {
    if (organizationIds.length)
      throw new ApiError(
        403,
        "Company comparisons use anonymous statistics only",
        "scope_forbidden",
      );
    const membership = await admin
      .from("organization_members")
      .select("organization_id,organization:organizations!inner(is_active)")
      .eq("user_id", caller.user.id)
      .eq("organization.is_active", true)
      .order("organization_id")
      .limit(1)
      .maybeSingle();
    if (membership.error) throw databaseError(membership.error, "Unable to verify company access");
    if (!membership.data)
      throw new ApiError(403, "Company membership required", "company_required");
    ownOrganizationId = Number(membership.data.organization_id);
  }
  const versions = await allRows(
    (from, to) => {
      let query = admin.from("survey_versions").select("id,reporting_year,name").order("id");
      if (years.length) query = query.in("reporting_year", years);
      if (surveyVersionIds.length) query = query.in("id", surveyVersionIds);
      return query.range(from, to);
    },
    "reporting years",
    1000,
  );
  const versionIds = versions.map((row) => Number(row.id));
  if (!versionIds.length)
    throw new ApiError(404, "No reporting years match these filters", "survey_not_found");
  const submissions = await allRows(
    (from, to) => {
      let query = admin
        .from("company_submissions")
        .select(
          "id,organization_id,survey_version_id,organization:organizations!inner(name,is_active)",
        )
        .eq("status", "submitted")
        .in("survey_version_id", versionIds)
        .order("id");
      if (caller.platformAdmin && organizationIds.length)
        query = query.in("organization_id", organizationIds);
      if (!caller.platformAdmin) query = query.eq("organization.is_active", true);
      return query.range(from, to);
    },
    "submitted reports",
    5000,
  );
  if (!submissions.length)
    throw new ApiError(404, "No submitted reports match these filters", "submission_not_found");
  const questionRows = await allRows(
    (from, to) =>
      admin
        .from("survey_questions")
        .select(
          "id,survey_version_id,section_title,question_revision:question_revisions(prompt,question_type,options,validation,question:question_definitions(stable_key,category))",
        )
        .in("survey_version_id", versionIds)
        .order("id")
        .range(from, to),
    "survey questions",
    20_000,
  );
  const questions: QuestionMeta[] = questionRows
    .map((row) => {
      const revision = Array.isArray(row.question_revision)
        ? row.question_revision[0]
        : row.question_revision;
      const definition = Array.isArray(revision?.question)
        ? revision.question[0]
        : revision?.question;
      return {
        id: Number(row.id),
        surveyVersionId: Number(row.survey_version_id),
        key: String(definition?.stable_key ?? ""),
        category: String(definition?.category ?? row.section_title ?? "General"),
        prompt: String(revision?.prompt ?? ""),
        type: String(revision?.question_type ?? "text"),
        options: Array.isArray(revision?.options) ? (revision.options as string[]) : [],
        validation: (revision?.validation as Record<string, unknown>) ?? {},
      };
    })
    .filter(
      (row) =>
        (!questionKeys.length || questionKeys.includes(row.key)) &&
        (!categories.length || categories.includes(row.category)),
    );
  if (!questions.length)
    throw new ApiError(404, "No survey questions match these filters", "question_not_found");
  const answers = await allRows(
    (from, to) =>
      admin
        .from("answers")
        .select("submission_id,survey_question_id,value")
        .in(
          "submission_id",
          submissions.map((row) => row.id),
        )
        .in(
          "survey_question_id",
          questions.map((row) => row.id),
        )
        .order("id")
        .range(from, to),
    "survey answers",
  );
  return {
    versions,
    submissions,
    questions,
    answers,
    ownOrganizationId,
    filters: { years, organizationIds, questionKeys, categories },
  };
}

export type AnalysisData = Awaited<ReturnType<typeof loadAnalysis>>;

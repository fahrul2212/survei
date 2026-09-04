import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const PROJECT_REF = "ptqdzqxfmtonitflenod";
const PROJECT_URL = `https://${PROJECT_REF}.supabase.co`;
const KEEP_NAME = "STICA Signatory's Survey 2025 - Climate Transition Plans";
const APPLY = process.argv.includes("--apply");

function serviceRoleKey() {
  const raw = execFileSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", `npx supabase projects api-keys --project-ref ${PROJECT_REF} -o json`], { encoding: "utf8", windowsHide: true });
  const key = JSON.parse(raw).find((item) => item.name === "service_role")?.api_key;
  if (!key) throw new Error("The authenticated Supabase CLI did not return a service_role key.");
  return key;
}

const db = createClient(PROJECT_URL, serviceRoleKey(), { auth: { persistSession: false, autoRefreshToken: false } });

function check(scope, error) {
  if (error) throw new Error(`${scope}: ${error.message}`);
}

async function count(table, column, values) {
  if (!values.length) return 0;
  const result = await db.from(table).select("id", { count: "exact", head: true }).in(column, values);
  check(`count ${table}`, result.error);
  return result.count ?? 0;
}

async function remove(table, column, values) {
  if (!values.length) return;
  const result = await db.from(table).delete().in(column, values);
  check(`delete ${table}`, result.error);
}

async function main() {
  const versionsResult = await db.from("survey_versions").select("id,reporting_year,name,status").order("id");
  check("load survey versions", versionsResult.error);
  const versions = versionsResult.data ?? [];
  const keep = versions.filter((version) => version.reporting_year === 2025 && version.name === KEEP_NAME);
  if (keep.length !== 1) throw new Error(`Safety check failed: expected exactly one retained 2025 copy, found ${keep.length}.`);
  const targets = versions.filter((version) => version.id !== keep[0].id);
  const targetVersionIds = targets.map((version) => Number(version.id));
  const submissionResult = targetVersionIds.length
    ? await db.from("company_submissions").select("id").in("survey_version_id", targetVersionIds)
    : { data: [], error: null };
  check("load target submissions", submissionResult.error);
  const submissionIds = (submissionResult.data ?? []).map((row) => Number(row.id));
  const documentResult = submissionIds.length
    ? await db.from("submission_documents").select("id,storage_path").in("submission_id", submissionIds)
    : { data: [], error: null };
  check("check submission documents", documentResult.error);
  if ((documentResult.data?.length ?? 0) > 0) {
    throw new Error("Safety stop: target surveys contain uploaded files. Remove or archive those storage objects explicitly before retrying.");
  }

  const inventory = {
    mode: APPLY ? "apply" : "dry-run",
    retained: keep[0],
    deleting: targets,
    dependentRows: {
      submissions: submissionIds.length,
      answers: await count("answers", "submission_id", submissionIds),
      snapshots: await count("submission_snapshots", "submission_id", submissionIds),
      aiSummaries: await count("ai_summaries", "submission_id", submissionIds),
      documents: documentResult.data?.length ?? 0,
      reminderPolicies: await count("reminder_policies", "survey_version_id", targetVersionIds),
      reminderDeliveries: await count("reminder_deliveries", "survey_version_id", targetVersionIds),
    },
  };
  console.log(JSON.stringify(inventory, null, 2));
  if (!APPLY) {
    console.log("Dry run only. Re-run with --apply after reviewing the exact retained and deleted survey list.");
    return;
  }
  if (!targetVersionIds.length) {
    console.log("No obsolete survey cycles remain.");
    return;
  }

  await remove("ai_summaries", "submission_id", submissionIds);
  await remove("submission_snapshots", "submission_id", submissionIds);
  await remove("submission_documents", "submission_id", submissionIds);
  await remove("company_submissions", "id", submissionIds);
  await remove("survey_versions", "id", targetVersionIds);

  const [revisions, remainingQuestions] = await Promise.all([
    db.from("question_revisions").select("id,question_id"),
    db.from("survey_questions").select("question_revision_id"),
  ]);
  check("load question revisions", revisions.error);
  check("load remaining survey questions", remainingQuestions.error);
  const usedRevisionIds = new Set((remainingQuestions.data ?? []).map((row) => Number(row.question_revision_id)));
  const orphanRevisionIds = (revisions.data ?? []).filter((row) => !usedRevisionIds.has(Number(row.id))).map((row) => Number(row.id));
  await remove("question_revisions", "id", orphanRevisionIds);

  const [definitions, remainingRevisions, carryRules] = await Promise.all([
    db.from("question_definitions").select("id"),
    db.from("question_revisions").select("question_id"),
    db.from("question_carry_forward_rules").select("source_question_id"),
  ]);
  check("load question definitions", definitions.error);
  check("load remaining question revisions", remainingRevisions.error);
  check("load remaining carry rules", carryRules.error);
  const usedDefinitionIds = new Set([
    ...(remainingRevisions.data ?? []).map((row) => Number(row.question_id)),
    ...(carryRules.data ?? []).map((row) => Number(row.source_question_id)),
  ]);
  const orphanDefinitionIds = (definitions.data ?? []).filter((row) => !usedDefinitionIds.has(Number(row.id))).map((row) => Number(row.id));
  await remove("question_definitions", "id", orphanDefinitionIds);

  const verification = await db.from("survey_versions").select("id,reporting_year,name,status");
  check("verify retained survey", verification.error);
  if (verification.data?.length !== 1 || verification.data[0].id !== keep[0].id) {
    throw new Error("Post-cleanup verification failed: the database does not contain exactly the intended retained survey.");
  }
  console.log(JSON.stringify({ completed: true, retained: verification.data[0], removedSurveyCount: targets.length, removedSubmissionCount: submissionIds.length }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

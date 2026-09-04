import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const PROJECT_REF = "ptqdzqxfmtonitflenod";
const PROJECT_URL = `https://${PROJECT_REF}.supabase.co`;
const KEEP_NAME = "STICA Signatory's Survey 2025 - Climate Transition Plans";
const outputPath = process.argv[2] ?? "tmp/pre-2025-copy-cleanup-survey-data.json";

const raw = execFileSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", `npx supabase projects api-keys --project-ref ${PROJECT_REF} -o json`], { encoding: "utf8", windowsHide: true });
const serviceKey = JSON.parse(raw).find((item) => item.name === "service_role")?.api_key;
if (!serviceKey) throw new Error("The authenticated Supabase CLI did not return a service_role key.");
const db = createClient(PROJECT_URL, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

function check(scope, error) { if (error) throw new Error(`${scope}: ${error.message}`); }
async function all(table, query = (builder) => builder) {
  const rows = [];
  for (let from = 0; from < 100_000; from += 1000) {
    const result = await query(db.from(table).select("*")).range(from, from + 999);
    check(`backup ${table}`, result.error);
    rows.push(...(result.data ?? []));
    if ((result.data?.length ?? 0) < 1000) break;
  }
  return rows;
}

async function main() {
  const versions = await all("survey_versions");
  const targetVersions = versions.filter((version) => !(version.reporting_year === 2025 && version.name === KEEP_NAME));
  const versionIds = targetVersions.map((version) => version.id);
  const surveyQuestions = await all("survey_questions", (query) => query.in("survey_version_id", versionIds));
  const revisionIds = surveyQuestions.map((row) => row.question_revision_id);
  const revisions = revisionIds.length ? await all("question_revisions", (query) => query.in("id", revisionIds)) : [];
  const definitionIds = revisions.map((row) => row.question_id);
  const submissions = await all("company_submissions", (query) => query.in("survey_version_id", versionIds));
  const submissionIds = submissions.map((row) => row.id);
  const snapshotRows = submissionIds.length ? await all("submission_snapshots", (query) => query.in("submission_id", submissionIds)) : [];
  const backup = {
    metadata: { createdAt: new Date().toISOString(), projectRef: PROJECT_REF, purpose: "Pre-cleanup recovery copy", keepSurveyName: KEEP_NAME },
    survey_versions: targetVersions,
    question_definitions: definitionIds.length ? await all("question_definitions", (query) => query.in("id", definitionIds)) : [],
    question_revisions: revisions,
    survey_questions: surveyQuestions,
    question_carry_forward_rules: surveyQuestions.length ? await all("question_carry_forward_rules", (query) => query.in("target_survey_question_id", surveyQuestions.map((row) => row.id))) : [],
    company_submissions: submissions,
    answers: submissionIds.length ? await all("answers", (query) => query.in("submission_id", submissionIds)) : [],
    submission_snapshots: snapshotRows,
    submission_documents: submissionIds.length ? await all("submission_documents", (query) => query.in("submission_id", submissionIds)) : [],
    ai_summaries: submissionIds.length ? await all("ai_summaries", (query) => query.in("submission_id", submissionIds)) : [],
    reminder_policies: versionIds.length ? await all("reminder_policies", (query) => query.in("survey_version_id", versionIds)) : [],
    reminder_deliveries: versionIds.length ? await all("reminder_deliveries", (query) => query.in("survey_version_id", versionIds)) : [],
    ai_usage_events: versionIds.length ? await all("ai_usage_events", (query) => query.in("survey_version_id", versionIds)) : [],
  };
  mkdirSync(outputPath.slice(0, Math.max(outputPath.lastIndexOf("/"), outputPath.lastIndexOf("\\"))), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(backup), { encoding: "utf8", mode: 0o600 });
  console.log(JSON.stringify({ completed: true, outputPath, surveys: targetVersions.length, submissions: submissions.length, answers: backup.answers.length, snapshots: snapshotRows.length }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

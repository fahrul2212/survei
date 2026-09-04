import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const PROJECT_REF = "ptqdzqxfmtonitflenod";
const PROJECT_URL = `https://${PROJECT_REF}.supabase.co`;
const SURVEY_NAME = "STICA Signatory's Survey 2025 - Climate Transition Plans";
const COMPANY_COUNT = 8;

function serviceRoleKey() {
  const raw = execFileSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", `npx supabase projects api-keys --project-ref ${PROJECT_REF} -o json`], { encoding: "utf8", windowsHide: true });
  const key = JSON.parse(raw).find((item) => item.name === "service_role")?.api_key;
  if (!key) throw new Error("The authenticated Supabase CLI did not return a service_role key.");
  return key;
}

const db = createClient(PROJECT_URL, serviceRoleKey(), { auth: { persistSession: false, autoRefreshToken: false } });
function check(scope, error) { if (error) throw new Error(`${scope}: ${error.message}`); }

async function platformAdminId() {
  for (let page = 1; page <= 100; page += 1) {
    const result = await db.auth.admin.listUsers({ page, perPage: 1000 });
    check("load platform administrator", result.error);
    const admin = result.data.users.find((user) => user.app_metadata?.role === "platform_admin");
    if (admin) return admin.id;
    if (result.data.users.length < 1000) break;
  }
  throw new Error("No platform administrator account is available as the synthetic import actor.");
}

function optionValues(options) {
  return Array.isArray(options) ? options.filter((item) => typeof item === "string" && item.trim()) : [];
}

function syntheticValue(question, profileIndex) {
  const order = Number(question.display_order);
  const revision = Array.isArray(question.question_revision) ? question.question_revision[0] : question.question_revision;
  const definitionValue = revision?.question;
  const definition = Array.isArray(definitionValue) ? definitionValue[0] : definitionValue;
  const key = String(definition?.stable_key ?? `CTP25-${String(order).padStart(3, "0")}`);
  const type = String(revision?.question_type ?? "text");
  const options = optionValues(revision?.options);
  const profile = profileIndex % 3; // Three anonymous response patterns mirror the three populated XLS export rows.

  if (order === 1) return `Sample Company ${String(profileIndex + 1).padStart(2, "0")} contact record. Demonstration data only; no real person or contact details.`;
  if (order === 2) return "Secondary sample contact is intentionally omitted to avoid personal data.";
  if (order === 6) return [85, 240, 1250][profile] + profileIndex * 11;
  if (order === 15) return [2027, 2028, 2030][profile];
  if (order === 17) return [2028, 2030, 2032][profile];
  if ([50, 60, 65, 68, 83].includes(order)) return "Yes";
  if (type === "yes_no") return ((order + profileIndex) % 5 === 0) ? "No" : "Yes";
  if (type === "single_choice") return options.length ? options[(order + profile) % options.length] : "Yes";
  if (type === "multiple_choice") {
    if (!options.length) return [];
    const first = (order + profile) % options.length;
    const selected = [options[first]];
    if (options.length > 2 && profile !== 1) selected.push(options[(first + 1) % options.length]);
    return selected;
  }
  if (type === "number") return 10 + profileIndex * 5 + order;
  if (type === "date") return `2025-${String((profileIndex % 9) + 1).padStart(2, "0")}-15`;
  const narratives = [
    "The sample company reports a documented programme with assigned ownership, annual review, and measurable implementation milestones.",
    "The sample company is developing its approach and identifies supplier data quality, resourcing, and consistent measurement as current evidence gaps.",
    "The sample company reports partial implementation, with planned improvements to targets, governance records, and progress monitoring.",
  ];
  return `${narratives[profile]} [${key}]`;
}

async function main() {
  const actor = await platformAdminId();
  const surveyResult = await db.from("survey_versions").select("id,reporting_year,name,status").eq("reporting_year", 2025).eq("name", SURVEY_NAME).single();
  check("load retained 2025 survey", surveyResult.error);
  const survey = surveyResult.data;
  const questionsResult = await db.from("survey_questions")
    .select("id,display_order,question_revision:question_revisions(prompt,question_type,options,question:question_definitions(stable_key))")
    .eq("survey_version_id", survey.id).order("display_order");
  check("load 2025 questions", questionsResult.error);
  const questions = questionsResult.data ?? [];
  if (questions.length !== 92) throw new Error(`Expected 92 retained questions, found ${questions.length}.`);

  const organizations = Array.from({ length: COMPANY_COUNT }, (_, index) => ({
    name: `Sample Textile Company ${String(index + 1).padStart(2, "0")}`,
    slug: `sample-textile-2025-${String(index + 1).padStart(2, "0")}`,
    contact_email: `survey-contact-${String(index + 1).padStart(2, "0")}@example.invalid`,
    external_reference: `SYNTHETIC-2025-${String(index + 1).padStart(2, "0")}`,
    is_active: true,
  }));
  const orgResult = await db.from("organizations").upsert(organizations, { onConflict: "slug" }).select("id,name,slug");
  check("upsert synthetic organizations", orgResult.error);

  for (const [index, organization] of (orgResult.data ?? []).sort((a, b) => a.slug.localeCompare(b.slug)).entries()) {
    const submittedAt = new Date(Date.UTC(2025, 11, 1 + index, 10, 0, 0)).toISOString();
    const submissionResult = await db.from("company_submissions").upsert({
      organization_id: organization.id, survey_version_id: survey.id, status: "submitted",
      current_section: "additional-challenges", submitted_at: submittedAt, submitted_by: actor,
      revision_number: 1, created_by: actor, updated_at: submittedAt,
    }, { onConflict: "organization_id,survey_version_id" }).select("id").single();
    check(`upsert submission for ${organization.slug}`, submissionResult.error);
    const submissionId = submissionResult.data.id;
    const answers = questions.map((question) => ({
      submission_id: submissionId,
      survey_question_id: question.id,
      value: syntheticValue(question, index),
      provenance: "historical_import",
      updated_by: actor,
      updated_at: submittedAt,
    }));
    const answerResult = await db.from("answers").upsert(answers, { onConflict: "submission_id,survey_question_id" });
    check(`upsert answers for ${organization.slug}`, answerResult.error);
    const payload = answers.map((answer) => ({ survey_question_id: answer.survey_question_id, value: answer.value, provenance: answer.provenance }));
    const snapshotResult = await db.from("submission_snapshots").upsert({
      submission_id: submissionId, revision_number: 1, payload, submitted_by: actor, submitted_at: submittedAt,
    }, { onConflict: "submission_id,revision_number" });
    check(`upsert snapshot for ${organization.slug}`, snapshotResult.error);
    const auditCheck = await db.from("audit_events").select("id").eq("event_type", "seed.synthetic_submission").eq("entity_type", "company_submission").eq("entity_id", String(submissionId)).maybeSingle();
    check(`check audit event for ${organization.slug}`, auditCheck.error);
    if (!auditCheck.data) {
      const auditResult = await db.from("audit_events").insert({
        organization_id: organization.id, actor_user_id: actor, event_type: "seed.synthetic_submission",
        entity_type: "company_submission", entity_id: String(submissionId),
        details: { reporting_year: 2025, source: "anonymized SurveyMonkey XLS structure", synthetic: true },
        occurred_at: submittedAt,
      });
      check(`write audit event for ${organization.slug}`, auditResult.error);
    }
  }

  const closeResult = await db.from("survey_versions").update({ status: "closed", opens_at: "2025-10-01T00:00:00Z", closes_at: "2025-12-31T23:59:59Z", published_at: "2025-10-01T00:00:00Z" }).eq("id", survey.id);
  check("close retained historical survey", closeResult.error);
  console.log(JSON.stringify({ completed: true, surveyVersionId: survey.id, survey: SURVEY_NAME, questions: questions.length, syntheticCompanies: COMPANY_COUNT, syntheticAnswers: COMPANY_COUNT * questions.length }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

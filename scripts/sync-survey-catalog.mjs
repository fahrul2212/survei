import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const catalog = JSON.parse(
  readFileSync(new URL("../data/ctp25-catalog.json", import.meta.url), "utf8"),
);
const name = "Copy of STICA Signatory's Survey 2025 - Climate Transition Plans";
const apply = process.argv.includes("--apply");
if (
  catalog.questions.length !== 92 ||
  new Set(catalog.questions.map((q) => q.stableKey)).size !== 92
)
  throw new Error("Invalid source catalog");
if (!apply) {
  console.log(
    JSON.stringify(
      {
        name,
        year: 2025,
        pages: catalog.pageCount,
        questions: 92,
        action:
          "Create or resume a separate draft using new question revisions. Existing surveys and answers are preserved.",
        apply: "node scripts/sync-survey-catalog.mjs --apply",
      },
      null,
      2,
    ),
  );
} else {
  const env = Object.fromEntries(
    readFileSync(".env.test.local", "utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
  );
  const db = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const unwrap = (result) => {
    if (result.error) throw new Error(result.error.message);
    return result.data;
  };
  unwrap(
    await db.auth.signInWithPassword({
      email: env.TEST_ADMIN_EMAIL,
      password: env.TEST_ADMIN_PASSWORD,
    }),
  );
  try {
    let version = unwrap(
      await db
        .from("survey_versions")
        .select("id,status")
        .eq("reporting_year", 2025)
        .eq("name", name)
        .maybeSingle(),
    );
    if (version && version.status !== "draft")
      throw new Error(
        "Source draft has been published or closed; create a new revision explicitly.",
      );
    if (!version)
      version = {
        id: unwrap(
          await db.rpc("create_survey_year", {
            new_reporting_year: 2025,
            survey_name: name,
            open_at: null,
            close_at: null,
            clone_from_survey_version_id: null,
          }),
        ),
        status: "draft",
      };
    const submissionCheck = await db
      .from("company_submissions")
      .select("id", { count: "exact", head: true })
      .eq("survey_version_id", version.id);
    unwrap(submissionCheck);
    if (submissionCheck.count)
      throw new Error("Draft already has company answers; refusing to change its schema.");
    const existing = unwrap(
      await db
        .from("survey_questions")
        .select(
          "id,question_revision:question_revisions(prompt,question:question_definitions(stable_key))",
        )
        .eq("survey_version_id", version.id),
    );
    for (const question of catalog.questions) {
      const current = existing.find(
        (row) => row.question_revision?.question?.stable_key === question.stableKey,
      );
      unwrap(
        await db.rpc("save_survey_question", {
          target_survey_version_id: version.id,
          target_survey_question_id: current?.id ?? null,
          stable_question_key: question.stableKey,
          question_category: question.category,
          question_prompt: question.prompt,
          question_help_text: null,
          response_type: question.type,
          response_options: question.options,
          response_validation: question.validation,
          required_response: question.required,
          target_section_key: question.sectionKey,
          target_section_title: question.sectionTitle,
          target_visibility_rule: {},
          carry_source_question_key: null,
        }),
      );
      if (question.n % 20 === 0) console.log(`Saved ${question.n}/92 questions`);
    }
    const result = await db
      .from("survey_questions")
      .select("id", { count: "exact", head: true })
      .eq("survey_version_id", version.id);
    unwrap(result);
    if (result.count !== 92) throw new Error(`Verification failed: ${result.count} questions`);
    console.log(
      JSON.stringify({
        surveyVersionId: version.id,
        status: "draft",
        questions: result.count,
        pages: catalog.pageCount,
      }),
    );
  } finally {
    await db.auth.signOut();
  }
}

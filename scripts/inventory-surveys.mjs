import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(".env.test.local", "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const separator = line.indexOf("=");
      return [line.slice(0, separator), line.slice(separator + 1)];
    }),
);

const db = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function requireOk(scope, error) {
  if (error) throw new Error(`${scope}: ${error.message}`);
}

async function count(table, column, value) {
  const result = await db.from(table).select("id", { count: "exact", head: true }).eq(column, value);
  requireOk(`count ${table}`, result.error);
  return result.count ?? 0;
}

async function main() {
  const login = await db.auth.signInWithPassword({
    email: env.TEST_ADMIN_EMAIL,
    password: env.TEST_ADMIN_PASSWORD,
  });
  requireOk("admin login", login.error);

  const versions = await db
    .from("survey_versions")
    .select("id,reporting_year,name,status,opens_at,closes_at,created_at")
    .order("reporting_year", { ascending: true })
    .order("id", { ascending: true });
  requireOk("survey versions", versions.error);

  const inventory = [];
  for (const version of versions.data ?? []) {
    const submissions = await db
      .from("company_submissions")
      .select("id")
      .eq("survey_version_id", version.id);
    requireOk("survey submissions", submissions.error);

    let answerCount = 0;
    let snapshotCount = 0;
    let documentCount = 0;
    let summaryCount = 0;
    if (submissions.data?.length) {
      const ids = submissions.data.map((row) => row.id);
      const answers = await db.from("answers").select("id", { count: "exact", head: true }).in("submission_id", ids);
      requireOk("survey answers", answers.error);
      answerCount = answers.count ?? 0;
      const snapshots = await db.from("submission_snapshots").select("id", { count: "exact", head: true }).in("submission_id", ids);
      requireOk("survey snapshots", snapshots.error);
      snapshotCount = snapshots.count ?? 0;
      const documents = await db.from("submission_documents").select("id", { count: "exact", head: true }).in("submission_id", ids);
      requireOk("survey documents", documents.error);
      documentCount = documents.count ?? 0;
      const summaries = await db.from("ai_summaries").select("id", { count: "exact", head: true }).in("submission_id", ids);
      requireOk("survey summaries", summaries.error);
      summaryCount = summaries.count ?? 0;
    }

    inventory.push({
      ...version,
      questions: await count("survey_questions", "survey_version_id", version.id),
      submissions: submissions.data?.length ?? 0,
      answers: answerCount,
      snapshots: snapshotCount,
      documents: documentCount,
      ai_summaries: summaryCount,
      reminder_policies: await count("reminder_policies", "survey_version_id", version.id),
      reminder_deliveries: await count("reminder_deliveries", "survey_version_id", version.id),
    });
  }

  console.table(inventory);
  await db.auth.signOut();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

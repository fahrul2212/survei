import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const bin = "C:/laragon/bin/postgresql/postgresql-18.6/bin/";
const db = `analysis_v2_test_accounts_${Date.now()}`;
const conn = ["-h", "127.0.0.1", "-p", "55439", "-U", "postgres"];
const options = { encoding: "utf8", windowsHide: true, maxBuffer: 4000000 };
execFileSync(`${bin}createdb.exe`, [...conn, db], options);
const files = [
  "tests/fixtures/analysis-database.sql",
  "supabase/migrations/20260905104312_analysis_platform_v2.sql",
  "supabase/migrations/20260905105210_analysis_mapping_reviews.sql",
  "supabase/migrations/20260905110050_analysis_narrative_reservations.sql",
  "tests/fixtures/account-survey-database.sql",
  "supabase/migrations/20260905133126_survey_and_internal_accounts.sql",
  "supabase/migrations/20260905141432_survey_edit_conflict_response.sql",
  "tests/fixtures/workflow-database.sql",
];
try {
  execFileSync(
    `${bin}psql.exe`,
    [...conn, "-d", db, "-v", "ON_ERROR_STOP=1", ...files.flatMap((f) => ["-f", f])],
    options,
  );
  // Exercise the real historical answer routine before applying its conflict-only migration.
  const reportMigration = readFileSync(
    "supabase/migrations/20260905072655_report_flow_integrity.sql",
    "utf8",
  );
  const answerStart = reportMigration.indexOf("create function app_private.save_report_answer(");
  const answerEnd = reportMigration.indexOf(
    "create function public.save_report_answer(",
    answerStart,
  );
  execFileSync(`${bin}psql.exe`, [...conn, "-d", db, "-v", "ON_ERROR_STOP=1"], {
    ...options,
    input: reportMigration.slice(answerStart, answerEnd),
  });
  const followups = [
    "supabase/migrations/20260905145246_workflow_conflicts_and_account_revisions.sql",
    "supabase/migrations/20260905145346_account_edit_revisions.sql",
    "tests/database-account-survey.sql",
    "tests/database-analysis-v2.sql",
    "tests/database-workflow-recovery.sql",
  ];
  execFileSync(
    `${bin}psql.exe`,
    [...conn, "-d", db, "-v", "ON_ERROR_STOP=1", ...followups.flatMap((f) => ["-f", f])],
    options,
  );
  console.log(
    JSON.stringify({
      database: db,
      result: "passed",
      assertions:
        "roles, disabled sessions, analyst scope, self protection, survey update/delete, audit and stale edits",
    }),
  );
} catch (e) {
  console.error(e.stderr);
  process.exitCode = 1;
}

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
  "tests/database-account-survey.sql",
];
try {
  execFileSync(
    `${bin}psql.exe`,
    [...conn, "-d", db, "-v", "ON_ERROR_STOP=1", ...files.flatMap((f) => ["-f", f])],
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

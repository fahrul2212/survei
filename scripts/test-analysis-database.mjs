import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";

// Requires an isolated PostgreSQL instance on loopback:55439. No linked credentials are read.
const execute = promisify(execFile);
const bin =
  process.env.STICA_TEST_PG_BIN ??
  (process.platform === "win32" ? "C:/laragon/bin/postgresql/postgresql-18.6/bin" : "");
const binary = (name) => join(bin, `${name}${process.platform === "win32" ? ".exe" : ""}`);
const database = `analysis_v2_test_${Date.now()}`;
const connection = ["-h", "127.0.0.1", "-p", "55439", "-U", "postgres"];
const options = { windowsHide: true, maxBuffer: 4_000_000 };
await execute(binary("createdb"), [...connection, database], options);
const args = [...connection, "-d", database, "-v", "ON_ERROR_STOP=1", "-At"];
const files = [
  "tests/fixtures/analysis-database.sql",
  "supabase/migrations/20260905104312_analysis_platform_v2.sql",
  "supabase/migrations/20260905105210_analysis_mapping_reviews.sql",
  "supabase/migrations/20260905110050_analysis_narrative_reservations.sql",
  "tests/database-analysis-v2.sql",
];
const databaseTests = await execute(
  binary("psql"),
  [...args, ...files.flatMap((file) => ["-f", file])],
  options,
);
if (!databaseTests.stderr.includes("PASS:")) throw new Error("Database assertions did not finish");
const query =
  "insert into ai_usage_events(requested_by,request_type,model,estimated_cost_usd) values('10000000-0000-4000-8000-000000000001','local-concurrency-fixture','fixture',3);";
const results = await Promise.allSettled(
  Array.from({ length: 4 }, () => execute(binary("psql"), [...args, "-c", query], options)),
);
const accepted = results.filter((result) => result.status === "fulfilled").length;
const blocked = results.filter((result) => result.status === "rejected");
if (
  accepted !== 3 ||
  blocked.length !== 1 ||
  !blocked[0].reason.stderr.includes("AI budget exceeded")
) {
  throw new Error("Concurrent reservations did not enforce the budget");
}
const { stdout } = await execute(
  binary("psql"),
  [...args, "-c", "select sum(estimated_cost_usd) from ai_usage_events;"],
  options,
);
if (Number(stdout.trim()) !== 9) throw new Error("Reservation total is incorrect");
console.log(
  JSON.stringify({
    database,
    migrations: files.length - 2,
    assertions: "passed",
    concurrentRequests: 4,
    accepted,
    blocked: blocked.length,
    reserved: 9,
    budget: 10,
  }),
);

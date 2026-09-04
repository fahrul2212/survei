import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(readFileSync(".env.test.local", "utf8").split(/\r?\n/).filter(Boolean).map((line) => {
  const at = line.indexOf("=");
  return [line.slice(0, at), line.slice(at + 1)];
}));
const makeClient = () => createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const results = [];

function check(name, condition, detail = "") {
  results.push({ test: name, result: condition ? "PASS" : "FAIL", detail });
  if (!condition) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

async function login(email, password) {
  const client = makeClient();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  check(`Login ${email}`, !error && Boolean(data.session), error?.message);
  return client;
}

async function main() {
  const anonymousResult = await makeClient().from("organizations").select("id");
  check("Anonymous is denied organisation data", Boolean(anonymousResult.error) || anonymousResult.data.length === 0);

  const admin = await login(env.TEST_ADMIN_EMAIL, env.TEST_ADMIN_PASSWORD);
  const { data: adminIdentity } = await admin.auth.getUser();
  check("Admin JWT has platform_admin role", adminIdentity.user?.app_metadata?.role === "platform_admin", adminIdentity.user?.app_metadata?.role);
  const organisationsResult = await admin.from("organizations").select("id,slug").eq("is_active", true);
  check("Admin sees all showcase companies", !organisationsResult.error && organisationsResult.data.length >= 6, organisationsResult.error?.message || String(organisationsResult.data?.length));
  const versionResult = await admin.from("survey_versions").select("id").eq("reporting_year", 2026).single();
  check("Admin sees reporting year 2026", !versionResult.error, versionResult.error?.message);
  const questionsResult = await admin.from("survey_questions").select("id", { count: "exact", head: true }).eq("survey_version_id", versionResult.data.id);
  check("Published survey has exactly 90 questions", !questionsResult.error && questionsResult.count === 90, questionsResult.error?.message || String(questionsResult.count));
  const progressResult = await admin.from("admin_submission_progress").select("organization_id").eq("reporting_year", 2026);
  check("Admin can read progress dashboard", !progressResult.error && progressResult.data.length >= 5, progressResult.error?.message || String(progressResult.data?.length));

  const company = await login(env.TEST_CLIENT_EMAIL, env.TEST_CLIENT_PASSWORD);
  const { data: companyIdentity } = await company.auth.getUser();
  check("Client JWT has company_user role", companyIdentity.user?.app_metadata?.role === "company_user", companyIdentity.user?.app_metadata?.role);
  const visibleResult = await company.from("organizations").select("id,slug");
  check("Client sees exactly its own company", !visibleResult.error && visibleResult.data.length === 1, visibleResult.error?.message || String(visibleResult.data?.length));
  const other = organisationsResult.data.find((row) => row.id !== visibleResult.data[0].id);
  const leakResult = await company.from("organizations").select("id").eq("id", other.id);
  check("Client cannot read another company", !leakResult.error && leakResult.data.length === 0, leakResult.error?.message || String(leakResult.data?.length));
  const submissionsResult = await company.from("company_submissions").select("id,status,survey_version_id").eq("organization_id", visibleResult.data[0].id);
  check("Client sees three years of its own reports", !submissionsResult.error && submissionsResult.data.length === 3, submissionsResult.error?.message || String(submissionsResult.data?.length));
  const current = submissionsResult.data.find((row) => row.survey_version_id === versionResult.data.id);
  const adminAnswersResult = await admin.from("answers").select("id", { count: "exact", head: true }).eq("submission_id", current.id);
  check("Admin can count the client's current answers", !adminAnswersResult.error, adminAnswersResult.error?.message);
  const answersResult = await company.from("answers").select("id", { count: "exact", head: true }).eq("submission_id", current.id);
  check(
    "Client sees every answer in its current submission",
    !answersResult.error && answersResult.count === adminAnswersResult.count,
    answersResult.error?.message || `${answersResult.count}/${adminAnswersResult.count}`,
  );
  const forbidden = await company.rpc("create_survey_year", { p_reporting_year: 2027, p_name: "Forbidden role smoke test" });
  check(
    "Client cannot execute admin survey RPC",
    Boolean(forbidden.error),
    forbidden.error ? "Access denied as expected" : "RPC unexpectedly succeeded",
  );

  await Promise.all([admin.auth.signOut(), company.auth.signOut()]);
  console.table(results);
  console.log(`Role smoke tests passed: ${results.length}/${results.length}`);
}

main().catch((error) => { console.table(results); console.error(error.message); process.exitCode = 1; });

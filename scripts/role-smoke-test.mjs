import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(".env.test.local", "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const at = line.indexOf("=");
      return [line.slice(0, at), line.slice(at + 1)];
    }),
);
const makeClient = () =>
  createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
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
  check(
    "Anonymous is denied organisation data",
    Boolean(anonymousResult.error) || anonymousResult.data.length === 0,
  );

  const admin = await login(env.TEST_ADMIN_EMAIL, env.TEST_ADMIN_PASSWORD);
  const { data: adminIdentity } = await admin.auth.getUser();
  check(
    "Admin JWT has platform_admin role",
    adminIdentity.user?.app_metadata?.role === "platform_admin",
    adminIdentity.user?.app_metadata?.role,
  );
  const organisationsResult = await admin
    .from("organizations")
    .select("id,slug")
    .eq("is_active", true);
  check(
    "Admin sees all showcase companies",
    !organisationsResult.error && organisationsResult.data.length >= 6,
    organisationsResult.error?.message || String(organisationsResult.data?.length),
  );
  const versionResult = await admin
    .from("survey_versions")
    .select("id,name,status")
    .eq("reporting_year", 2025)
    .eq("name", "STICA Signatory's Survey 2025 - Climate Transition Plans")
    .single();
  check(
    "Admin sees the retained 2025 SurveyMonkey copy",
    !versionResult.error,
    versionResult.error?.message,
  );
  const questionsResult = await admin
    .from("survey_questions")
    .select("id", { count: "exact", head: true })
    .eq("survey_version_id", versionResult.data.id);
  check(
    "Retained 2025 survey has exactly 92 questions",
    !questionsResult.error && questionsResult.count === 92,
    questionsResult.error?.message || String(questionsResult.count),
  );
  const progressResult = await admin
    .from("admin_submission_progress")
    .select("organization_id")
    .eq("reporting_year", 2025);
  check(
    "Admin can read the seeded 2025 progress dashboard",
    !progressResult.error && progressResult.data.length >= 8,
    progressResult.error?.message || String(progressResult.data?.length),
  );
  const emailTemplateResult = await admin.from("email_templates").select("template_key");
  check(
    "Admin can manage both email templates",
    !emailTemplateResult.error && emailTemplateResult.data.length === 2,
    emailTemplateResult.error?.message || String(emailTemplateResult.data?.length),
  );
  const adminSession = await admin.auth.getSession();
  const adminBenchmarkResponse = await fetch(
    `https://stica.webmaintain.tech/api/benchmark/questions?surveyVersionId=${versionResult.data.id}`,
    { headers: { Authorization: `Bearer ${adminSession.data.session.access_token}` } },
  );
  check(
    "Admin cannot use the company benchmark endpoint",
    adminBenchmarkResponse.status === 403,
    String(adminBenchmarkResponse.status),
  );

  const company = await login(env.TEST_CLIENT_EMAIL, env.TEST_CLIENT_PASSWORD);
  const { data: companyIdentity } = await company.auth.getUser();
  check(
    "Client JWT has company_user role",
    companyIdentity.user?.app_metadata?.role === "company_user",
    companyIdentity.user?.app_metadata?.role,
  );
  const visibleResult = await company.from("organizations").select("id,slug");
  check(
    "Client sees exactly its own company",
    !visibleResult.error && visibleResult.data.length === 1,
    visibleResult.error?.message || String(visibleResult.data?.length),
  );
  const other = organisationsResult.data.find((row) => row.id !== visibleResult.data[0].id);
  const leakResult = await company.from("organizations").select("id").eq("id", other.id);
  check(
    "Client cannot read another company",
    !leakResult.error && leakResult.data.length === 0,
    leakResult.error?.message || String(leakResult.data?.length),
  );
  const submissionsResult = await company
    .from("company_submissions")
    .select("id,status,survey_version_id")
    .eq("organization_id", visibleResult.data[0].id);
  check(
    "Client sees only its own retained reports",
    !submissionsResult.error &&
      submissionsResult.data.every((row) => row.survey_version_id === versionResult.data.id),
    submissionsResult.error?.message || String(submissionsResult.data?.length),
  );
  const hiddenTemplatesResult = await company.from("email_templates").select("template_key");
  check(
    "Client cannot read administrator email templates",
    Boolean(hiddenTemplatesResult.error) || hiddenTemplatesResult.data.length === 0,
    hiddenTemplatesResult.error?.message || String(hiddenTemplatesResult.data?.length),
  );
  const companySession = await company.auth.getSession();
  const benchmarkResponse = await fetch(
    `https://stica.webmaintain.tech/api/benchmark/questions?surveyVersionId=${versionResult.data.id}`,
    { headers: { Authorization: `Bearer ${companySession.data.session.access_token}` } },
  );
  const benchmarkBody = await benchmarkResponse.json();
  check(
    "Company benchmark endpoint accepts a company session",
    benchmarkResponse.ok && Array.isArray(benchmarkBody.questions),
    benchmarkBody.error || String(benchmarkResponse.status),
  );
  const otherSubmissionResult = await admin
    .from("company_submissions")
    .select("id,organization_id")
    .neq("organization_id", visibleResult.data[0].id)
    .eq("survey_version_id", versionResult.data.id)
    .limit(1)
    .single();
  check(
    "Admin can select a different seeded company report",
    !otherSubmissionResult.error,
    otherSubmissionResult.error?.message,
  );
  const leakAnswersResult = await company
    .from("answers")
    .select("id", { count: "exact", head: true })
    .eq("submission_id", otherSubmissionResult.data.id);
  check(
    "Client cannot read another company's survey answers",
    !leakAnswersResult.error && leakAnswersResult.count === 0,
    leakAnswersResult.error?.message || String(leakAnswersResult.count),
  );
  const forbidden = await company.rpc("create_survey_year", {
    new_reporting_year: 2027,
    survey_name: "Forbidden role smoke test",
    open_at: null,
    close_at: null,
    clone_from_survey_version_id: null,
  });
  check(
    "Client cannot execute admin survey RPC",
    forbidden.error?.code === "42501",
    forbidden.error ? "Access denied as expected" : "RPC unexpectedly succeeded",
  );

  await Promise.all([
    admin.auth.signOut({ scope: "local" }),
    company.auth.signOut({ scope: "local" }),
  ]);
  console.table(results);
  console.log(`Role smoke tests passed: ${results.length}/${results.length}`);
}

main().catch((error) => {
  console.table(results);
  console.error(error.message);
  process.exitCode = 1;
});

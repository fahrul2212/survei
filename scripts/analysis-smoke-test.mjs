import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { loadAnalysis } from "../worker/services/analysis/load.ts";
import { buildEvidence } from "../worker/services/analysis/evidence.ts";

const env = Object.fromEntries(
  readFileSync(".env.test.local", "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
);
const client = () =>
  createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
const admin = client(),
  company = client();
const requireData = (result) => {
  if (result.error) throw new Error(result.error.message);
  return result.data;
};
const adminLogin = requireData(
  await admin.auth.signInWithPassword({
    email: env.TEST_ADMIN_EMAIL,
    password: env.TEST_ADMIN_PASSWORD,
  }),
);
const companyLogin = requireData(
  await company.auth.signInWithPassword({
    email: env.TEST_CLIENT_EMAIL,
    password: env.TEST_CLIENT_PASSWORD,
  }),
);
try {
  const adminCaller = {
    platformAdmin: true,
    user: adminLogin.user,
    token: adminLogin.session.access_token,
  };
  const companyCaller = {
    platformAdmin: false,
    user: companyLogin.user,
    token: companyLogin.session.access_token,
  };
  const full = await loadAnalysis(admin, adminCaller, {});
  assert.ok(full.questions.length >= 92);
  assert.ok(full.answers.length >= 8 * 92);
  const one = await loadAnalysis(admin, adminCaller, {
    years: [2025],
    questionKeys: ["CTP25-006"],
    organizationIds: [full.submissions[0].organization_id],
  });
  assert.equal(one.answers.length, 1);
  const own = await loadAnalysis(admin, companyCaller, {
    years: [2025],
    questionKeys: ["CTP25-006"],
  });
  const ownEvidence = buildEvidence(own, 5);
  assert.ok(
    ownEvidence.evidence.every((row) => !row.organization || row.organization === "Your company"),
  );
  assert.ok(
    ownEvidence.charts.every((chart) =>
      chart.companies.every((row) => row.name === "Your company"),
    ),
  );
  await assert.rejects(
    loadAnalysis(admin, companyCaller, { organizationIds: [full.submissions[0].organization_id] }),
    /anonymous/,
  );
  console.log(
    JSON.stringify({
      passed: true,
      submittedReports: full.submissions.length,
      completeAnswerRows: full.answers.length,
      selectedAnswerRows: one.answers.length,
      companyCharts: ownEvidence.charts.length,
    }),
  );
} finally {
  await Promise.all([admin.auth.signOut(), company.auth.signOut()]);
}

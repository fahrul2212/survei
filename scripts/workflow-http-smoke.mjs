import assert from "node:assert/strict";
import { login, request, closeSessions } from "./analysis-live-support.mjs";

// Read account details and intentionally reject an outdated edit; never change a real account.
// Calculated synthetic comparisons do not call an AI provider or alter survey answers.
try {
  const admin = await login("TEST_ADMIN"), company = await login("TEST_CLIENT");
  const identity = await admin.client.auth.getUser();
  const id = identity.data.user.id;
  const directory = await request(admin.token, `/api/admin/accounts?id=${id}`);
  assert.equal(directory.status, 200);
  assert.equal(directory.data.users.length, 1);
  const before = directory.data.users[0];
  assert.match(before.revision, /^[a-f0-9]{32}$/);
  const stale = await request(admin.token, "/api/admin/accounts", {
    operation: "update", id, name: before.name, role: "platform_admin", disabled: false,
    expectedRevision: "0".repeat(32),
  });
  assert.equal(stale.status, 409);
  assert.equal(stale.data.code, "account_conflict");
  const after = await request(admin.token, `/api/admin/accounts?id=${id}`);
  assert.equal(after.data.users[0].revision, before.revision);
  assert.equal((await request(company.token, `/api/admin/accounts?id=${id}`)).status, 403);
  const scope = { years: [2024], surveyVersionIds: [], organizationIds: [], questionKeys: [], metricCodes: [], datasetMode: "synthetic", cohortMode: "available_each_year" };
  const key = crypto.randomUUID();
  const first = await request(admin.token, "/api/v2/analysis", scope, key);
  assert.equal(first.status, 200);
  const retried = await request(admin.token, "/api/v2/analysis", scope, key);
  assert.equal(retried.status, 200);
  assert.equal(first.data.id, retried.data.id);
  const conflict = await request(admin.token, "/api/v2/analysis", { ...scope, years: [2025] }, key);
  assert.equal(conflict.status, 409);
  assert.ok(conflict.elapsedMs < 10000, "Conflict response must not time out");
  console.log(JSON.stringify({ accountConflict: stale.status, accountUnchanged: true, companyAccess: "denied", analysisRetrySameRun: true, analysisConflict: conflict.status, conflictMs: conflict.elapsedMs, providerRequests: 0 }));
} finally { await closeSessions(); }

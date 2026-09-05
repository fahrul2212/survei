import assert from "node:assert/strict";
import { login, request, closeSessions } from "./analysis-live-support.mjs";

// Creates only uniquely named empty QA drafts, then removes those exact drafts.
// Never invites, disables, changes roles, or edits existing company reports.
const created = [];
let admin;
const requireData = ({ data, error }) => {
  if (error) throw new Error(error.message);
  return data;
};
try {
  admin = await login("TEST_ADMIN");
  const company = await login("TEST_CLIENT");
  const accounts = await request(admin.token, "/api/admin/accounts");
  assert.equal(accounts.status, 200);
  assert.ok(Array.isArray(accounts.data.users));
  assert.ok(accounts.data.users.every(u => !Object.hasOwn(u, "raw_app_meta_data")));
  assert.equal((await request(company.token, "/api/admin/accounts")).status, 403);
  assert.equal((await request(undefined, "/api/admin/accounts")).status, 401);
  const denied = await company.client.rpc("manage_survey", { target_id: 26, operation: "inspect" });
  assert.equal(denied.error?.code, "42501");
  const name = `[QA CRUD ${Date.now()}] Empty draft`;
  const draft = requireData(await admin.client.rpc("create_survey_year", {
    new_reporting_year: 2024, survey_name: name, open_at: null, close_at: null,
    clone_from_survey_version_id: null,
  }));
  created.push(Number(draft));
  const inspect = id => admin.client.rpc("manage_survey", { target_id: id, operation: "inspect" }).then(requireData);
  const before = await inspect(draft);
  assert.equal(before.canDelete, true);
  const input = { expectedUpdatedAt: before.survey.updated_at, name: `${name} renamed`, year: 2024, opensAt: null, closesAt: null };
  requireData(await admin.client.rpc("manage_survey", { target_id: draft, operation: "update", input }));
  assert.equal((await inspect(draft)).survey.name, input.name);
  const stale = await admin.client.rpc("manage_survey", { target_id: draft, operation: "update", input });
  assert.equal(stale.status, 409);
  assert.equal(stale.error?.code, "PT409");
  assert.match(stale.error.message, /Reopen this dialog/);
  const duplicate = requireData(await admin.client.rpc("create_survey_year", {
    new_reporting_year: 2024, survey_name: `${name} copy`, open_at: null, close_at: null,
    clone_from_survey_version_id: draft,
  }));
  created.push(Number(duplicate));
  assert.equal((await inspect(duplicate)).survey.status, "draft");
  console.log(JSON.stringify({ accountDirectory: "passed", companyAccess: "denied", anonymousAccess: "denied", surveyCreateReadUpdateClone: "passed", staleEdit: "rejected" }));
} finally {
  try {
    for (const id of created.reverse()) {
      const checked = requireData(await admin.client.rpc("manage_survey", { target_id: id, operation: "inspect" }));
      assert.ok(checked.canDelete && checked.survey.name.startsWith("[QA CRUD "));
      requireData(await admin.client.rpc("manage_survey", { target_id: id, operation: "delete", input: {
        expectedUpdatedAt: checked.survey.updated_at, confirmName: checked.survey.name,
      } }));
    }
    console.log(JSON.stringify({ temporaryDraftsDeleted: created.length }));
  } finally { await closeSessions(); }
}

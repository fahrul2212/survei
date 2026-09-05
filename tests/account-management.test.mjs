import { test } from "node:test";
import assert from "node:assert/strict";
import { accountInput } from "../shared/account-management.ts";
import { accountsRoute, internalCatalog } from "../worker/routes/accounts.ts";

const admin = {
  platformAdmin: true,
  user: { id: "10000000-0000-4000-8000-000000000001", app_metadata: { role: "platform_admin" } },
  token: "test-token",
};
const body = { name: "  QA analyst  ", email: "QA@example.test", role: "platform_analyst" };
const req = (value) =>
  new Request("https://portal.example/api/admin/accounts", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://portal.example" },
    body: JSON.stringify(value),
  });
test("internal invitations validate email, role and names without allowing company roles", () => {
  assert.deepEqual(accountInput(body, true), {
    name: "QA analyst",
    email: "qa@example.test",
    role: "platform_analyst",
    disabled: false,
  });
  for (const change of [
    { role: "company_admin" },
    { role: "superuser" },
    { email: "bad" },
    { name: " " },
  ])
    assert.throws(() => accountInput({ ...body, ...change }, true));
  assert.throws(() => accountInput({ ...body, disabled: "false" }));
});
test("company and analyst accounts cannot access account management", async () => {
  for (const role of ["company_user", "platform_analyst"]) {
    await assert.rejects(
      accountsRoute(
        new Request("https://portal.example/api/admin/accounts"),
        {},
        { ...admin, platformAdmin: false, user: { ...admin.user, app_metadata: { role } } },
      ),
      (e) => e.status === 403,
    );
  }
});
test("account update uses authenticated actor and rejects client-provided escalation metadata", async () => {
  let sent;
  const db = {
    rpc: async (name, args) => {
      sent = { name, args };
      return { data: { saved: true }, error: null };
    },
  };
  const target = "10000000-0000-4000-8000-000000000002";
  const response = await accountsRoute(
    req({
      ...body,
      operation: "update",
      id: target,
      disabled: false,
      actor: target,
      app_metadata: { role: "root" },
    }),
    db,
    admin,
  );
  assert.equal(response.status, 200);
  assert.equal(sent.args.actor, admin.user.id);
  assert.equal(sent.args.target, target);
  assert.equal(sent.args.input.app_metadata, undefined);
});
test("invalid invitation and cross-origin mutation stop before database or email", async () => {
  let called = false;
  const db = {
    rpc: () => {
      called = true;
      throw new Error("Unexpected call");
    },
  };
  await assert.rejects(
    accountsRoute(req({ ...body, operation: "invite", role: "owner" }), db, admin),
    (e) => e.status === 400,
  );
  const cross = req({ ...body, operation: "invite" });
  cross.headers.set("Origin", "https://other.example");
  await assert.rejects(accountsRoute(cross, db, admin), (e) => e.status === 403);
  assert.equal(called, false);
});
test("directory pagination and internal catalog deny invalid requests", async () => {
  await assert.rejects(
    accountsRoute(new Request("https://portal.example/api/admin/accounts?page=-1"), {}, admin),
    (e) => e.status === 400,
  );
  await assert.rejects(
    internalCatalog(
      new Request("https://portal.example/api/internal/catalog"),
      {},
      {
        ...admin,
        platformAdmin: false,
        user: { ...admin.user, app_metadata: { role: "company_user" } },
      },
    ),
    (e) => e.status === 403,
  );
});

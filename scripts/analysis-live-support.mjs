import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

export const origin = "https://stica.webmaintain.tech";
const env = Object.fromEntries(
  readFileSync(".env.test.local", "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
);
const sessions = [];

export async function login(prefix) {
  assert.ok(env[`${prefix}_EMAIL`] && env[`${prefix}_PASSWORD`], "Test login is missing");
  const client = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  sessions.push(client);
  const { data, error } = await client.auth.signInWithPassword({
    email: env[`${prefix}_EMAIL`],
    password: env[`${prefix}_PASSWORD`],
  });
  if (error) throw new Error(`Test authentication failed (${error.status ?? "unknown"})`);
  return { client, token: data.session.access_token };
}

export async function request(token, path, body, key) {
  const started = performance.now();
  const response = await fetch(`${origin}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      Origin: origin,
      "Content-Type": "application/json",
      ...(key ? { "Idempotency-Key": key } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(75000),
  });
  assert.ok(
    response.headers.get("content-type")?.includes("application/json"),
    "Expected API JSON",
  );
  return {
    status: response.status,
    data: await response.json(),
    elapsedMs: Math.round(performance.now() - started),
  };
}

export const closeSessions = () =>
  Promise.all(sessions.map((client) => client.auth.signOut({ scope: "local" })));

export function assertPackage(result) {
  assert.equal(result.schemaVersion, 2);
  assert.equal(result.dataset, "synthetic");
  const evidence = new Set(result.evidence.map((row) => row.id));
  const facts = new Map(result.facts.map((row) => [row.id, row]));
  for (const fact of result.facts) {
    assert.ok(fact.evidenceIds.length > 0);
    assert.ok(
      fact.evidenceIds.every((id) => evidence.has(id)),
      "Missing fact source",
    );
  }
  for (const chart of result.charts) {
    assert.ok(chart.domain[0] <= 0 && chart.domain[1] >= 0, "Chart must include zero");
    for (const row of chart.series) {
      assert.ok(
        row.evidenceIds.every((id) => evidence.has(id)),
        "Missing chart source",
      );
      if (row.factId) assert.equal(row.value, facts.get(row.factId)?.value);
    }
  }
}

import test from "node:test";
import assert from "node:assert/strict";
import { narrativeRoute } from "../worker/routes/analysis-narrative.ts";
import { analyze } from "../shared/analysis/pipeline.ts";
import { fixture, request, context } from "./fixtures/analysis-data.mjs";

const id = "20000000-0000-4000-8000-000000000001";
function harness() {
  const { packs, bindings } = fixture();
  const result = analyze(packs, bindings, request, { ...context, ownOrganizationId: 1 });
  const run = {
    id,
    state: "ready",
    result,
    narrative: null,
    narrativeState: "not_requested",
    invalidated: false,
    createdAt: context.now,
  };
  const events = [];
  const admin = {
    from(table) {
      const query = {
        select() {
          return query;
        },
        eq() {
          return query;
        },
        single: async () => ({
          data: {
            enabled: true,
            provider: "openai",
            default_model: "fixture",
            max_output_tokens: 2400,
          },
        }),
        maybeSingle: async () => ({
          data:
            table === "ai_model_prices"
              ? { input_price_per_million_usd: 1, output_price_per_million_usd: 2 }
              : null,
        }),
      };
      return query;
    },
    async rpc(name, args) {
      events.push({ name, args });
      if (name === "analysis_v2_narrative" && args.operation === "finish") {
        run.narrativeState = args.input.state;
        run.narrative = args.input.narrative ?? null;
      }
      return { data: run };
    },
  };
  const http = new Request(`https://example.test/api/v2/analysis/${id}/narrative`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question: "Explain the comparison." }),
  });
  return {
    result,
    run,
    events,
    execute: () =>
      narrativeRoute(http, { OPENAI_API_KEY: "test-key-never-sent" }, admin, {
        user: { id: "user" },
        platformAdmin: false,
      }),
  };
}
test("narrative route uses only sanitized facts and settles validated provider usage", async (t) => {
  const h = harness();
  let providerCalls = 0;
  t.mock.method(globalThis, "fetch", async (url, init) => {
    const body = JSON.parse(init.body);
    if (String(url).endsWith("/moderations"))
      return Response.json({ results: [{ flagged: false }] });
    providerCalls++;
    assert.ok(!body.input.includes("Private Company"));
    assert.equal(body.store, false);
    assert.ok(init.signal);
    return Response.json({
      output: [
        {
          content: [
            {
              type: "output_text",
              text: JSON.stringify({
                findings: [
                  {
                    text: "The group average increased.",
                    factIds: [h.result.facts[0].id],
                    evidenceIds: [],
                  },
                ],
                limitations: [],
              }),
            },
          ],
        },
      ],
      usage: { input_tokens: 100, output_tokens: 20 },
    });
  });
  const response = await h.execute(),
    body = await response.json();
  assert.equal(providerCalls, 1);
  assert.equal(body.narrativeState, "ready");
  assert.deepEqual(body.result, JSON.parse(JSON.stringify(h.result)));
  const settlement = h.events.find((e) => e.args.operation === "finish").args.input;
  assert.equal(settlement.actualCost, 0.00014);
});
test("invented references reject the explanation and preserve deterministic results", async (t) => {
  const h = harness();
  t.mock.method(globalThis, "fetch", async (url) =>
    String(url).endsWith("/moderations")
      ? Response.json({ results: [{ flagged: false }] })
      : Response.json({
          output: [
            {
              content: [
                {
                  type: "output_text",
                  text: JSON.stringify({
                    findings: [
                      { text: "Unsupported conclusion.", factIds: ["invented"], evidenceIds: [] },
                    ],
                    limitations: [],
                  }),
                },
              ],
            },
          ],
          usage: { input_tokens: 100, output_tokens: 20 },
        }),
  );
  const body = await (await h.execute()).json();
  assert.equal(body.narrativeState, "rejected");
  assert.equal(body.narrative, null);
  assert.deepEqual(body.result, JSON.parse(JSON.stringify(h.result)));
});
test("provider timeout keeps the reservation and never retries the provider", async (t) => {
  const h = harness();
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (url) => {
    if (String(url).endsWith("/moderations"))
      return Response.json({ results: [{ flagged: false }] });
    calls++;
    throw new DOMException("timed out", "TimeoutError");
  });
  await assert.rejects(h.execute(), (e) => e.code === "explanation_unavailable");
  assert.equal(calls, 1);
  assert.equal(h.run.narrativeState, "outcome_unknown");
  assert.equal(h.events.find((e) => e.args.operation === "finish").args.input.actualCost, null);
});

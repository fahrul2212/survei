import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ComparisonRequest,
  scopeFingerprint,
} from "../src/features/ai-control/analysis-v2/comparison-request.ts";
import { SaveQueue } from "../src/features/reporting/save-queue.ts";
import { gateway } from "../worker/services/analysis-v2/repository.ts";
const scope = {
  years: [2025, 2024],
  surveyVersionIds: [],
  organizationIds: [2, 1],
  questionKeys: [],
  metricCodes: [],
  datasetMode: "synthetic",
  cohortMode: "available_each_year",
};

test("comparison retries reuse their key and canonical body; a new completed request gets a new key", async () => {
  const calls = [];
  let fail = true;
  const request = new ComparisonRequest(async (input, key) => {
    calls.push({ input, key });
    if (fail) throw new Error("response lost");
    return { id: "run" };
  });
  await assert.rejects(request.execute(scope));
  fail = false;
  await request.execute({ ...scope, years: [2024, 2025] });
  assert.equal(calls[0].key, calls[1].key);
  assert.deepEqual(calls[0].input, calls[1].input);
  await request.execute(scope);
  assert.notEqual(calls[1].key, calls[2].key);
  assert.equal(scopeFingerprint(scope), scopeFingerprint({ ...scope, organizationIds: [1, 2, 1] }));
});

test("simultaneous comparison clicks dispatch one request", async () => {
  let calls = 0,
    finish;
  const request = new ComparisonRequest(() => {
    calls++;
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  const first = request.execute(scope),
    second = request.execute(scope);
  await Promise.resolve();
  assert.equal(calls, 1);
  finish({ id: "same-run" });
  assert.deepEqual(await Promise.all([first, second]), [{ id: "same-run" }, { id: "same-run" }]);
});

test("discarding one failed answer preserves failure state for other unsaved answers", async () => {
  const states = [];
  const queue = new SaveQueue(
    async () => {
      throw new Error("offline");
    },
    (state) => states.push(state),
  );
  queue.enqueue(1, "first");
  queue.enqueue(2, "second");
  assert.equal(await queue.flush(), false);
  queue.discard(1);
  assert.equal(states.at(-1), "failed");
  assert.equal(queue.unsaved, true);
  queue.discard(2);
  assert.equal(states.at(-1), "saved");
});

test("analysis application conflicts return 409 instead of generic validation errors", async () => {
  await assert.rejects(
    gateway(
      { rpc: async () => ({ error: { code: "PT409", message: "Idempotency conflict" } }) },
      "analysis_v2_run",
      {},
    ),
    (e) => e.status === 409,
  );
});

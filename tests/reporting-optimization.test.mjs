import { test } from "node:test";
import assert from "node:assert/strict";
import { reportingWindow } from "../shared/reporting-window.ts";
import { comparisonKey, sameAnswer } from "../shared/question-comparison.ts";
import { historicalPlan } from "../src/features/imports/historical-plan.ts";
import { questionTask } from "../src/features/reporting/question-task.ts";
import {
  hasPendingEdits,
  protectPendingEdits,
  portalFetch,
  SESSION_EXPIRED,
} from "../src/lib/session-recovery.ts";

test("reporting dates enforce the opening instant and exclusive deadline", () => {
  const version = {
    status: "published",
    opens_at: "2026-09-01T00:00:00Z",
    closes_at: "2026-09-05T00:00:00Z",
  };
  assert.equal(reportingWindow(version, Date.parse(version.opens_at) - 1), "scheduled");
  assert.equal(reportingWindow(version, Date.parse(version.opens_at)), "open");
  assert.equal(reportingWindow(version, Date.parse(version.closes_at)), "expired");
  assert.equal(
    reportingWindow({ ...version, status: "closed" }, Date.parse(version.opens_at)),
    "closed",
  );
  assert.equal(reportingWindow({ ...version, opens_at: null, closes_at: null }), "open");
});

test("year comparison detects schema and unit changes without object key order noise", () => {
  const question = { prompt: "Count", type: "number", options: [], validation: { unit: "people" } };
  assert.equal(comparisonKey(question), comparisonKey({ ...question }));
  assert.notEqual(
    comparisonKey(question),
    comparisonKey({ ...question, validation: { unit: "FTE" } }),
  );
  assert.notEqual(
    comparisonKey(question),
    comparisonKey({ ...question, prompt: "Full-time count" }),
  );
  assert.equal(sameAnswer({ a: 1, b: 2 }, { b: 2, a: 1 }), true);
  assert.equal(sameAnswer(0, null), false);
});

test("import preview distinguishes changes and rejects duplicate or published targets", () => {
  const base = {
    company_name: "Test",
    company_slug: "test",
    reporting_year: 2024,
    question_key: "CTP25-001",
    answer: { a: 1, b: 2 },
  };
  const existing = new Map([["test:2024:CTP25-001", { b: 2, a: 1 }]]);
  assert.equal(historicalPlan([base], existing)[0].status, "unchanged");
  assert.equal(historicalPlan([{ ...base, answer: 3 }], existing)[0].status, "changed");
  assert.equal(historicalPlan([{ ...base, reporting_year: 2025 }], existing)[0].status, "new");
  assert.equal(historicalPlan([base, base], existing)[1].status, "rejected");
  assert.equal(historicalPlan([base], existing, new Set([2024]))[0].status, "rejected");
  assert.equal(
    historicalPlan([{ ...base, submitted_at: "invalid" }], existing)[0].status,
    "rejected",
  );
});

test("question navigation differentiates invalid, missing and unreviewed answers", () => {
  const question = { prompt: "Count", type: "number", options: [], validation: { min: 0 } };
  assert.equal(questionTask(question, undefined), "unanswered");
  assert.equal(questionTask(question, "invalid"), "correction");
  assert.equal(questionTask(question, 0, "prefilled"), "review");
  assert.equal(questionTask(question, 0, "prefilled", true), "complete");
});

test("session recovery keeps pending drafts and does not confuse bad login with expiry", async () => {
  let unsaved = true;
  const release = protectPendingEdits(() => unsaved);
  assert.equal(hasPendingEdits(), true);
  unsaved = false;
  assert.equal(hasPendingEdits(), false);
  release();
  const originalFetch = globalThis.fetch,
    originalWindow = globalThis.window;
  const events = [];
  globalThis.window = { dispatchEvent: (event) => events.push(event.type) };
  globalThis.fetch = async () => new Response(null, { status: 401 });
  try {
    await portalFetch("https://example.invalid/rest/v1/answers");
    await portalFetch("https://example.invalid/auth/v1/token");
    assert.deepEqual(events, [SESSION_EXPIRED]);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.window = originalWindow;
  }
});

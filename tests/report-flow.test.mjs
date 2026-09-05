import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SaveQueue } from "../src/features/reporting/save-queue.ts";
import { monitoringSurvey } from "../src/features/reporting/survey-state.ts";
import { publishChecks } from "../src/components/admin/survey-builder/publish-checks.ts";
import { benchmarkMessage } from "../src/features/benchmarks/benchmark-message.ts";

test("monitoring keeps closed reports visible without selecting unpublished drafts", () => {
  const draft = { id: 3, status: "draft" };
  const closed = { id: 1, status: "closed" };
  const published = { id: 2, status: "published" };
  assert.equal(monitoringSurvey([draft, closed], null), closed);
  assert.equal(monitoringSurvey([draft, published, closed], null), published);
  assert.equal(monitoringSurvey([draft, published, closed], 1), closed);
  assert.equal(monitoringSurvey([draft], 3), undefined);
});

test("resolving one failed answer preserves other unsaved answers", async () => {
  const writes = [];
  let blocked = true;
  const queue = new SaveQueue(
    async (value) => {
      if (blocked) throw Error("conflict");
      writes.push(value);
    },
    () => {},
  );
  queue.enqueue(1, "conflicting answer");
  queue.enqueue(2, "another answer");
  assert.equal(await queue.flush(), false);
  queue.discard(1);
  assert.equal(queue.unsaved, true);
  blocked = false;
  assert.equal(await queue.retry(), true);
  assert.deepEqual(writes, ["another answer"]);
});

test("publish preflight accepts verified source and rejects missing choices or forward display rules", () => {
  const catalog = JSON.parse(
    readFileSync(new URL("../data/ctp25-catalog.json", import.meta.url), "utf8"),
  );
  const questions = catalog.questions.map((q) => ({ ...q, displayOrder: q.n }));
  const version = { opens_at: null, closes_at: null };
  assert.deepEqual(publishChecks(version, questions), []);
  assert.ok(publishChecks(version, []).length);
  const broken = {
    ...questions[0],
    type: "single_choice",
    options: [],
    visibilityRule: { questionKey: questions[1].stableKey, operator: "equals", value: "Yes" },
  };
  assert.ok(
    publishChecks(version, [broken, questions[1]]).some((error) =>
      error.includes("earlier question"),
    ),
  );
  assert.ok(publishChecks(version, [broken]).some((error) => error.includes("answer choices")));
});

test("benchmark explains absent own submission separately from privacy suppression", () => {
  assert.match(benchmarkMessage({ reason: "no_own_submission", threshold: 6 }), /Submit your/);
  assert.match(benchmarkMessage({ reason: "privacy_threshold", threshold: 6 }), /6 valid/);
  assert.match(
    benchmarkMessage({ reason: "no_comparable_answers", threshold: 6 }),
    /no numeric or choice/,
  );
});

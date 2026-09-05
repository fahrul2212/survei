import test from "node:test";
import assert from "node:assert/strict";
import {
  factPeriod,
  factUnit,
  findingReferences,
  formatValue,
  measureLabel,
  resultYears,
} from "../src/features/ai-control/analysis-v2/presentation.ts";
import { reportFixture } from "./fixtures/analysis-report.mjs";
import { validateNarrative } from "../shared/analysis/narrative.ts";

test("report evidence joins direct and fact references without exposing uncited answers", () => {
  const run = reportFixture();
  const references = findingReferences(run.narrative.findings[0], run.result);
  assert.equal(references.facts.length, 2);
  assert.equal(references.sources.length, 2);
  assert.ok(
    references.sources.every((source) => ["anonymous_group", "own_answer"].includes(source.scope)),
  );
  assert.deepEqual(
    findingReferences({ factIds: ["unknown"], evidenceIds: ["unknown"] }, run.result),
    { facts: [], sources: [] },
  );
  assert.ok(validateNarrative(run.narrative, run.result));
});

test("measurement labels distinguish own answers, percentages and changes", () => {
  const { result } = reportFixture(true);
  const own = result.facts.find((fact) => fact.operation === "value");
  const change = result.facts.find((fact) => fact.operation === "percent_change");
  assert.equal(measureLabel(own, result), "Your company");
  assert.equal(measureLabel(change, result), "Relative change in group average");
  assert.equal(factPeriod(change), "2024 → 2025");
  assert.equal(factPeriod(own), "2024");
  assert.equal(
    factUnit(result.facts.find((fact) => fact.operation === "difference" && fact.unit === "%")),
    "percentage points",
  );
  assert.equal(factUnit(change), "%");
});

test("report periods reflect available sources and do not imply continuous years", () => {
  assert.deepEqual(resultYears(reportFixture().result), [2024]);
  assert.deepEqual(resultYears(reportFixture(true).result), [2024, 2025]);
  assert.deepEqual(
    resultYears({ facts: [{ year: 2026, baselineYear: 2024 }], evidence: [] }),
    [2024, 2026],
  );
});

test("display keeps zero, negative values and small changes distinct and flags rounding", () => {
  assert.equal(formatValue("0"), "0");
  assert.equal(formatValue("-1500.25"), "-1,500.25");
  assert.equal(formatValue("0.00000012"), "0.00000012");
  assert.equal(formatValue("12.123456"), "≈ 12.1235");
  assert.equal(formatValue("999999999999999999.125"), "999999999999999999.125");
});

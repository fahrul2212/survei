import test from "node:test";
import assert from "node:assert/strict";
import { analyze } from "../shared/analysis/pipeline.ts";
import { decimal, add, serialize, mean, median } from "../shared/analysis/decimal.ts";
import { sourceSignature, decide } from "../shared/analysis/comparability.ts";
import { mappingProposal } from "../worker/services/analysis-v2/requests.ts";
import { validateNarrative } from "../shared/analysis/narrative.ts";

import { metric, request, context, fixture } from "./fixtures/analysis-data.mjs";
test("decimal arithmetic preserves fractions and zero without binary rounding", () => {
  assert.equal(serialize(add(decimal("0.1"), decimal("0.2"))), "0.3");
  assert.equal(serialize(mean([decimal("0"), decimal("1"), decimal("1")])), "0.666666666667");
  assert.equal(serialize(median([decimal("1"), decimal("10"), decimal("4"), decimal("8")])), "6");
  assert.equal(serialize(decimal("-0.0000000000001")), "0");
  for (const value of ["", true, "1,000", "1e999", Infinity, "NaN"])
    assert.equal(decimal(value), null);
});
test("approved metrics share an axis, exact facts and revision-specific evidence", () => {
  const { packs, bindings } = fixture(),
    result = analyze(packs, bindings, request, context);
  assert.equal(result.charts.length, 1);
  assert.deepEqual(result.charts[0].domain, [0, 85]);
  assert.equal(result.facts.find((f) => f.operation === "difference").value, "5");
  assert.equal(result.facts.find((f) => f.operation === "mean").value, "45");
  assert.equal(new Set(result.evidence.map((e) => e.id)).size, result.evidence.length);
});
test("question filters and dataset isolation cannot silently widen a scope", () => {
  const { packs, bindings } = fixture();
  assert.equal(
    analyze(packs, bindings, { ...request, datasetMode: "production" }, context).facts.length,
    0,
  );
  assert.equal(
    analyze(packs, bindings, { ...request, questionKeys: ["CTP25-001"] }, context).facts.length,
    0,
  );
});
test("schema changes, unknown metadata, split mappings and changed meanings fail closed", () => {
  const { packs, bindings } = fixture(),
    q = packs[0].questions[0];
  assert.equal(
    decide(metric.code, [bindings[0]], [{ ...q, prompt: "Contractors" }], [2024]).status,
    "needs_review",
  );
  assert.equal(
    decide(metric.code, [{ ...bindings[0], metric: { ...metric, scope: "unknown" } }], [q], [2024])
      .status,
    "needs_review",
  );
  assert.equal(
    decide(metric.code, [bindings[0], bindings[0]], [q, q], [2024, 2024]).status,
    "needs_review",
  );
  assert.equal(
    decide(metric.code, [{ ...bindings[0], relation: "incompatible" }], [q], [2024]).status,
    "not_comparable",
  );
});
test("company output excludes every peer identity and observation", () => {
  const { packs, bindings } = fixture(),
    result = analyze(packs, bindings, request, { ...context, ownOrganizationId: 1 });
  assert.equal(result.charts.length, 1);
  assert.equal(result.evidence.filter((e) => e.scope === "own_answer").length, 2);
  assert.ok(!JSON.stringify(result).includes("Private Company"));
  assert.ok(
    result.evidence.every((e) => e.scope === "own_answer" || e.scope === "anonymous_group"),
  );
});
test("small cohorts and cross-query membership differences are withheld", () => {
  let { packs, bindings } = fixture(5);
  assert.equal(
    analyze(packs, bindings, request, { ...context, ownOrganizationId: 1 }).facts.filter(
      (f) => f.operation === "mean",
    ).length,
    0,
  );
  ({ packs, bindings } = fixture());
  packs.find((p) => p.year === 2024 && p.organizationId === 8).questions[0].value = null;
  assert.equal(
    analyze(
      packs,
      bindings,
      { ...request, years: [2025] },
      { ...context, ownOrganizationId: 1 },
    ).facts.filter((f) => f.operation === "mean").length,
    0,
  );
});
test("missing and not-applicable values are not zeros; matched panels use a consistent denominator", () => {
  const { packs, bindings } = fixture();
  packs[0].questions[0].applicable = false;
  const result = analyze(packs, bindings, { ...request, cohortMode: "matched_panel" }, context);
  assert.ok(result.facts.filter((f) => f.operation === "mean").every((f) => f.responses === 7));
});
test("negative charts diverge and percentage change rejects zero baselines", () => {
  const { packs, bindings } = fixture(1);
  packs[0].questions[0].value = "0";
  packs[1].questions[0].value = "-2";
  const result = analyze(packs, bindings, request, context);
  assert.equal(result.charts[0].kind, "diverging_bar");
  assert.equal(result.facts.filter((f) => f.operation === "percent_change").length, 0);
});
test("approved scaling is exact and source bounds are enforced", () => {
  const { packs, bindings } = fixture(1);
  bindings[0].transform = { kind: "scale_decimal", factor: "0.001" };
  assert.equal(analyze(packs, bindings, request, context).facts[0].value, "0.01");
  packs[0].questions[0].validation = { min: 100 };
  bindings[0].signature = sourceSignature(packs[0].questions[0]);
  assert.equal(
    analyze(packs, bindings, request, context).facts.filter((f) => f.year === 2024).length,
    0,
  );
});
test("calendar-year contracts reject percentage change in proposal validation", () => {
  const { packs } = fixture();
  assert.throws(() =>
    mappingProposal(
      {
        metric: { ...metric, unit: "year" },
        dataset: "synthetic",
        relation: "identity",
        reason: "Reviewed definition",
        sources: [{ questionId: 2024, transform: { kind: "identity" } }],
      },
      [packs[0].questions[0]],
    ),
  );
});
test("provider text cannot add unknown references, numbers, markup or URLs", () => {
  const { packs, bindings } = fixture(),
    result = analyze(packs, bindings, request, context);
  const valid = {
    findings: [
      { text: "The group average increased.", factIds: [result.facts[0].id], evidenceIds: [] },
    ],
    limitations: [],
  };
  assert.ok(validateNarrative(valid, result));
  for (const text of ["It increased 15%.", "<script>alert()</script>", "See https://example.org"])
    assert.equal(
      validateNarrative({ ...valid, findings: [{ ...valid.findings[0], text }] }, result),
      null,
    );
  assert.equal(
    validateNarrative(
      { ...valid, findings: [{ ...valid.findings[0], factIds: ["invented"] }] },
      result,
    ),
    null,
  );
});

test("renumbered questions cannot bypass the fixed cohort check", () => {
  const { packs, bindings } = fixture();
  for (const p of packs.filter((p) => p.year === 2024)) p.questions[0].key = "OLD-006";
  packs[0].questions[0].value = null;
  const result = analyze(
    packs,
    bindings,
    { ...request, years: [2025], questionKeys: ["CTP25-006"] },
    { ...context, ownOrganizationId: 1 },
  );
  assert.equal(result.facts.filter((f) => f.operation === "mean").length, 0);
  assert.ok(result.charts[0].series.every((s) => s.role === "company"));
});
test("a changed schema in only one company snapshot blocks the metric", () => {
  const { packs, bindings } = fixture();
  packs[0].questions[0].prompt = "Employees and contractors";
  assert.equal(analyze(packs, bindings, request, context).facts.length, 0);
});
test("category mappings use respondents as denominator and suppress complementary small cells", () => {
  const { packs, bindings } = fixture();
  for (const p of packs) {
    p.questions[0].type = "multiple_choice";
    p.questions[0].options = ["A", "B"];
    p.questions[0].value = p.organizationId === 1 ? ["A", "B"] : ["A"];
  }
  for (const b of bindings) {
    b.metric = {
      ...metric,
      kind: "multiple_choice",
      unit: "category",
      operations: ["distribution"],
      options: ["Alpha", "Beta"],
    };
    b.signature = sourceSignature(packs.find((p) => p.year === b.questionId).questions[0]);
    b.transform = { kind: "map_category", categories: { A: "Alpha", B: "Beta" } };
  }
  const admin = analyze(packs, bindings, request, context);
  assert.equal(
    admin.facts.find((f) => f.operation === "share" && f.category === "Beta").value,
    "12.5",
  );
  assert.equal(admin.charts[0].unit, "%");
  assert.equal(admin.charts[0].multiSelect, true);
  const company = analyze(packs, bindings, request, { ...context, ownOrganizationId: 1 });
  assert.equal(company.facts.length, 0);
});
test("own qualitative evidence stays available without exposing peer text", () => {
  const { packs } = fixture();
  for (const p of packs) {
    p.benchmarkEligible = false;
    p.questions[0].type = "textarea";
    p.questions[0].value = `Private plan ${p.organizationId}`;
  }
  const result = analyze(packs, [], request, { ...context, ownOrganizationId: 1 });
  assert.equal(result.evidence.length, 2);
  assert.ok(result.evidence.every((e) => e.value === "Private plan 1"));
  assert.equal(result.decisions[0].status, "needs_review");
});
test("every chart point refers to a fact with identical value", () => {
  const { packs, bindings } = fixture(),
    result = analyze(packs, bindings, request, context);
  for (const chart of result.charts)
    for (const point of chart.series)
      assert.equal(result.facts.find((f) => f.id === point.factId)?.value, point.value);
});

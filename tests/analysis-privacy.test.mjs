import { test } from "node:test";
import assert from "node:assert/strict";
import { aggregate, numeric } from "../worker/services/analysis/aggregate.ts";
import { buildEvidence } from "../worker/services/analysis/evidence.ts";
import { evidencePayload, numberArray } from "../worker/services/analysis/filters.ts";

const rows = (values) => values.map((value, index) => ({ organizationId: index + 1, value }));

test("numeric averages exclude blanks, invalid values and duplicate organizations", () => {
  assert.equal(numeric(" "), null);
  assert.equal(aggregate({ type: "number", options: [] }, rows([1, "", "invalid", 2]), 3), null);
  const result = aggregate(
    { type: "number", options: [] },
    [...rows([0, 10, 20]), { organizationId: 3, value: 30 }],
    3,
  );
  assert.equal(result.responses, 3);
  assert.equal(result.average, 40 / 3);
});

test("anonymous distributions exclude arbitrary text and suppress small cells", () => {
  const metric = { type: "single_choice", options: ["Yes", "No"] };
  assert.equal(aggregate(metric, rows(["Yes", "Yes", "Yes", "No"]), 3), null);
  assert.equal(aggregate(metric, rows(["Yes", "Yes", "secret@company.com"]), 3), null);
  const result = aggregate(
    metric,
    rows(Array.from({ length: 6 }, () => ({ selection: "Yes", comment: "confidential" }))),
    3,
  );
  assert.deepEqual(result.distribution, { Yes: 6, No: 0 });
  assert.ok(!JSON.stringify(result).includes("confidential"));
});

test("company evidence contains only own detail and safe aggregates, separated by survey", () => {
  const data = {
    ownOrganizationId: 1,
    versions: [
      { id: 1, reporting_year: 2025, name: "Survey A" },
      { id: 2, reporting_year: 2025, name: "Survey B" },
    ],
    questions: [
      {
        id: 1,
        surveyVersionId: 1,
        key: "Q1",
        prompt: "Count",
        category: "Metrics",
        type: "number",
        options: [],
        validation: {},
      },
      {
        id: 2,
        surveyVersionId: 2,
        key: "Q1",
        prompt: "Count",
        category: "Metrics",
        type: "number",
        options: [],
        validation: {},
      },
    ],
    submissions: Array.from({ length: 6 }, (_, i) => ({
      id: i + 1,
      organization_id: i + 1,
      survey_version_id: 1,
      organization: { name: `Secret company ${i}` },
    })),
    answers: Array.from({ length: 6 }, (_, i) => ({
      submission_id: i + 1,
      survey_question_id: 1,
      value: i + 1,
    })),
  };
  const result = buildEvidence(data, 5);
  assert.equal(result.evidence.filter((row) => row.scope === "your_company").length, 1);
  assert.equal(result.charts[0].aggregate.average, 3.5);
  assert.equal(result.charts[0].companies.length, 1);
  assert.equal(result.charts.length, 1);
  assert.ok(!JSON.stringify(result).includes("Secret company"));
});

test("oversized filters and evidence fail explicitly instead of silently truncating", () => {
  assert.throws(() => evidencePayload("query", ["large data"], 5), /context limit/);
  assert.throws(() => numberArray([1, 2, 3], 2), /filters/);
  assert.throws(() => numberArray(["1"], 2), /integers/);
});

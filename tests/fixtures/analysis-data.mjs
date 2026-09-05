import { sourceSignature } from "../../shared/analysis/comparability.ts";
export const metric = {
  id: "metric-1",
  code: "workforce.headcount",
  name: "Employees",
  kind: "number",
  unit: "people",
  population: "employees",
  scope: "company",
  period: "year end",
  method: "headcount",
  operations: ["difference", "percent_change"],
  options: [],
};
export const request = {
  years: [],
  surveyVersionIds: [],
  organizationIds: [],
  questionKeys: [],
  metricCodes: [],
  datasetMode: "synthetic",
  cohortMode: "available_each_year",
};
export const context = { ownOrganizationId: null, minimum: 5, now: "2026-09-05T00:00:00Z" };
export function fixture(count = 8) {
  const packs = [2024, 2025].flatMap((year) =>
    Array.from({ length: count }, (_, i) => ({
      id: `${year}-${i}`,
      organizationId: i + 1,
      organization: `Private Company ${i + 1}`,
      submissionId: year * 10 + i,
      surveyId: year,
      year,
      dataset: "synthetic",
      surveyName: `Survey ${year}`,
      origin: "submitted",
      capturedAt: context.now,
      questions: [
        {
          id: year,
          revisionId: year,
          key: "CTP25-006",
          prompt: "Employees",
          type: "number",
          options: [],
          validation: {},
          visibility: {},
          applicable: true,
          value: String((i + 1) * 10 + (year - 2024) * 5),
        },
      ],
    })),
  );
  const bindings = [2024, 2025].map((year) => ({
    id: `binding-${year}`,
    releaseId: "release-1",
    metric,
    questionId: year,
    revisionId: year,
    field: "",
    signature: sourceSignature(packs.find((p) => p.year === year).questions[0]),
    dataset: "synthetic",
    relation: "equivalent",
    transform: { kind: "identity" },
  }));
  return { packs, bindings };
}

import { analyze } from "../../shared/analysis/pipeline.ts";
import { sourceSignature } from "../../shared/analysis/comparability.ts";
import { fixture, request, context, metric } from "./analysis-data.mjs";

// Presentation fixtures only: no real company records and no AI-provider request.
export function reportFixture(allYears = false) {
  const { packs } = fixture();
  const metrics = [
    {
      ...metric,
      id: "renewable",
      code: "energy.renewable",
      name: "Renewable electricity",
      unit: "%",
      method: "Share of purchased electricity",
      population: "purchased electricity",
    },
    {
      ...metric,
      id: "emissions",
      code: "emissions.scope12",
      name: "Scope 1 & 2 emissions",
      unit: "tCO₂e",
      method: "Location-based annual emissions",
      population: "operational emissions",
    },
    metric,
  ];
  for (const pack of packs) {
    const original = pack.questions[0];
    pack.questions = metrics.map((item, index) => ({
      ...original,
      id: pack.year * 10 + index,
      revisionId: pack.year * 10 + index,
      key: `CTP25-00${index + 4}`,
      prompt: item.name,
      value:
        index === 0
          ? String(20 + pack.organizationId * 6 + (pack.year - 2024) * 4)
          : index === 1
            ? String(1000 + pack.organizationId * 150 - (pack.year - 2024) * 100)
            : original.value,
    }));
  }
  const bindings = packs
    .filter((pack) => pack.organizationId === 1)
    .flatMap((pack) =>
      pack.questions.map((question, index) => ({
        id: `binding-${question.id}`,
        releaseId: "fixture-release",
        metric: metrics[index],
        questionId: question.id,
        revisionId: question.revisionId,
        field: "",
        signature: sourceSignature(question),
        dataset: "synthetic",
        relation: "equivalent",
        transform: { kind: "identity" },
      })),
    );
  const result = analyze(
    packs,
    bindings,
    { ...request, years: allYears ? [] : [2024] },
    { ...context, ownOrganizationId: 1 },
  );
  const observations = [
    "The company’s reported renewable electricity share is below the group average. This comparison describes electricity sourcing; it does not establish the reasons for the difference.",
    "Reported operational emissions are lower than the group average. Absolute emissions do not account for differences in company size or production volume, so they should not be treated as an efficiency ranking.",
    "The company’s reported workforce is smaller than the group average. Company size provides context for the emissions comparison, but it is not a substitute for a comparable production-based intensity measure.",
  ];
  const narrative = {
    findings: metrics.map((item, index) => ({
      text: observations[index],
      factIds: result.facts
        .filter(
          (fact) => fact.metricCode === item.code && ["value", "mean"].includes(fact.operation),
        )
        .map((fact) => fact.id),
      evidenceIds: [],
    })),
    limitations: [
      "The respondent group can differ between reporting periods. Changes in group averages do not necessarily represent changes within the same companies.",
      "These synthetic examples demonstrate the report layout. They do not describe real company performance.",
    ],
  };
  return {
    id: allYears ? "preview-multiple-years" : "preview-single-year",
    state: "ready",
    createdAt: context.now,
    result,
    narrative,
    narrativeState: "ready",
    invalidated: false,
  };
}

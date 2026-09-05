import type {
  AnalysisPackage,
  AnalysisRequest,
  Binding,
  ChartSpec,
  Decision,
  Evidence,
  Fact,
  SourcePack,
  Series,
} from "./contracts";
import { decide, sourceSignature } from "./comparability";
import { summarizeGroup, changes, type Observation, type Average } from "./statistics";
import { chartFor } from "./chart-policy";
import {
  validObservation,
  surveyGroups,
  matchedPanel,
  fixedPublication,
  boundObservations,
} from "./cohort";
import { ownMeasurements, qualitativeEvidence } from "./individual-evidence";
import { dataQuality } from "./data-quality";
type Context = { ownOrganizationId: number | null; minimum: number; now: string };
const usable = (d: Decision) => d.status === "comparable" || d.status === "adjusted";
/** Receives authorized immutable inputs; never returns peer observations to a company. */
export function analyze(
  packs: SourcePack[],
  bindings: Binding[],
  request: AnalysisRequest,
  context: Context,
): AnalysisPackage {
  const facts: Fact[] = [],
    charts: ChartSpec[] = [],
    decisions: Decision[] = [],
    evidence: Evidence[] = [];
  const warnings = new Set<string>();
  const quality: NonNullable<AnalysisPackage["dataQuality"]> = [];
  const source = packs.filter((p) => p.dataset === request.datasetMode);
  const wanted = bindings.filter(
    (b) =>
      b.dataset === request.datasetMode &&
      (!request.metricCodes.length || request.metricCodes.includes(b.metric.code)),
  );
  const codes = [...new Set(wanted.map((b) => b.metric.code))];
  const observations = boundObservations(source, wanted);
  const threshold = context.ownOrganizationId === null ? 1 : Math.max(5, context.minimum) + 1;
  let unavailable = 0;
  for (const code of codes) {
    const rules = wanted.filter((b) => b.metric.code === code),
      metric = rules[0].metric;
    const allRows: Observation[] = observations.get(code) ?? [];
    const rows = allRows.filter(
      (r) =>
        (!request.questionKeys.length || request.questionKeys.includes(r.question.key)) &&
        (!request.years.length || request.years.includes(r.pack.year)) &&
        (!request.surveyVersionIds.length || request.surveyVersionIds.includes(r.pack.surveyId)),
    );
    if (!rows.length) continue;
    const unique = [
      ...new Map(
        rows.map((row) => [`${row.pack.surveyId}:${row.question.id}:${row.binding.field}`, row]),
      ).values(),
    ];
    const decision = decide(
      code,
      unique.map((r) => r.binding),
      unique.map((r) => r.question),
      unique.map((r) => r.pack.year),
    );
    if (
      rows.some(
        (r) =>
          r.binding.revisionId !== r.question.revisionId ||
          r.binding.signature !== sourceSignature(r.question, r.binding.field),
      )
    ) {
      decision.status = "needs_review";
      decision.reasons.push("SOURCE_SCHEMA_CHANGED");
      decision.operations = [];
    }
    if (
      rows.some(
        (r) =>
          rules.filter((b) => b.questionId === r.question.id && b.field === r.binding.field)
            .length > 1,
      )
    ) {
      decision.status = "needs_review";
      decision.reasons.push("DUPLICATE_MAPPING");
      decision.operations = [];
    }
    decisions.push(decision);
    if (!usable(decision)) continue;
    const publishedRows =
      context.ownOrganizationId === null
        ? allRows
        : allRows.filter((r) => r.pack.benchmarkEligible !== false);
    const fixed = context.ownOrganizationId === null || fixedPublication(publishedRows);
    const groups = surveyGroups(
        rows.filter(
          (r) =>
            context.ownOrganizationId === null || (fixed && r.pack.benchmarkEligible !== false),
        ),
      ),
      panel = matchedPanel(groups);
    if (!fixed) {
      warnings.add(
        "A comparison is withheld because the contributing company group differs. An administrator must review its publication.",
      );
      unavailable++;
    }
    const series: Series[] = [],
      averages: Average[] = [];
    for (const initial of groups) {
      const group = initial.filter(
        (r) =>
          validObservation(r) &&
          (request.cohortMode !== "matched_panel" || panel.has(r.pack.organizationId)),
      );
      const count = new Set(group.map((r) => r.pack.organizationId)).size;
      if (context.ownOrganizationId === null) quality.push(dataQuality(initial, count));
      if (count !== group.length || count < threshold) {
        unavailable++;
        continue;
      }
      const summary = summarizeGroup(group, metric, decision, context.ownOrganizationId, threshold);
      if (!summary) {
        unavailable++;
        continue;
      }
      facts.push(...summary.facts);
      evidence.push(...summary.evidence);
      series.push(...summary.series);
      if (summary.average) averages.push(summary.average);
    }
    facts.push(
      ...changes(
        averages,
        groups.map((g) => g[0].pack.surveyId),
        decision,
        warnings,
      ),
    );
    ownMeasurements(rows, decision, context.ownOrganizationId, evidence, facts, series);
    const chart = chartFor(metric, series, decision);
    if (chart) charts.push(chart);
    else if (series.length) {
      unavailable++;
      warnings.add("A metric exceeds the supported chart range; inspect its source data.");
    }
  }
  const selectedSources = source.filter(
    (p) =>
      (!request.years.length || request.years.includes(p.year)) &&
      (!request.surveyVersionIds.length || request.surveyVersionIds.includes(p.surveyId)),
  );
  const unmapped = [
    ...new Map(
      selectedSources
        .flatMap((p) => p.questions)
        .filter(
          (q) =>
            (!request.questionKeys.length || request.questionKeys.includes(q.key)) &&
            !wanted.some((b) => b.questionId === q.id),
        )
        .map((q) => [q.key, q]),
    ).values(),
  ];
  evidence.push(...qualitativeEvidence(selectedSources, request, context.ownOrganizationId));
  if (!request.metricCodes.length)
    for (const q of unmapped)
      decisions.push({
        id: `unmapped:${q.key}`,
        metricCode: q.key,
        status: "needs_review",
        reasons: ["NO_APPROVED_MAPPING"],
        operations: [],
        ruleIds: [],
      });
  const needsReview = decisions.filter((d) => !usable(d)).length;
  if (source.some((p) => p.origin === "reconstructed"))
    warnings.add(
      "Historical sources were frozen from archived answers and current question metadata; original submission-time metadata may be incomplete.",
    );
  if (request.cohortMode === "available_each_year")
    warnings.add(
      "Group averages describe available respondents in each year, not necessarily progress by the same companies.",
    );
  if (unavailable)
    warnings.add(
      "Some results are unavailable or withheld under the data-quality and privacy policy.",
    );
  if (!source.length) warnings.add("No accepted reports match this dataset and scope.");
  if (quality.some((q) => q.missing || q.unknown || q.invalid))
    warnings.add(
      "Blank, unavailable and invalid answers are excluded from the reported denominators. Inspect data coverage for details.",
    );
  return {
    schemaVersion: 2,
    engineVersion: "2.0.0",
    dataset: request.datasetMode,
    createdAt: context.now,
    cohortMode: request.cohortMode,
    facts,
    charts,
    decisions,
    evidence,
    warnings: [...warnings],
    ...(context.ownOrganizationId === null ? { dataQuality: quality } : {}),
    coverage: {
      status: needsReview || unavailable ? "partial" : "complete",
      comparable: decisions.length - needsReview,
      needsReview,
      unavailable,
    },
  };
}

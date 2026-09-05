import type { AnalysisRequest, Decision, Evidence, Fact, Series, SourcePack } from "./contracts";
import type { Observation } from "./statistics";
import { numericValue, rawValue } from "./transforms";
import { serialize } from "./decimal";

/** Own observations remain available even when an anonymous comparison is withheld. */
export function ownMeasurements(
  rows: Observation[],
  decision: Decision,
  ownId: number | null,
  evidence: Evidence[],
  facts: Fact[],
  series: Series[],
) {
  if (ownId === null) return;
  for (const row of rows.filter(
    (r) => r.pack.organizationId === ownId && r.binding.metric.kind === "number",
  )) {
    const value = numericValue(row.question, row.binding);
    if (!value) continue;
    const id = `answer:${row.pack.id}:${row.question.id}:${row.binding.field}`;
    if (evidence.some((e) => e.id === id)) continue;
    const result = serialize(value),
      factId = `fact:own:${row.binding.metric.code}:${row.pack.surveyId}`;
    evidence.push({
      id,
      year: row.pack.year,
      surveyId: row.pack.surveyId,
      surveyName: row.pack.surveyName,
      questionId: row.question.id,
      revisionId: row.question.revisionId,
      questionKey: row.question.key,
      prompt: row.question.prompt,
      field: row.binding.field,
      scope: "own_answer",
      organization: "Your company",
      value: rawValue(row.question, row.binding.field),
    });
    facts.push({
      id: factId,
      metricCode: row.binding.metric.code,
      operation: "value",
      value: result,
      unit: row.binding.metric.unit,
      year: row.pack.year,
      responses: 1,
      evidenceIds: [id],
      decisionId: decision.id,
    });
    series.push({
      label: `${row.pack.year} · Your company`,
      year: row.pack.year,
      surveyId: row.pack.surveyId,
      factId,
      value: result,
      responses: 1,
      evidenceIds: [id],
      role: "company",
    });
  }
}

export function qualitativeEvidence(
  packs: SourcePack[],
  request: AnalysisRequest,
  ownId: number | null,
): Evidence[] {
  if (request.metricCodes.length) return [];
  return packs
    .filter((p) => ownId === null || p.organizationId === ownId)
    .flatMap((p) =>
      p.questions
        .filter(
          (q) =>
            q.applicable === true &&
            ["text", "textarea"].includes(q.type) &&
            typeof q.value === "string" &&
            q.value.trim() &&
            (!request.questionKeys.length || request.questionKeys.includes(q.key)) &&
            !/contact information|contact person|primary contact|secondary contact/i.test(q.prompt),
        )
        .map((q) => ({
          id: `text:${p.id}:${q.id}`,
          year: p.year,
          surveyId: p.surveyId,
          surveyName: p.surveyName,
          questionId: q.id,
          revisionId: q.revisionId,
          questionKey: q.key,
          prompt: q.prompt,
          field: "",
          scope: ownId === null ? ("company_answer" as const) : ("own_answer" as const),
          organization: ownId === null ? p.organization : "Your company",
          value: q.value,
          method: "Qualitative source only; no cross-year equivalence is asserted.",
        })),
    );
}

import type {
  Binding,
  Decision,
  Evidence,
  Fact,
  Metric,
  Series,
  SourcePack,
  SourceQuestion,
} from "./contracts";
import { choices, numericValue, rawValue } from "./transforms";
import {
  divide,
  fraction,
  mean,
  median,
  multiply,
  serialize,
  subtract,
  type Fraction,
} from "./decimal";

export type Observation = { pack: SourcePack; question: SourceQuestion; binding: Binding };
export type Average = { surveyId: number; year: number; value: Fraction; fact: Fact };
export type GroupStatistics = {
  facts: Fact[];
  evidence: Evidence[];
  series: Series[];
  average?: Average;
};

/** The denominator is the validated respondent group, never the number of selected options. */
export function summarizeGroup(
  group: Observation[],
  metric: Metric,
  decision: Decision,
  ownId: number | null,
  threshold: number,
): GroupStatistics | null {
  const first = group[0],
    count = group.length,
    year = first.pack.year,
    prefix = `${metric.code}:${first.pack.surveyId}`;
  const reference: Evidence = {
    id: `aggregate:${prefix}`,
    year,
    surveyId: first.pack.surveyId,
    surveyName: first.pack.surveyName,
    questionId: first.question.id,
    revisionId: first.question.revisionId,
    questionKey: first.question.key,
    prompt: first.question.prompt,
    field: first.binding.field,
    scope: ownId === null ? "selected_group" : "anonymous_group",
    method: metric.method,
    responses: count,
  };
  const result: GroupStatistics = { facts: [], evidence: [reference], series: [] };
  const fact = (
    operation: Fact["operation"],
    value: Fraction,
    unit = metric.unit,
    category?: string,
  ): Fact => ({
    id: `fact:${prefix}:${operation}:${category ?? ""}`,
    metricCode: metric.code,
    operation,
    value: serialize(value),
    exact: { numerator: value.n.toString(), denominator: value.d.toString() },
    unit,
    year,
    responses: count,
    evidenceIds: [reference.id],
    decisionId: decision.id,
    ...(category ? { category } : {}),
  });
  if (metric.kind === "number") {
    const values = group.map((r) => numericValue(r.question, r.binding)!);
    const average = mean(values),
      averageFact = fact("mean", average);
    result.facts.push(averageFact, fact("median", median(values)));
    result.average = { surveyId: first.pack.surveyId, year, value: average, fact: averageFact };
    result.series.push({
      label: `${year} · Group average`,
      year,
      surveyId: first.pack.surveyId,
      factId: averageFact.id,
      value: averageFact.value,
      responses: count,
      evidenceIds: [reference.id],
      role: "average",
    });
  } else {
    const selections = group.map((r) => choices(r.question, r.binding));
    const distribution = metric.options.map((option) => ({
      option,
      count: selections.filter((s) => s.includes(option)).length,
    }));
    if (
      ownId !== null &&
      distribution.some(
        (v) =>
          (v.count > 0 && v.count < threshold) ||
          (count - v.count > 0 && count - v.count < threshold),
      )
    )
      return null;
    for (const item of distribution) {
      const share = fact(
        "share",
        fraction(BigInt(item.count * 100), BigInt(count)),
        "%",
        item.option,
      );
      result.facts.push(
        share,
        fact("count", fraction(BigInt(item.count)), "respondents", item.option),
      );
      result.series.push({
        label: `${year} · ${item.option}`,
        year,
        surveyId: first.pack.surveyId,
        factId: share.id,
        value: share.value,
        responses: count,
        evidenceIds: [reference.id],
        role: "category",
      });
    }
  }
  for (const row of group) {
    if (ownId !== null && row.pack.organizationId !== ownId) continue;
    const id = `answer:${row.pack.id}:${row.question.id}:${row.binding.field}`;
    const value =
      metric.kind === "number"
        ? serialize(numericValue(row.question, row.binding)!)
        : choices(row.question, row.binding);
    const organization = ownId === null ? row.pack.organization : "Your company";
    result.evidence.push({
      ...reference,
      id,
      scope: ownId === null ? "company_answer" : "own_answer",
      organization,
      value: rawValue(row.question, row.binding.field),
      responses: undefined,
    });
    if (metric.kind === "number") {
      const observation = fact("value", numericValue(row.question, row.binding)!);
      observation.id = `fact:${id}`;
      observation.responses = 1;
      observation.evidenceIds = [id];
      result.facts.push(observation);
      result.series.push({
        label: `${year} · ${organization}`,
        year,
        surveyId: row.pack.surveyId,
        factId: observation.id,
        value: String(value),
        responses: 1,
        evidenceIds: [id],
        role: "company",
      });
    }
  }
  return result;
}

export function changes(
  averages: Average[],
  surveyIds: number[],
  decision: Decision,
  warnings: Set<string>,
): Fact[] {
  const facts: Fact[] = [];
  for (let i = 1; i < averages.length; i++) {
    const current = averages[i],
      previous = averages[i - 1];
    if (surveyIds.indexOf(current.surveyId) - surveyIds.indexOf(previous.surveyId) !== 1) continue;
    const change = subtract(current.value, previous.value);
    for (const operation of decision.operations.filter((op) => op !== "distribution")) {
      if (operation === "percent_change" && previous.value.n <= 0n) {
        warnings.add("Percentage change is unavailable for a zero or negative baseline.");
        continue;
      }
      const value =
        operation === "difference"
          ? change
          : multiply(divide(change, previous.value), fraction(100n));
      facts.push({
        ...current.fact,
        id: `fact:${decision.metricCode}:${current.surveyId}:${operation}`,
        operation,
        value: serialize(value),
        exact: { numerator: value.n.toString(), denominator: value.d.toString() },
        unit: operation === "percent_change" ? "%" : current.fact.unit,
        baselineYear: previous.year,
        evidenceIds: [...previous.fact.evidenceIds, ...current.fact.evidenceIds],
      });
    }
  }
  return facts;
}

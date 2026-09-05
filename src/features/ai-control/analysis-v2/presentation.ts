import type { AnalysisPackage, Fact, Narrative } from "../../../../shared/analysis/contracts";

const measures: Record<Fact["operation"], string> = {
  value: "Reported value",
  mean: "Group average",
  median: "Group median",
  count: "Respondents selecting this answer",
  share: "Share of respondents",
  difference: "Change in group average",
  percent_change: "Relative change in group average",
};

export function formatValue(value: string): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  if (Math.abs(n) > Number.MAX_SAFE_INTEGER) return value;
  // Never turn a small non-zero result into zero. The original remains in the value tooltip.
  const formatted = new Intl.NumberFormat("en-GB", {
    ...(n !== 0 && Math.abs(n) < 0.0001
      ? { maximumSignificantDigits: 4 }
      : { maximumFractionDigits: 4 }),
  }).format(n);
  return `${Number(formatted.replaceAll(",", "")) !== n ? "≈ " : ""}${formatted}`;
}

export function metricTitle(result: AnalysisPackage, code: string): string {
  return (
    result.charts.find((chart) => chart.metricCode === code)?.title ?? code.replaceAll(/[._]/g, " ")
  );
}

export function measureLabel(fact: Fact, result: AnalysisPackage): string {
  const organization =
    fact.operation === "value"
      ? result.evidence.find((source) => fact.evidenceIds.includes(source.id))?.organization
      : undefined;
  return [organization ?? measures[fact.operation], fact.category].filter(Boolean).join(" · ");
}

export function factPeriod(fact: Fact): string {
  return fact.baselineYear === undefined
    ? String(fact.year)
    : `${fact.baselineYear} → ${fact.year}`;
}

export function factUnit(fact: Fact): string {
  return fact.operation === "difference" && fact.unit === "%" ? "percentage points" : fact.unit;
}

export function findingReferences(finding: Narrative["findings"][number], result: AnalysisPackage) {
  const facts = result.facts.filter((fact) => finding.factIds.includes(fact.id));
  const ids = new Set([...finding.evidenceIds, ...facts.flatMap((fact) => fact.evidenceIds)]);
  return { facts, sources: result.evidence.filter((source) => ids.has(source.id)) };
}

export function resultYears(result: AnalysisPackage): number[] {
  return [
    ...new Set([
      ...result.evidence.map((source) => source.year),
      ...result.facts.flatMap((fact) => [
        fact.year,
        ...(fact.baselineYear === undefined ? [] : [fact.baselineYear]),
      ]),
    ]),
  ].sort((a, b) => a - b);
}

export const explanationStates: Record<string, { title: string; description: string }> = {
  generating: {
    title: "Interpretation is being prepared",
    description:
      "Check its status to retrieve the result. Calculated measurements remain available.",
  },
  pending: {
    title: "Interpretation is being prepared",
    description:
      "Check its status to retrieve the result. Calculated measurements remain available.",
  },
  rejected: {
    title: "Interpretation did not pass validation",
    description:
      "Its references could not be verified. Use the calculated measurements and original sources for this analysis.",
  },
  outcome_unknown: {
    title: "Interpretation could not be retrieved",
    description:
      "The request may have reached the provider. It will not be sent again automatically. Your calculated measurements are still available.",
  },
};

import type { ChartSpec, Decision, Metric, Series } from "./contracts";
export function chartFor(metric: Metric, series: Series[], decision: Decision): ChartSpec | null {
  if (!series.length) return null;
  const values = series.map((s) => Number(s.value));
  if (values.some((v) => !Number.isFinite(v) || Math.abs(v) > 1e15)) return null;
  const domain: [number, number] =
    metric.kind === "number" ? [Math.min(0, ...values), Math.max(1, ...values)] : [0, 100];
  return {
    id: `chart:${metric.code}`,
    metricCode: metric.code,
    title: metric.name,
    unit: metric.kind === "number" ? metric.unit : "%",
    kind:
      metric.kind !== "number" ? "distribution" : domain[0] < 0 ? "diverging_bar" : "grouped_bar",
    domain,
    series,
    decisionId: decision.id,
    multiSelect: metric.kind === "multiple_choice",
  };
}

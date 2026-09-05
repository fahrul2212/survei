export type Metric = { type: string; options: string[] };
export type Observation = { organizationId: number; value: unknown };
export type Aggregate = {
  responses: number;
  average?: number;
  median?: number;
  distribution?: Record<string, number>;
};

export function primary(value: unknown): unknown {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>).selection
    : value;
}

export function numeric(value: unknown): number | null {
  if (typeof value !== "number" && (typeof value !== "string" || !value.trim())) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function categories(value: unknown, options: string[]): string[] {
  const selected = primary(value);
  const values = Array.isArray(selected) ? selected : [selected];
  return [
    ...new Set(
      values.filter((item): item is string => typeof item === "string" && options.includes(item)),
    ),
  ];
}

/** One observation per company. Unknown/free-text choices never enter a cohort. */
export function aggregate(metric: Metric, rows: Observation[], minimum: number): Aggregate | null {
  const unique = [...new Map(rows.map((row) => [row.organizationId, row])).values()];
  const threshold = minimum === 1 ? 1 : Math.max(3, minimum);
  if (metric.type === "number") {
    const values = unique
      .map((row) => numeric(row.value))
      .filter((v): v is number => v !== null)
      .sort((a, b) => a - b);
    if (values.length < threshold) return null;
    const middle = Math.floor(values.length / 2);
    return {
      responses: values.length,
      average: values.reduce((sum, value) => sum + value, 0) / values.length,
      median: values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2,
    };
  }
  if (!["yes_no", "single_choice", "multiple_choice"].includes(metric.type)) return null;
  const options = metric.type === "yes_no" ? ["Yes", "No"] : metric.options;
  const selections = unique
    .map((row) => categories(row.value, options))
    .filter((value) => value.length);
  if (selections.length < threshold) return null;
  const distribution = Object.fromEntries(
    options.map((option) => [option, selections.filter((value) => value.includes(option)).length]),
  );
  // Suppress the entire distribution when a small positive or complementary cell
  // could identify respondents. Hiding just one cell permits subtraction attacks.
  if (
    minimum > 1 &&
    Object.values(distribution).some(
      (count) =>
        (count > 0 && count < threshold) ||
        (selections.length - count > 0 && selections.length - count < threshold),
    )
  )
    return null;
  return { responses: selections.length, distribution };
}

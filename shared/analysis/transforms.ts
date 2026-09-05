import type { Binding, SourceQuestion } from "./contracts";
import { compare, decimal, multiply, type Fraction } from "./decimal";
export function rawValue(q: SourceQuestion, field: string): unknown {
  if (!field) return q.value;
  return q.value && typeof q.value === "object" && !Array.isArray(q.value)
    ? (q.value as Record<string, unknown>)[field]
    : undefined;
}
export function numericValue(q: SourceQuestion, b: Binding): Fraction | null {
  if (q.applicable !== true) return null;
  const value = decimal(rawValue(q, b.field));
  if (!value) return null;
  const fields = Array.isArray(q.validation.fields) ? q.validation.fields : [];
  const validation = (
    b.field
      ? fields.find((f) => f && typeof f === "object" && (f as { key?: unknown }).key === b.field)
      : q.validation
  ) as Record<string, unknown> | undefined;
  const min = decimal(validation?.min),
    max = decimal(validation?.max);
  if ((min && compare(value, min) < 0) || (max && compare(value, max) > 0)) return null;
  if (b.transform.kind === "identity") return value;
  if (b.transform.kind !== "scale_decimal") return null;
  const factor = decimal(b.transform.factor);
  return factor && factor.n > 0n ? multiply(value, factor) : null;
}
export function choices(q: SourceQuestion, b: Binding): string[] {
  if (q.applicable !== true) return [];
  let value = rawValue(q, b.field);
  if (value && typeof value === "object" && !Array.isArray(value))
    value = (value as Record<string, unknown>).selection;
  const values = Array.isArray(value) ? value : [value];
  if (b.metric.kind === "single_choice" && values.length !== 1) return [];
  const mapped = values.map((v) =>
    typeof v === "string"
      ? b.transform.kind === "map_category"
        ? b.transform.categories?.[v]
        : v
      : undefined,
  );
  if (mapped.some((v) => !v || !b.metric.options.includes(v))) return [];
  return [...new Set(mapped as string[])];
}

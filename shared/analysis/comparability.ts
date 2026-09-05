import type { Binding, Decision, SourceQuestion } from "./contracts";
function ordered(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(ordered);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, ordered(v)]),
    );
  return value;
}
/** A field binding isolates unrelated sibling-field changes, but retains question context. */
export function sourceSignature(q: SourceQuestion, field = "") {
  const fields = Array.isArray(q.validation.fields) ? q.validation.fields : [];
  const selected = field
    ? fields.find((v) => v && typeof v === "object" && (v as { key?: unknown }).key === field)
    : null;
  return JSON.stringify(
    ordered({
      prompt: q.prompt.trim(),
      type: q.type,
      options: field ? [] : [...q.options].sort(),
      validation: field ? selected : q.validation,
      visibility: q.visibility,
    }),
  );
}
export function decide(
  code: string,
  bindings: Binding[],
  questions: SourceQuestion[],
  years: number[],
): Decision {
  const reasons: string[] = [];
  let status: Decision["status"] = "comparable";
  if (!bindings.length || bindings.length !== questions.length) reasons.push("NO_APPROVED_MAPPING");
  const metric = bindings[0]?.metric;
  if (
    metric &&
    [metric.unit, metric.scope, metric.period, metric.method, metric.population].some(
      (v) => !v.trim() || v === "unknown",
    )
  )
    reasons.push("METADATA_UNKNOWN");
  if (bindings.some((b) => b.metric.id !== metric?.id)) reasons.push("METRIC_REVISION_CHANGED");
  if (
    bindings.some(
      (b, i) =>
        !questions[i] ||
        b.revisionId !== questions[i].revisionId ||
        b.signature !== sourceSignature(questions[i], b.field),
    )
  )
    reasons.push("SOURCE_SCHEMA_CHANGED");
  if (bindings.some((b) => b.relation === "partial")) reasons.push("PARTIAL_MAPPING");
  if (new Set(years).size !== years.length) reasons.push("DUPLICATE_PERIOD");
  if (bindings.some((b) => b.relation === "incompatible")) {
    reasons.push("MEANING_CHANGED");
    status = "not_comparable";
  } else if (reasons.length) status = "needs_review";
  else if (bindings.some((b) => b.transform.kind !== "identity")) status = "adjusted";
  return {
    id: `decision:${code}`,
    metricCode: code,
    status,
    reasons,
    operations: status === "comparable" || status === "adjusted" ? (metric?.operations ?? []) : [],
    ruleIds: bindings.map((b) => b.id),
  };
}

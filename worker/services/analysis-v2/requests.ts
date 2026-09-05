import { ApiError } from "../../lib/http";
import { numberArray, stringArray } from "../analysis/filters";
import type {
  AnalysisRequest,
  Binding,
  Metric,
  SourceQuestion,
} from "../../../shared/analysis/contracts";
import { sourceSignature } from "../../../shared/analysis/comparability";
import { decimal } from "../../../shared/analysis/decimal";

export function analysisRequest(body: Record<string, unknown>): AnalysisRequest {
  if (body.includeNarrative === true)
    throw new ApiError(
      400,
      "Create a data analysis first, then request its explanation.",
      "analysis_first",
    );
  const datasetMode = body.datasetMode ?? "production",
    cohortMode = body.cohortMode ?? "available_each_year";
  if (
    !["production", "synthetic"].includes(String(datasetMode)) ||
    !["available_each_year", "matched_panel"].includes(String(cohortMode))
  )
    throw new ApiError(400, "Invalid analysis mode", "invalid_scope");
  return {
    years: numberArray(body.years, 20).sort(),
    surveyVersionIds: numberArray(body.surveyVersionIds, 30).sort(),
    organizationIds: numberArray(body.organizationIds, 200).sort(),
    questionKeys: stringArray(body.questionKeys, 200, 100).sort(),
    metricCodes: stringArray(body.metricCodes, 100, 100).sort(),
    datasetMode: datasetMode as AnalysisRequest["datasetMode"],
    cohortMode: cohortMode as AnalysisRequest["cohortMode"],
  };
}
export type MappingProposal = {
  metric: Omit<Metric, "id">;
  dataset: "production" | "synthetic";
  relation: Binding["relation"];
  reason: string;
  sources: Array<{
    questionId: number;
    revisionId: number;
    field: string;
    signature: string;
    transform: Binding["transform"];
  }>;
};
const fail = () =>
  new ApiError(
    400,
    "Provide a complete metric contract and valid source transformations.",
    "invalid_mapping",
  );
function label(v: unknown): string {
  if (typeof v !== "string" || !v.trim() || v.length > 500) throw fail();
  return v.trim();
}
export function mappingProposal(
  body: Record<string, unknown>,
  catalog: SourceQuestion[],
): MappingProposal {
  const m = body.metric as Record<string, unknown>;
  if (
    !m ||
    typeof m !== "object" ||
    !Array.isArray(body.sources) ||
    !body.sources.length ||
    body.sources.length > 100
  )
    throw fail();
  const kind = String(m.kind),
    dataset = String(body.dataset),
    relation = String(body.relation);
  if (
    !["number", "single_choice", "multiple_choice"].includes(kind) ||
    !["production", "synthetic"].includes(dataset) ||
    !["identity", "equivalent", "convertible", "partial", "incompatible"].includes(relation)
  )
    throw fail();
  const code = label(m.code);
  if (!/^[a-z][a-z0-9_.-]{2,99}$/.test(code)) throw fail();
  const operations = stringArray(m.operations, 3);
  if (operations.some((op) => !["difference", "percent_change", "distribution"].includes(op)))
    throw fail();
  const options = stringArray(m.options, 100);
  if (kind !== "number" && (!options.length || operations.some((op) => op !== "distribution")))
    throw fail();
  if (kind === "number" && operations.includes("distribution")) throw fail();
  const unit = label(m.unit);
  if (/year|calendar/i.test(unit) && operations.includes("percent_change")) throw fail();
  const metric: Omit<Metric, "id"> = {
    code,
    name: label(m.name),
    kind: kind as Metric["kind"],
    unit,
    population: label(m.population),
    scope: label(m.scope),
    period: label(m.period),
    method: label(m.method),
    operations: operations as Metric["operations"],
    options,
  };
  const seen = new Set<string>();
  const sources = body.sources.map((item) => {
    if (!item || typeof item !== "object") throw fail();
    const s = item as Record<string, unknown>;
    const q = catalog.find((q) => q.id === s.questionId);
    if (!q) throw fail();
    const field = typeof s.field === "string" ? s.field : "";
    if (field && !Array.isArray(q.validation.fields)) throw fail();
    const fields = Array.isArray(q.validation.fields) ? q.validation.fields : [];
    const sub = fields.find(
      (f: unknown) => f && typeof f === "object" && (f as { key?: unknown }).key === field,
    ) as { type?: string; options?: string[] } | undefined;
    if (field && !sub) throw fail();
    const sourceType = sub?.type ?? q.type;
    if ((kind === "multiple_choice") !== (sourceType === "multiple_choice") && kind !== "number")
      throw fail();
    if (kind === "number" && sourceType !== "number") throw fail();
    if (
      kind !== "number" &&
      !["select", "yes_no", "single_choice", "multiple_choice"].includes(sourceType)
    )
      throw fail();
    const t = s.transform as Binding["transform"];
    if (!t || !["identity", "scale_decimal", "map_category"].includes(t.kind)) throw fail();
    let transform: Binding["transform"] = { kind: t.kind };
    if (t.kind === "scale_decimal") {
      const f = decimal(t.factor);
      if (kind !== "number" || !f || f.n <= 0n || Math.abs(Number(t.factor)) > 1e12) throw fail();
      transform.factor = t.factor;
    }
    if (t.kind === "map_category") {
      if (
        kind === "number" ||
        !t.categories ||
        typeof t.categories !== "object" ||
        Array.isArray(t.categories)
      )
        throw fail();
      const original = sourceType === "yes_no" ? ["Yes", "No"] : (sub?.options ?? q.options);
      if (
        original.some(
          (o) => !Object.hasOwn(t.categories!, o) || !options.includes(t.categories![o]),
        ) ||
        Object.keys(t.categories).some((o) => !original.includes(o))
      )
        throw fail();
      transform.categories = Object.fromEntries(original.map((o) => [o, t.categories![o]]));
    }
    if (kind !== "number" && t.kind === "identity") {
      const original = sourceType === "yes_no" ? ["Yes", "No"] : (sub?.options ?? q.options);
      if (original.length !== options.length || original.some((o) => !options.includes(o)))
        throw fail();
    }
    const key = `${q.id}:${field}`;
    if (seen.has(key)) throw fail();
    seen.add(key);
    return {
      questionId: q.id,
      revisionId: q.revisionId,
      field,
      signature: sourceSignature(q, field),
      transform,
    };
  });
  return {
    metric,
    dataset: dataset as MappingProposal["dataset"],
    relation: relation as Binding["relation"],
    reason: label(body.reason),
    sources,
  };
}

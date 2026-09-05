import type { AnalysisPackage, Narrative } from "./contracts";

export const NARRATIVE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    findings: {
      type: "array",
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          text: { type: "string" },
          factIds: { type: "array", items: { type: "string" } },
          evidenceIds: { type: "array", items: { type: "string" } },
        },
        required: ["text", "factIds", "evidenceIds"],
      },
    },
    limitations: { type: "array", maxItems: 5, items: { type: "string" } },
  },
  required: ["findings", "limitations"],
} as const;

/** Unknown references reject the whole explanation; facts remain independently available. */
export function validateNarrative(value: unknown, result: AnalysisPackage): Narrative | null {
  if (!value || typeof value !== "object") return null;
  const n = value as Narrative;
  if (
    !Array.isArray(n.findings) ||
    n.findings.length > 6 ||
    !Array.isArray(n.limitations) ||
    n.limitations.length > 5
  )
    return null;
  const facts = new Set(result.facts.map((f) => f.id)),
    evidence = new Set(result.evidence.map((e) => e.id));
  const prose = (s: unknown) =>
    typeof s === "string" && s.length > 0 && s.length <= 1200 && !/[\d<>]|https?:\/\//u.test(s);
  if (n.limitations.some((s) => !prose(s))) return null;
  for (const finding of n.findings) {
    if (
      !finding ||
      !prose(finding.text) ||
      !Array.isArray(finding.factIds) ||
      !Array.isArray(finding.evidenceIds) ||
      finding.factIds.length + finding.evidenceIds.length === 0 ||
      finding.factIds.length > 12 ||
      finding.evidenceIds.length > 12 ||
      finding.factIds.some((id) => !facts.has(id)) ||
      finding.evidenceIds.some((id) => !evidence.has(id))
    )
      return null;
  }
  return n;
}

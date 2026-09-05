import type { Observation } from "./statistics";
import type { Binding, SourcePack } from "./contracts";
export function boundObservations(
  packs: SourcePack[],
  bindings: Binding[],
): Map<string, Observation[]> {
  const byQuestion = new Map<number, Binding[]>(),
    byMetric = new Map<string, Observation[]>();
  for (const binding of bindings) {
    const rules = byQuestion.get(binding.questionId) ?? [];
    rules.push(binding);
    byQuestion.set(binding.questionId, rules);
  }
  for (const pack of packs)
    for (const question of pack.questions)
      for (const binding of byQuestion.get(question.id) ?? []) {
        const rows = byMetric.get(binding.metric.code) ?? [];
        rows.push({ pack, question, binding });
        byMetric.set(binding.metric.code, rows);
      }
  return byMetric;
}
import { choices, numericValue } from "./transforms";
export const validObservation = (row: Observation) =>
  row.binding.metric.kind === "number"
    ? numericValue(row.question, row.binding) !== null
    : choices(row.question, row.binding).length > 0;
export function surveyGroups(rows: Observation[]): Observation[][] {
  const groups = new Map<number, Observation[]>();
  for (const row of rows) {
    const group = groups.get(row.pack.surveyId) ?? [];
    group.push(row);
    groups.set(row.pack.surveyId, group);
  }
  return [...groups.values()].sort((a, b) => a[0].pack.year - b[0].pack.year);
}
export function matchedPanel(groups: Observation[][]): Set<number> {
  const membership = groups.map(
    (g) => new Set(g.filter(validObservation).map((r) => r.pack.organizationId)),
  );
  return new Set([...(membership[0] ?? [])].filter((id) => membership.every((set) => set.has(id))));
}
/** Check the complete publication, including years omitted from the current query. */
export function fixedPublication(rows: Observation[]): boolean {
  const membership = surveyGroups(rows).map(
    (group) => new Set(group.filter(validObservation).map((r) => r.pack.organizationId)),
  );
  return membership.every(
    (set) => set.size === membership[0].size && [...set].every((id) => membership[0].has(id)),
  );
}

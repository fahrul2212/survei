import type { AnalysisPackage } from "./contracts";
import type { Observation } from "./statistics";
import { rawValue } from "./transforms";
import { validObservation } from "./cohort";
export function dataQuality(
  rows: Observation[],
  used: number,
): NonNullable<AnalysisPackage["dataQuality"]>[number] {
  let missing = 0,
    notApplicable = 0,
    unknown = 0,
    invalid = 0,
    valid = 0;
  for (const row of rows) {
    if (row.question.applicable === false) {
      notApplicable++;
      continue;
    }
    if (row.question.applicable !== true) {
      unknown++;
      continue;
    }
    const raw = rawValue(row.question, row.binding.field);
    if (
      raw === null ||
      raw === undefined ||
      (typeof raw === "string" && !raw.trim()) ||
      (Array.isArray(raw) && !raw.length)
    ) {
      missing++;
      continue;
    }
    if (validObservation(row)) valid++;
    else invalid++;
  }
  return {
    metricCode: rows[0].binding.metric.code,
    year: rows[0].pack.year,
    reports: new Set(rows.map((r) => r.pack.organizationId)).size,
    used,
    missing,
    notApplicable,
    unknown,
    invalid,
    panelExcluded: Math.max(0, valid - used),
  };
}

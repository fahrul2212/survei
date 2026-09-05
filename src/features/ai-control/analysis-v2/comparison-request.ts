import type { AnalysisRequest, AnalysisRun } from "../../../../shared/analysis/contracts";

export function scopeFingerprint(scope: AnalysisRequest): string {
  return JSON.stringify({
    ...scope,
    years: [...new Set(scope.years)].sort((a, b) => a - b),
    surveyVersionIds: [...new Set(scope.surveyVersionIds)].sort((a, b) => a - b),
    organizationIds: [...new Set(scope.organizationIds)].sort((a, b) => a - b),
    questionKeys: [...new Set(scope.questionKeys)].sort(),
    metricCodes: [...new Set(scope.metricCodes)].sort(),
  });
}

/** Reuse the same operation key after an uncertain response; collapse simultaneous clicks. */
export class ComparisonRequest {
  private attempt?: { scope: string; key: string; input: AnalysisRequest };
  private active?: Promise<AnalysisRun>;

  constructor(private send: (scope: AnalysisRequest, key: string) => Promise<AnalysisRun>) {}

  execute(scope: AnalysisRequest): Promise<AnalysisRun> {
    if (this.active) return this.active;
    const fingerprint = scopeFingerprint(scope);
    if (this.attempt?.scope !== fingerprint) {
      this.attempt = {
        scope: fingerprint,
        key: crypto.randomUUID(),
        input: JSON.parse(fingerprint),
      };
    }
    const attempt = this.attempt;
    this.active = Promise.resolve()
      .then(() => this.send(attempt.input, attempt.key))
      .then((result) => {
        this.attempt = undefined;
        return result;
      })
      .finally(() => {
        this.active = undefined;
      });
    return this.active;
  }
}

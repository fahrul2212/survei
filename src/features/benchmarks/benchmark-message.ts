import type { QuestionBenchmarkResponse } from "./api";

export function benchmarkMessage(result: QuestionBenchmarkResponse | null) {
  if (!result)
    return "Question comparison data could not be loaded. Try selecting this survey again.";
  switch (result.reason) {
    case "no_submissions":
      return "No submitted reports are available for this survey yet.";
    case "no_own_submission":
      return "Submit your company’s report to compare your answers with the anonymous cohort.";
    case "no_comparable_answers":
      return "Your submitted report has no numeric or choice answers that can be compared.";
    default:
      return `No comparisons can be released yet. Each numeric metric needs at least ${result.threshold} valid company responses. Choice distributions are also withheld when a small group could be identified.`;
  }
}

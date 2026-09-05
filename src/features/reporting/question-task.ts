import { answerIssues, hasAnswer, type JsonAnswer } from "../../../shared/survey-answer";
import type { SurveyQuestion } from "../../lib/portal";

export function questionTask(
  question: SurveyQuestion,
  value: JsonAnswer | undefined,
  provenance?: string,
  reviewed = false,
): "unanswered" | "correction" | "review" | "complete" {
  if (!hasAnswer(value)) return "unanswered";
  if (answerIssues(question, value).length) return "correction";
  if (provenance && provenance !== "manual" && !reviewed) return "review";
  return "complete";
}

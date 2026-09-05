import { answerIssues, hasAnswer, type JsonAnswer } from "../../../shared/survey-answer";
import { reportingWindow, reportingWindowMessage } from "../../../shared/reporting-window";
import type { SurveyQuestion, SurveyVersion } from "../../lib/portal";

type SubmissionCheck = {
  version: SurveyVersion;
  questions: SurveyQuestion[];
  answers: Record<number, JsonAnswer>;
  provenance: Record<number, string>;
  reviewed: Record<number, boolean>;
  flush: () => Promise<boolean>;
  send: () => PromiseLike<{ error: { message: string } | null }>;
};

/** Surface all submission failures to the review dialog that owns the interaction. */
export async function submitReportDraft(input: SubmissionCheck) {
  if (!(await input.flush())) throw new Error("Save your pending changes before submitting.");
  if (reportingWindow(input.version) !== "open")
    throw new Error(reportingWindowMessage(input.version));
  const invalid = input.questions.filter(
    (question) => answerIssues(question, input.answers[question.id]).length,
  );
  if (invalid.length) throw new Error(`${invalid.length} response(s) need correction.`);
  if (
    input.questions.some(
      (question) =>
        hasAnswer(input.answers[question.id]) &&
        input.provenance[question.id] !== "manual" &&
        !input.reviewed[question.id],
    )
  ) {
    throw new Error("Confirm the carried-forward answers before submitting.");
  }
  const result = await input.send();
  if (result.error) throw new Error(result.error.message);
}

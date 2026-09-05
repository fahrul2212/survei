import { useEffect, useState } from "react";
import { answerIssues } from "../../../shared/survey-answer";
import type { JsonAnswer, SurveyQuestion } from "../../lib/portal";
import { focusSurveyQuestion } from "./survey-progress";

export function PageQuestionIndex({
  questions,
  answers,
  revealErrors,
  prefix = "report-question",
  disabled,
}: {
  questions: SurveyQuestion[];
  answers: Record<number, JsonAnswer>;
  revealErrors: () => void;
  prefix?: string;
  disabled?: boolean;
}) {
  const [checked, setChecked] = useState(false);
  useEffect(() => setChecked(false), [answers, questions]);
  if (questions.length < 4) return null;
  function check() {
    revealErrors();
    const invalid = questions.find(
      (question) => answerIssues(question, answers[question.id]).length,
    );
    if (invalid) focusSurveyQuestion(invalid.id, prefix);
    else setChecked(true);
  }
  return (
    <div className="mb-6 border-b border-slate-200 pb-5">
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid min-w-0 flex-1 gap-2 text-xs font-semibold text-slate-600">
          Questions on this page
          <select
            value=""
            disabled={disabled}
            onChange={(event) => focusSurveyQuestion(Number(event.target.value), prefix)}
            className="min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal"
          >
            <option value="" disabled>
              Jump to a question…
            </option>
            {questions.map((question) => (
              <option key={question.id} value={question.id}>
                Q{question.displayOrder}.{" "}
                {question.prompt.length > 90 ? `${question.prompt.slice(0, 90)}…` : question.prompt}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={disabled}
          onClick={check}
          className="min-h-11 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700"
        >
          Check this page
        </button>
      </div>
      {checked && (
        <p role="status" className="mt-3 text-xs leading-5 text-slate-600">
          No validation errors on this page. Carried-forward answers are checked separately before
          submission.
        </p>
      )}
    </div>
  );
}

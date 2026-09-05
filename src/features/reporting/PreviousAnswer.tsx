import { comparisonKey, sameAnswer } from "../../../shared/question-comparison";
import { answerText, type JsonAnswer } from "../../../shared/survey-answer";
import type { SurveyQuestion } from "../../lib/portal";
import type { PreviousAnswerRecord } from "./usePreviousReport";

export function PreviousAnswer({
  previous,
  current,
  value,
  year,
}: {
  previous?: PreviousAnswerRecord;
  current: SurveyQuestion;
  value?: JsonAnswer;
  year: number;
}) {
  if (!previous)
    return (
      <p className="mb-4 text-sm text-slate-500">
        No saved answer for this question was found in the selected {year} report.
      </p>
    );
  const compatible = comparisonKey(previous) === comparisonKey(current);
  const unchanged = sameAnswer(previous.value, value);
  return (
    <section className="my-4 rounded-lg border border-slate-300 p-4">
      <p className="mb-3 text-xs font-semibold text-slate-600">
        {!compatible
          ? "Question wording or answer structure changed — review both versions carefully."
          : unchanged
            ? "Unchanged from previous report"
            : "Changed since previous report"}
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {[
          {
            label: String(year),
            answer: previous.value,
            prompt: !compatible ? previous.prompt : null,
          },
          { label: "Current answer", answer: value, prompt: null },
        ].map((item) => (
          <div key={item.label}>
            <h3 className="text-xs font-bold uppercase text-slate-500">{item.label}</h3>
            {item.prompt && <p className="mt-2 text-sm font-semibold">{item.prompt}</p>}
            <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">
              {answerText(item.answer) || "Not answered"}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

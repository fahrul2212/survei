import {
  answerFields,
  answerObject,
  answerText,
  answerIssues,
  hasAnswer,
  type JsonAnswer,
} from "../../../shared/survey-answer";
import type { SurveyQuestion } from "../../lib/portal";

type Props = {
  question: SurveyQuestion;
  value?: JsonAnswer;
  disabled: boolean;
  change: (value: JsonAnswer) => void;
  save: (value: JsonAnswer) => void;
  showErrors?: boolean;
};

export const questionInputClass =
  "w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-red-600 focus:outline-none focus:ring-2 focus:ring-red-100 disabled:bg-slate-50 disabled:text-slate-600";

export function StructuredFields({ question, value, disabled, change, save, showErrors }: Props) {
  const values = answerObject(value);
  const previous = typeof value === "string" ? value : answerText(values._previous);
  const update = (key: string, text: string, commit = false) => {
    const next = { ...values, ...(previous ? { _previous: previous } : {}), [key]: text };
    change(next);
    if (commit) save(next);
  };
  return (
    <div className="grid gap-4">
      {previous.trim() && (
        <details
          className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
          open
        >
          <summary className="font-semibold">Previous response — review before replacing</summary>
          <p className="mt-2 whitespace-pre-wrap">{previous}</p>
        </details>
      )}
      {answerFields(question.validation).map((field) => {
        const id = `question-${question.id}-${field.key}`;
        const invalid = Boolean(
          showErrors &&
          (question.required || hasAnswer(value)) &&
          answerIssues(
            { ...question, required: Boolean(field.required), validation: { fields: [field] } },
            { [field.key]: values[field.key] ?? null },
          ).length,
        );
        const common = {
          id,
          disabled,
          value: answerText(values[field.key]),
          required: Boolean(field.required),
          "aria-invalid": invalid,
          "aria-describedby": invalid ? `question-${question.id}-errors` : undefined,
          className: questionInputClass,
          onChange: (
            event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
          ) => update(field.key, event.target.value, field.type === "select"),
          onBlur: (
            event: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
          ) => update(field.key, event.target.value, true),
        };
        return (
          <div
            key={field.key}
            className="grid gap-2 sm:grid-cols-[minmax(9rem,30%)_minmax(0,1fr)] sm:items-start"
          >
            <label htmlFor={id} className="pt-2 text-sm font-medium leading-6 text-slate-700">
              {field.label}
              {field.required && " *"}
            </label>
            {field.type === "select" ? (
              <select {...common}>
                <option value="">Select an option…</option>
                {field.options?.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            ) : field.type === "textarea" ? (
              <textarea {...common} rows={3} />
            ) : (
              <input
                {...common}
                type={field.type}
                step={field.type === "number" ? "any" : undefined}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

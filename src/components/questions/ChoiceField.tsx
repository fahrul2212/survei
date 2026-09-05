import {
  answerObject,
  answerText,
  primaryAnswer,
  answerIssues,
  hasAnswer,
  type JsonAnswer,
} from "../../../shared/survey-answer";
import type { SurveyQuestion } from "../../lib/portal";
import { questionInputClass } from "./StructuredFields";

type Props = {
  question: SurveyQuestion;
  value?: JsonAnswer;
  disabled: boolean;
  change: (value: JsonAnswer) => void;
  save: (value: JsonAnswer) => void;
  showErrors?: boolean;
};

export function ChoiceField({ question, value, disabled, change, save, showErrors }: Props) {
  const selected = primaryAnswer(value);
  const multiple = question.type === "multiple_choice";
  const options = question.type === "yes_no" ? ["Yes", "No"] : question.options;
  const comment = question.validation.comment as
    | { label: string; option?: string; required?: boolean }
    | undefined;
  const values = answerObject(value);
  const invalid = Boolean(showErrors && answerIssues(question, value).length);
  const errorId = `question-${question.id}-errors`;
  const choose = (next: string | string[]) => {
    const answer = comment ? { ...values, selection: next } : next;
    change(answer);
    save(answer);
  };
  const commentVisible =
    comment &&
    (!comment.option ||
      (Array.isArray(selected) ? selected.includes(comment.option) : selected === comment.option));
  const commentInvalid = Boolean(
    invalid && commentVisible && comment?.required && !hasAnswer(values.comment),
  );

  return (
    <div className="grid gap-3">
      {question.validation.presentation === "dropdown" ? (
        <select
          aria-label={question.prompt}
          aria-required={question.required}
          aria-invalid={invalid && !commentInvalid}
          aria-describedby={invalid ? errorId : undefined}
          disabled={disabled}
          value={answerText(selected)}
          className={questionInputClass}
          onChange={(event) => choose(event.target.value)}
        >
          <option value="">Select an option…</option>
          {options.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
      ) : (
        <fieldset className={`grid gap-2 ${multiple ? "sm:grid-cols-2" : ""}`}>
          <legend className="sr-only">{question.prompt}</legend>
          {options.map((option, index) => {
            const checked = multiple
              ? Array.isArray(selected) && selected.includes(option)
              : selected === option;
            return (
              <label
                key={option}
                className={`flex items-start gap-3 rounded-lg border p-3 text-sm leading-6 ${checked ? "border-red-600 bg-red-50 text-red-900" : "border-slate-300 bg-white text-slate-700"} ${disabled ? "opacity-70" : "cursor-pointer"}`}
              >
                <input
                  type={multiple ? "checkbox" : "radio"}
                  name={`question-${question.id}`}
                  id={`question-${question.id}-option-${index}`}
                  checked={checked}
                  disabled={disabled}
                  aria-invalid={invalid && !commentInvalid}
                  aria-describedby={invalid ? errorId : undefined}
                  className="mt-1 size-4 shrink-0 accent-red-600"
                  onChange={() => {
                    const current = Array.isArray(selected) ? selected : [];
                    choose(
                      multiple
                        ? checked
                          ? current.filter((item) => item !== option)
                          : [...current, option]
                        : option,
                    );
                  }}
                />
                <span>{option}</span>
              </label>
            );
          })}
        </fieldset>
      )}
      {commentVisible && (
        <label className="grid gap-2 text-sm font-medium leading-6 text-slate-700">
          {comment.label}
          <textarea
            disabled={disabled}
            aria-required={Boolean(comment.required)}
            aria-invalid={commentInvalid}
            aria-describedby={commentInvalid ? errorId : undefined}
            rows={3}
            value={answerText(values.comment)}
            className={questionInputClass}
            onChange={(event) =>
              change({ ...values, selection: selected ?? null, comment: event.target.value })
            }
            onBlur={(event) =>
              save({ ...values, selection: selected ?? null, comment: event.target.value })
            }
          />
        </label>
      )}
      {!question.required && hasAnswer(selected) && !disabled && (
        <button
          type="button"
          onClick={() => choose(multiple ? [] : "")}
          className="min-h-10 justify-self-start rounded px-1 text-xs font-semibold text-slate-600 underline underline-offset-4"
        >
          Clear answer
        </button>
      )}
    </div>
  );
}

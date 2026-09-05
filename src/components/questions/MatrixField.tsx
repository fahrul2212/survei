import {
  answerFields,
  answerObject,
  answerText,
  answerIssues,
  hasAnswer,
  type JsonAnswer,
} from "../../../shared/survey-answer";
import type { SurveyQuestion } from "../../lib/portal";
import { StructuredFields } from "./StructuredFields";

type Props = {
  question: SurveyQuestion;
  value?: JsonAnswer;
  disabled: boolean;
  change: (value: JsonAnswer) => void;
  save: (value: JsonAnswer) => void;
  showErrors?: boolean;
};

export function MatrixField(props: Props) {
  const { question, value, disabled, change, save, showErrors } = props;
  const fields = answerFields(question.validation);
  const values = answerObject(value);
  const columns = fields[0]?.options ?? [];
  const invalid = Boolean(showErrors && answerIssues(question, value).length);
  return (
    <>
      <div className="@min-[720px]:hidden">
        <StructuredFields {...props} />
      </div>
      <div className="hidden @min-[720px]:block">
        {typeof value === "string" && value.trim() && (
          <p className="mb-3 whitespace-pre-wrap rounded border border-amber-200 bg-amber-50 p-3 text-sm">
            Previous response: {value}
          </p>
        )}
        <table className="w-full table-fixed border-collapse text-center text-xs leading-5">
          <caption className="sr-only">{question.prompt}</caption>
          <thead>
            <tr>
              <th className="w-36 p-2" scope="col">
                Item
              </th>
              {columns.map((option) => (
                <th key={option} scope="col" className="p-2 font-medium">
                  {option}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {fields.map((field) => (
              <tr key={field.key} className="border-t border-slate-200">
                <th scope="row" className="p-3 text-left font-medium">
                  {field.label}
                </th>
                {columns.map((option) => (
                  <td key={option} className="p-1">
                    <label className="flex min-h-11 cursor-pointer items-center justify-center">
                      <input
                        type="radio"
                        name={`matrix-${question.id}-${field.key}`}
                        aria-label={`${field.label} ${option}`}
                        aria-required={Boolean(field.required)}
                        aria-invalid={Boolean(
                          showErrors &&
                          (question.required || hasAnswer(value)) &&
                          answerIssues(
                            {
                              ...question,
                              required: Boolean(field.required),
                              validation: { fields: [field] },
                            },
                            { [field.key]: values[field.key] ?? null },
                          ).length,
                        )}
                        aria-describedby={invalid ? `question-${question.id}-errors` : undefined}
                        className="size-4 accent-red-600"
                        disabled={disabled}
                        checked={answerText(values[field.key]) === option}
                        onChange={() => {
                          const next = {
                            ...values,
                            ...(typeof value === "string" ? { _previous: value } : {}),
                            [field.key]: option,
                          };
                          change(next);
                          save(next);
                        }}
                      />
                    </label>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

import { answerFields, answerIssues } from "../../shared/survey-answer";
import { valueAsText, type JsonAnswer, type SurveyQuestion } from "../lib/portal";
import { ChoiceField } from "./questions/ChoiceField";
import { MatrixField } from "./questions/MatrixField";
import { QuestionReferences } from "./questions/QuestionReferences";
import { StructuredFields, questionInputClass } from "./questions/StructuredFields";

export type QuestionFieldProps = {
  question: SurveyQuestion;
  value?: JsonAnswer;
  disabled: boolean;
  change: (value: JsonAnswer) => void;
  save: (value: JsonAnswer) => void;
  showErrors?: boolean;
};

export function QuestionField(props: QuestionFieldProps) {
  const { question, value, disabled, change, save, showErrors } = props;
  const issues = showErrors ? answerIssues(question, value) : [];
  const errorId = `question-${question.id}-errors`;
  let control: React.ReactNode;

  if (question.validation.presentation === "matrix") control = <MatrixField {...props} />;
  else if (answerFields(question.validation).length) control = <StructuredFields {...props} />;
  else if (["yes_no", "single_choice", "multiple_choice"].includes(question.type))
    control = <ChoiceField {...props} />;
  else {
    const convert = (raw: string): JsonAnswer => raw;
    const common = {
      id: `question-${question.id}`,
      disabled,
      value: valueAsText(value),
      "aria-label": question.prompt,
      "aria-required": question.required,
      "aria-invalid": issues.length > 0,
      "aria-describedby": issues.length ? errorId : undefined,
      className: questionInputClass,
      onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        change(convert(event.target.value)),
      onBlur: (event: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        save(convert(event.target.value)),
    };
    control =
      question.type === "textarea" ? (
        <textarea {...common} rows={5} placeholder="Enter your response…" />
      ) : (
        <input
          {...common}
          type={question.type === "number" ? "number" : question.type === "date" ? "date" : "text"}
          step={question.type === "number" ? "any" : undefined}
        />
      );
  }

  return (
    <div className="@container grid gap-2">
      <QuestionReferences validation={question.validation} />
      {control}
      {issues.length > 0 && (
        <ul id={errorId} className="grid gap-1 text-sm text-red-700" role="alert">
          {issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

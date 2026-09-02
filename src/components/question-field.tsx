import { Check, X } from "lucide-react";
import { valueAsText, type JsonAnswer, type QuestionType, type SurveyQuestion } from "../lib/portal";

export function QuestionField({ question, value, disabled, change, save }: {
  question: SurveyQuestion;
  value?: JsonAnswer;
  disabled: boolean;
  change: (value: JsonAnswer) => void;
  save: (value: JsonAnswer) => void;
}) {
  const commitNumber = (raw: string) => raw ? Number(raw) : "";

  if (question.type === "yes_no") {
    return (
      <div className="choice-row">
        {["Yes", "No"].map((option) => {
          const Icon = option === "Yes" ? Check : X;
          return (
            <button
              key={option}
              type="button"
              disabled={disabled}
              className={value === option ? "selected" : ""}
              onClick={() => {
                change(option);
                save(option);
              }}
            >
              <Icon size={17} aria-hidden="true" />
              {option}
            </button>
          );
        })}
      </div>
    );
  }

  if (question.type === "single_choice") {
    return (
      <select
        disabled={disabled}
        value={valueAsText(value)}
        onChange={(event) => {
          change(event.target.value);
          save(event.target.value);
        }}
      >
        <option value="">Select an option…</option>
        {question.options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    );
  }

  if (question.type === "multiple_choice") {
    const values = Array.isArray(value) ? value : [];
    return (
      <div className="checkbox-grid">
        {question.options.map((option) => (
          <label key={option} className={values.includes(option) ? "checked" : ""}>
            <input
              type="checkbox"
              disabled={disabled}
              checked={values.includes(option)}
              onChange={() => {
                const next = values.includes(option)
                  ? values.filter((item) => item !== option)
                  : [...values, option];
                change(next);
                save(next);
              }}
            />
            <span>{option}</span>
          </label>
        ))}
      </div>
    );
  }

  if (question.type === "textarea") {
    return (
      <textarea
        rows={6}
        disabled={disabled}
        placeholder="Enter your detailed response…"
        value={valueAsText(value)}
        onChange={(event) => change(event.target.value)}
        onBlur={(event) => save(event.target.value)}
      />
    );
  }

  const type: QuestionType = question.type;
  return (
    <input
      disabled={disabled}
      type={type === "number" ? "number" : type === "date" ? "date" : "text"}
      placeholder={type === "number" ? "e.g. 1000" : "Enter answer…"}
      value={valueAsText(value)}
      onChange={(event) => change(type === "number" ? commitNumber(event.target.value) : event.target.value)}
      onBlur={(event) => save(type === "number" ? commitNumber(event.target.value) : event.target.value)}
    />
  );
}

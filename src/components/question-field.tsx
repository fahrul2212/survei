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

  const inputClasses = "w-full rounded-lg border-[1.5px] border-slate-200 bg-white px-4 py-3 text-[15px] text-slate-900 outline-none transition-all focus:border-[#d91f17] focus:ring-3 focus:ring-[#d91f17]/10 disabled:cursor-not-allowed disabled:opacity-60";

  if (question.type === "yes_no") {
    return (
      <div className="flex gap-3 sm:max-w-[320px]">
        {["Yes", "No"].map((option) => {
          const Icon = option === "Yes" ? Check : X;
          const isSelected = value === option;
          return (
            <button
              key={option}
              type="button"
              disabled={disabled}
              className={`flex h-12 flex-1 items-center justify-center gap-2 rounded-lg border-2 font-semibold transition-all ${
                isSelected
                  ? "border-[#d91f17] bg-red-50 text-[#d91f17]"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
              } disabled:cursor-not-allowed disabled:opacity-50`}
              onClick={() => {
                change(option);
                save(option);
              }}
            >
              <Icon size={18} aria-hidden="true" />
              {option}
            </button>
          );
        })}
      </div>
    );
  }

  if (question.type === "single_choice" && question.validation.presentation === "dropdown") {
    return (
      <select
        disabled={disabled}
        value={valueAsText(value)}
        onChange={(event) => {
          change(event.target.value);
          save(event.target.value);
        }}
        className={inputClasses}
      >
        <option value="">Select an option…</option>
        {question.options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    );
  }

  if (question.type === "single_choice") {
    return (
      <div className="grid grid-cols-1 gap-2.5">
        {question.options.map((option) => {
          const isSelected = value === option;
          return (
            <label
              key={option}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border-[1.5px] px-4 py-3.5 transition-colors ${
                isSelected
                  ? "border-[#d91f17] bg-red-50 text-[#b01710]"
                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50"
              } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
            >
              <input
                type="radio"
                name={`question-${question.id}`}
                disabled={disabled}
                checked={isSelected}
                className="mt-0.5 size-4 shrink-0 border-slate-300 text-[#d91f17] focus:ring-[#d91f17]/20 disabled:cursor-not-allowed"
                onChange={() => {
                  change(option);
                  save(option);
                }}
              />
              <span className="text-[15px] font-medium leading-6">{option}</span>
            </label>
          );
        })}
      </div>
    );
  }

  if (question.type === "multiple_choice") {
    const values = Array.isArray(value) ? value : [];
    return (
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {question.options.map((option) => {
          const isChecked = values.includes(option);
          return (
            <label
              key={option}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border-2 p-3.5 transition-all ${
                isChecked
                  ? "border-[#d91f17] bg-red-50"
                  : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
              } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
            >
              <input
                type="checkbox"
                disabled={disabled}
                checked={isChecked}
                className="mt-0.5 size-4 shrink-0 rounded border-slate-300 text-[#d91f17] focus:ring-[#d91f17]/20 disabled:cursor-not-allowed"
                onChange={() => {
                  const next = isChecked
                    ? values.filter((item) => item !== option)
                    : [...values, option];
                  change(next);
                  save(next);
                }}
              />
              <span className={`text-[15px] font-medium leading-tight ${isChecked ? "text-[#d91f17]" : "text-slate-700"}`}>
                {option}
              </span>
            </label>
          );
        })}
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
        className={`${inputClasses} resize-y leading-relaxed`}
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
      className={inputClasses}
    />
  );
}

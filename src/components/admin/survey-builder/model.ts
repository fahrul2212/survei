import { valueAsText, type QuestionType, type SurveyQuestion, type SurveyVersion } from "../../../lib/portal";
import { answerFields } from "../../../../shared/survey-answer";

export type SurveyBuilderView = "overview" | "create-year" | "workspace" | "question";
export type SurveySection = readonly [key: string, title: string];

export type QuestionForm = {
  id: number | null;
  stableKey: string;
  category: string;
  prompt: string;
  help: string;
  type: QuestionType;
  options: string;
  required: boolean;
  sectionKey: string;
  sectionTitle: string;
  carry: string;
  condition: string;
  operator: string;
  expected: string;
  presentation: "radio" | "dropdown";
  validation: Record<string, unknown>;
};

export type SurveyYearDraft = { year: string; name: string };

export const EMPTY_QUESTION: QuestionForm = {
  id: null,
  stableKey: "",
  category: "",
  prompt: "",
  help: "",
  type: "text",
  options: "",
  required: false,
  sectionKey: "general",
  sectionTitle: "General",
  carry: "",
  condition: "",
  operator: "equals",
  expected: "",
  presentation: "radio",
  validation: {},
};

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  text: "Short text",
  textarea: "Long text",
  number: "Number",
  yes_no: "Yes / No",
  single_choice: "Multiple choice",
  multiple_choice: "Checkboxes",
  date: "Date",
};

export function createYearDraft(versions: SurveyVersion[]): SurveyYearDraft {
  const latestYear = Math.max(new Date().getFullYear(), ...versions.map((version) => version.reporting_year));
  return { year: String(latestYear), name: `Climate Transition Plan Annual Report ${latestYear}` };
}

export function getSurveySections(questions: SurveyQuestion[]): SurveySection[] {
  return Array.from(new Map(questions.map((question) => [question.sectionKey, question.sectionTitle])).entries());
}

export function nextStableKey(questions: SurveyQuestion[], version?: SurveyVersion): string {
  const highest = questions.reduce((maximum, question) => {
    const match = question.stableKey.match(/(\d+)$/);
    return Math.max(maximum, match ? Number(match[1]) : 0);
  }, 0);
  const year = String(version?.reporting_year ?? "").slice(-2);
  return `CTP${year}-${String(highest + 1).padStart(3, "0")}`;
}

export function newQuestionForm(stableKey: string, section?: SurveySection): QuestionForm {
  const title = section?.[1] ?? "General";
  return { ...EMPTY_QUESTION, stableKey, category: title, sectionKey: section?.[0] ?? "general", sectionTitle: title };
}

export function editQuestionForm(question: SurveyQuestion, carryKey = ""): QuestionForm {
  return {
    id: question.id,
    stableKey: question.stableKey,
    category: question.category,
    prompt: question.prompt,
    help: question.helpText ?? "",
    type: question.type,
    options: question.options.join("\n"),
    required: question.required,
    sectionKey: question.sectionKey,
    sectionTitle: question.sectionTitle,
    carry: carryKey,
    condition: question.visibilityRule.questionKey ?? "",
    operator: question.visibilityRule.operator ?? "equals",
    expected: valueAsText(question.visibilityRule.value),
    presentation: question.validation.presentation === "dropdown" ? "dropdown" : "radio",
    validation: question.validation,
  };
}

export function duplicateQuestionForm(question: SurveyQuestion, stableKey: string): QuestionForm {
  return { ...editQuestionForm(question), id: null, stableKey, prompt: `${question.prompt} (copy)`, carry: "" };
}

export function incrementStableKey(stableKey: string): string | null {
  const match = stableKey.match(/^(.*?)(\d+)$/);
  return match ? `${match[1]}${String(Number(match[2]) + 1).padStart(match[2].length, "0")}` : null;
}

export function isQuestionFormValid(form: QuestionForm): boolean {
  const isChoice = form.type === "single_choice" || form.type === "multiple_choice";
  const choiceCount = form.options.split("\n").filter((choice) => choice.trim()).length;
  const fieldsValid = form.type !== "textarea" || answerFields(form.validation).every(field => field.label.trim()
    && (field.type !== "select" || (field.options?.filter(option => option.trim()).length ?? 0) >= 2));
  return Boolean(fieldsValid && form.stableKey.trim() && form.sectionTitle.trim() && form.category.trim() && form.prompt.trim()
    && (!isChoice || choiceCount >= 2));
}

export function questionValidation(form: QuestionForm): Record<string, unknown> {
  const validation = { ...form.validation };
  const fields = form.type === "textarea" ? answerFields(validation).map(field => ({ ...field,
    options: field.options?.map(option => option.trim()).filter(Boolean) })) : [];
  if (fields.length) validation.fields = fields;
  else { delete validation.fields; if (validation.presentation === "matrix") delete validation.presentation; }
  if (!["single_choice", "multiple_choice", "yes_no"].includes(form.type)) delete validation.comment;
  if (form.type === "single_choice") validation.presentation = form.presentation;
  return validation;
}

export function errorMessage(error: unknown, fallback: string): string {
  return error && typeof error === "object" && "message" in error ? String(error.message) : fallback;
}

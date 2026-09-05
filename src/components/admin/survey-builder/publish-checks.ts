import { answerFields } from "../../../../shared/survey-answer";
import type { SurveyQuestion, SurveyVersion } from "../../../lib/portal";

export function publishChecks(version: SurveyVersion, questions: SurveyQuestion[]) {
  const errors: string[] = [];
  if (!questions.length) errors.push("Add at least one question.");
  if (
    version.opens_at &&
    version.closes_at &&
    Date.parse(version.opens_at) >= Date.parse(version.closes_at)
  )
    errors.push("The closing date must be after the opening date.");
  const keys = new Set<string>();
  for (const question of questions) {
    const label = `Q${question.displayOrder}`;
    if (!question.prompt.trim() || !question.sectionKey || !question.sectionTitle.trim())
      errors.push(`${label}: add a prompt and page title.`);
    if (keys.has(question.stableKey)) errors.push(`${label}: duplicate stable question ID.`);
    keys.add(question.stableKey);
    if (["single_choice", "multiple_choice"].includes(question.type) && !question.options.length)
      errors.push(`${label}: add answer choices.`);
    const fields = answerFields(question.validation);
    if (
      Array.isArray(question.validation.fields) &&
      fields.length !== question.validation.fields.length
    )
      errors.push(`${label}: invalid field configuration.`);
    if (
      new Set(fields.map((field) => field.key)).size !== fields.length ||
      fields.some(
        (field) =>
          !field.key.trim() ||
          !field.label.trim() ||
          (field.type === "select" && !field.options?.length),
      )
    )
      errors.push(`${label}: check field names, labels and choices.`);
    const rule = question.visibilityRule;
    if (rule.questionKey) {
      const source = questions.find((item) => item.stableKey === rule.questionKey);
      if (!source || source.displayOrder >= question.displayOrder)
        errors.push(`${label}: display rules must reference an earlier question in this survey.`);
      if (!["equals", "not_equals", "contains", "is_answered"].includes(rule.operator ?? ""))
        errors.push(`${label}: choose a valid display rule operator.`);
    }
  }
  return errors;
}

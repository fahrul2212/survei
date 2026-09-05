import {
  answerFields,
  answerObject,
  answerText,
  hasAnswer,
  primaryAnswer,
  type JsonAnswer,
} from "../../../shared/survey-answer";
import type { SurveyQuestion } from "../../lib/portal";

/** Present active fields only; retained branch comments and migration metadata are not answers. */
export function answerReviewLines(question: SurveyQuestion, value: JsonAnswer | undefined) {
  const fields = answerFields(question.validation),
    values = answerObject(value);
  if (fields.length && typeof value === "object" && value !== null && !Array.isArray(value)) {
    return fields
      .filter((field) => hasAnswer(values[field.key]))
      .map((field) => ({ label: field.label, text: answerText(values[field.key]) }));
  }
  if (Object.hasOwn(values, "selection")) {
    const selected = primaryAnswer(value);
    const comment = question.validation.comment as { label?: string; option?: string } | undefined;
    const showComment =
      comment &&
      (!comment.option ||
        (Array.isArray(selected)
          ? selected.includes(comment.option)
          : selected === comment.option));
    return [
      ...(hasAnswer(selected) ? [{ label: "Selected answer", text: answerText(selected) }] : []),
      ...(showComment && hasAnswer(values.comment)
        ? [{ label: comment.label ?? "Additional information", text: answerText(values.comment) }]
        : []),
    ];
  }
  return hasAnswer(value) ? [{ label: "", text: answerText(value) }] : [];
}

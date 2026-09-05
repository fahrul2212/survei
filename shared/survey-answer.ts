export type AnswerScalar = string | number | boolean | string[] | null;
export type JsonAnswer = AnswerScalar | Record<string, AnswerScalar>;
export type AnswerField = {
  key: string;
  label: string;
  type: "text" | "email" | "tel" | "number" | "textarea" | "select";
  options?: string[];
  required?: boolean;
};
export type AnswerSchema = {
  required: boolean;
  type: string;
  options: string[];
  validation: Record<string, unknown>;
};

export function answerObject(value: JsonAnswer | undefined): Record<string, AnswerScalar> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function primaryAnswer(value: JsonAnswer | undefined): AnswerScalar | undefined {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) return value.selection;
  return value;
}

export function hasAnswer(value: JsonAnswer | undefined): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.some((item) => item.trim().length > 0);
  if (typeof value === "object") {
    return Object.hasOwn(value, "selection")
      ? hasAnswer(value.selection)
      : Object.entries(value).some(([key, item]) => key !== "_previous" && hasAnswer(item));
  }
  return true;
}

export function answerText(value: JsonAnswer | undefined): string {
  if (value === undefined || value === null) return "";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object")
    return Object.entries(value)
      .filter(([, item]) => hasAnswer(item))
      .map(([key, item]) => `${key}: ${answerText(item)}`)
      .join("\n");
  return String(value);
}

export function answerFields(validation: Record<string, unknown>): AnswerField[] {
  if (!Array.isArray(validation.fields)) return [];
  return validation.fields.filter((field): field is AnswerField => {
    if (!field || typeof field !== "object") return false;
    return (
      typeof field.key === "string" &&
      typeof field.label === "string" &&
      ["text", "email", "tel", "number", "textarea", "select"].includes(field.type)
    );
  });
}

export function answerIssues(question: AnswerSchema, value: JsonAnswer | undefined): string[] {
  if (!hasAnswer(value)) return question.required ? ["This question requires an answer."] : [];
  const fields = answerFields(question.validation);
  if (fields.length) {
    const values = answerObject(value);
    if (typeof value === "string")
      return ["Review the previous text response and complete the individual fields."];
    return fields.flatMap((field) => {
      const text = answerText(values[field.key]).trim();
      if (!text) return field.required ? [`${field.label} is required.`] : [];
      if (field.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text))
        return [`Enter a valid ${field.label.toLowerCase()}.`];
      if (field.type === "number" && !Number.isFinite(Number(text)))
        return [`${field.label} must be a number.`];
      if (field.type === "select" && !field.options?.includes(text))
        return [`Choose a valid ${field.label.toLowerCase()}.`];
      return [];
    });
  }
  const selected = primaryAnswer(value);
  if (question.type === "number" && !Number.isFinite(Number(selected)))
    return ["Enter a valid number."];
  const choices = question.type === "yes_no" ? ["Yes", "No"] : question.options;
  if (choices.length) {
    const values = Array.isArray(selected) ? selected : [selected];
    if (question.type !== "multiple_choice" && Array.isArray(selected))
      return ["Choose one available option."];
    if (values.some((item) => typeof item !== "string" || !choices.includes(item)))
      return ["Review this response and choose an available option."];
  }
  const comment = question.validation.comment as
    | { label?: string; option?: string; required?: boolean }
    | undefined;
  const commentVisible =
    comment &&
    (!comment.option ||
      (Array.isArray(selected) ? selected.includes(comment.option) : selected === comment.option));
  if (commentVisible && comment.required && !hasAnswer(answerObject(value).comment)) {
    return [`${comment.label || "Additional information"} is required.`];
  }
  return [];
}

import { answerFields, type AnswerSchema, type JsonAnswer } from "./survey-answer";

export function normalizePrompt(value: unknown): string {
  return String(value ?? "")
    .replace(/^\s*\d+\.\s*/, "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
}

export function matchQuestion<T extends { prompt: string; validation: Record<string, unknown> }>(
  header: unknown,
  questions: T[],
): T {
  const normalized = normalizePrompt(header);
  const matches = questions.filter((question) =>
    [
      question.prompt,
      ...(Array.isArray(question.validation.sourcePromptAliases)
        ? question.validation.sourcePromptAliases
        : []),
    ].some((prompt) => normalizePrompt(prompt) === normalized),
  );
  if (matches.length !== 1)
    throw new Error(
      `Question mapping stopped: ${String(header).slice(0, 100)} has ${matches.length} exact matches. Use the verified survey version.`,
    );
  return matches[0];
}

export function importBlock(
  entries: Array<{ label: string; value: unknown }>,
  question: AnswerSchema,
): JsonAnswer {
  if (!entries.length) return null;
  if (answerFields(question.validation).length) {
    // Keep obsolete export subcolumns too: schema changes must not discard history.
    return Object.fromEntries(
      entries.map((entry) => [entry.label.replace(/:$/, ""), String(entry.value).trim()]),
    );
  }
  const commentSchema = question.validation.comment as
    | { option?: string; label: string }
    | undefined;
  const choices = question.type === "yes_no" ? ["Yes", "No"] : question.options;
  if (choices.length) {
    const selected: string[] = [];
    const comments: string[] = [];
    for (const { label, value } of entries) {
      const text = String(value).trim();
      if (choices.includes(text)) selected.push(text);
      else if (choices.includes(label) && /^(1|yes|true|selected|checked)$/i.test(text))
        selected.push(label);
      else if (commentSchema && !/^response$/i.test(label)) comments.push(text);
      else
        throw new Error(
          `Unrecognised answer option: ${text.slice(0, 80)}. Review the source mapping.`,
        );
    }
    const selection =
      question.type === "multiple_choice" ? [...new Set(selected)] : (selected[0] ?? null);
    if (question.type !== "multiple_choice" && new Set(selected).size > 1)
      throw new Error("Multiple answers found for a single-choice question.");
    return commentSchema ? { selection, comment: comments.join("\n") } : selection;
  }
  const text = entries.map((entry) => String(entry.value).trim()).join("\n");
  return question.type === "number" && Number.isFinite(Number(text)) ? Number(text) : text;
}

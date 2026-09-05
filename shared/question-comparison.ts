type Schema = {
  prompt: string;
  type: string;
  options: string[];
  validation: Record<string, unknown>;
};

function ordered(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(ordered);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, ordered(item)]),
    );
  return value;
}

export function comparisonKey(question: Schema) {
  return JSON.stringify(
    ordered({
      prompt: question.prompt.trim(),
      type: question.type,
      options: question.options,
      fields: question.validation.fields ?? [],
      unit: question.validation.unit ?? null,
    }),
  );
}

export function sameAnswer(left: unknown, right: unknown) {
  return JSON.stringify(ordered(left ?? null)) === JSON.stringify(ordered(right ?? null));
}

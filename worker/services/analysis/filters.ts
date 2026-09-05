import { ApiError } from "../../lib/http";

function list(value: unknown, maximum: number): unknown[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > maximum)
    throw new ApiError(400, "Invalid or excessive analysis filters", "invalid_filters");
  return value;
}

export function numberArray(value: unknown, maximum: number): number[] {
  const values = list(value, maximum);
  if (values.some((item) => typeof item !== "number" || !Number.isSafeInteger(item) || item <= 0)) {
    throw new ApiError(400, "Analysis filters require positive integers", "invalid_filters");
  }
  return [...new Set(values as number[])];
}

export function stringArray(value: unknown, maximum: number, itemLength = 160): string[] {
  const values = list(value, maximum);
  if (values.some((item) => typeof item !== "string" || !item.trim() || item.length > itemLength)) {
    throw new ApiError(400, "Invalid analysis filter value", "invalid_filters");
  }
  return [...new Set((values as string[]).map((item) => item.trim()))];
}

export function evidencePayload(
  question: string,
  evidence: unknown[],
  maximumCharacters = 140_000,
): string {
  const serialized = JSON.stringify({ question, evidence });
  if (serialized.length > maximumCharacters)
    throw new ApiError(
      422,
      "This selection exceeds the AI context limit. Select specific questions, companies or years; no answers have been omitted.",
      "scope_too_large",
    );
  return serialized;
}

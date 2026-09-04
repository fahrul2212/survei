import type { AiModelPriceRow } from "../domain/ai";

export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

export function calculateCost(
  inputTokens: number,
  outputTokens: number,
  price: AiModelPriceRow | null,
): number | null {
  if (!price) return null;
  const cost = (inputTokens * Number(price.input_price_per_million_usd)
    + outputTokens * Number(price.output_price_per_million_usd)) / 1_000_000;
  return Number(cost.toFixed(6));
}

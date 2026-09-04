import { ApiError } from "../lib/http";
import { requireSafeContent } from "./moderation";

export type ProviderUsage = { input: number; output: number };

function outputText(response: unknown): string {
  if (!response || typeof response !== "object") throw new ApiError(502, "The AI provider returned an invalid response", "provider_response_invalid");
  const output = "output" in response && Array.isArray(response.output) ? response.output : [];
  for (const item of output) {
    if (!item || typeof item !== "object" || !("content" in item) || !Array.isArray(item.content)) continue;
    for (const part of item.content) {
      if (part && typeof part === "object" && "type" in part && part.type === "output_text"
        && "text" in part && typeof part.text === "string") return part.text;
    }
  }
  throw new ApiError(502, "The AI provider did not return a result", "provider_response_invalid");
}

function usageTokens(response: unknown, fallback: ProviderUsage): ProviderUsage {
  if (!response || typeof response !== "object" || !("usage" in response) || !response.usage || typeof response.usage !== "object") return fallback;
  const input = "input_tokens" in response.usage ? Number(response.usage.input_tokens) : Number.NaN;
  const output = "output_tokens" in response.usage ? Number(response.usage.output_tokens) : Number.NaN;
  return Number.isInteger(input) && input >= 0 && Number.isInteger(output) && output >= 0 ? { input, output } : fallback;
}

async function safetyIdentifier(userId: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(userId));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function generateStructuredResponse<T>({
  apiKey,
  model,
  maxOutputTokens,
  userId,
  instructions,
  input,
  schemaName,
  schema,
  estimatedInputTokens,
}: {
  apiKey: string;
  model: string;
  maxOutputTokens: number;
  userId: string;
  instructions: string;
  input: string;
  schemaName: string;
  schema: unknown;
  estimatedInputTokens: number;
}): Promise<{ content: T; usage: ProviderUsage }> {
  await requireSafeContent(apiKey, input, "input");
  const providerResponse = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      store: false,
      max_output_tokens: maxOutputTokens,
      safety_identifier: await safetyIdentifier(userId),
      instructions,
      input,
      text: { format: { type: "json_schema", name: schemaName, strict: true, schema } },
    }),
  });
  const responseBody: unknown = await providerResponse.json();
  if (!providerResponse.ok) {
    console.error(JSON.stringify({ message: "AI provider request failed", status: providerResponse.status }));
    throw new ApiError(502, "The AI provider could not complete this request", "provider_request_failed");
  }
  const rawOutput = outputText(responseBody);
  await requireSafeContent(apiKey, rawOutput, "output");
  let content: T;
  try { content = JSON.parse(rawOutput) as T; }
  catch { throw new ApiError(502, "The AI provider returned invalid structured output", "provider_response_invalid"); }
  return {
    content,
    usage: usageTokens(responseBody, { input: estimatedInputTokens, output: maxOutputTokens }),
  };
}

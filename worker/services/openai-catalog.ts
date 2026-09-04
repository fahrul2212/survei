import type { AiModelOption } from "../domain/ai";
import { ApiError } from "../lib/http";

const CATALOG_VERIFIED_AT = "2026-09-04";
const MAX_MODELS_RESPONSE_BYTES = 1_000_000;

const PRICES: Record<string, readonly [input: number, output: number]> = {
  "gpt-6-astra": [10, 50],
  "gpt-5.6": [4, 20],
  "gpt-5.6-sol": [4, 20],
  "gpt-5.6-terra": [2, 12],
  "gpt-5.6-luna": [0.2, 1.2],
};

const RECOMMENDED_ORDER = ["gpt-5.6-luna", "gpt-5.6-terra", "gpt-5.6-sol", "gpt-5.6", "gpt-6-astra"];
const EXCLUDED_MARKERS = [
  "audio", "codex", "computer-use", "dall-e", "embedding", "image", "moderation",
  "realtime", "search", "sora", "transcribe", "tts", "whisper",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isTextModel(id: string): boolean {
  const normalized = id.toLowerCase();
  const supportedPrefix = normalized.startsWith("gpt-") || /^o[134](?:-|$)/.test(normalized);
  return supportedPrefix && !normalized.startsWith("ft:")
    && !EXCLUDED_MARKERS.some((marker) => normalized.includes(marker));
}

function cataloguePrice(model: string): AiModelOption["pricing"] {
  const baseModel = Object.keys(PRICES)
    .sort((left, right) => right.length - left.length)
    .find((candidate) => model === candidate || model.startsWith(`${candidate}-20`));
  if (!baseModel) return null;
  const [inputPricePerMillionUsd, outputPricePerMillionUsd] = PRICES[baseModel];
  return { inputPricePerMillionUsd, outputPricePerMillionUsd, verifiedAt: CATALOG_VERIFIED_AT };
}

async function boundedJson(response: Response): Promise<unknown> {
  const declaredLength = Number(response.headers.get("Content-Length") ?? 0);
  if (declaredLength > MAX_MODELS_RESPONSE_BYTES) {
    throw new ApiError(502, "OpenAI returned an unexpectedly large model list", "provider_response_too_large");
  }
  if (!response.body) throw new ApiError(502, "OpenAI returned an empty model list", "provider_response_invalid");

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_MODELS_RESPONSE_BYTES) {
      await reader.cancel();
      throw new ApiError(502, "OpenAI returned an unexpectedly large model list", "provider_response_too_large");
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new ApiError(502, "OpenAI returned an invalid model list", "provider_response_invalid");
  }
}

export async function availableOpenAiModels(apiKey: string): Promise<{
  models: AiModelOption[];
  recommendedModel: string | null;
}> {
  const response = await fetch("https://api.openai.com/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    console.error(JSON.stringify({ message: "OpenAI model discovery failed", status: response.status }));
    throw new ApiError(502, "OpenAI rejected the API key or model-list request", "provider_models_failed");
  }

  const payload = await boundedJson(response);
  const data = isRecord(payload) && Array.isArray(payload.data) ? payload.data : [];
  const ids = [...new Set(data
    .map((item) => isRecord(item) && typeof item.id === "string" ? item.id.trim() : "")
    .filter((id) => id && isTextModel(id)))]
    .sort((left, right) => left.localeCompare(right));
  if (ids.length === 0) throw new ApiError(502, "No compatible text models are available for this API key", "provider_models_empty");

  const recommendedModel = RECOMMENDED_ORDER.find((model) => ids.includes(model))
    ?? ids.find((model) => cataloguePrice(model))
    ?? ids[0];
  return {
    models: ids.map((id) => ({ id, pricing: cataloguePrice(id) })),
    recommendedModel,
  };
}

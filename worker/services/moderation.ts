import { ApiError } from "../lib/http";

type ModerationResult = { flagged?: boolean };
type ModerationResponse = { results?: ModerationResult[] };

export async function requireSafeContent(apiKey: string, input: string, stage: "input" | "output"): Promise<void> {
  const response = await fetch("https://api.openai.com/v1/moderations", {
    signal: AbortSignal.timeout(15_000),
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "omni-moderation-latest", input }),
  });

  let body: ModerationResponse | null = null;
  try {
    body = await response.json() as ModerationResponse;
  } catch {
    // The provider response is intentionally not logged because it can contain
    // customer content or implementation details.
  }

  if (!response.ok || !body?.results?.length) {
    console.error(JSON.stringify({ message: "OpenAI moderation check failed", stage, status: response.status }));
    throw new ApiError(502, "The AI safety check is temporarily unavailable", "moderation_unavailable");
  }
  if (body.results.some((result) => result.flagged === true)) {
    throw new ApiError(422, "This report requires manual review before AI processing", "content_policy_blocked");
  }
}

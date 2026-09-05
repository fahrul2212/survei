import type { SupabaseClient } from "@supabase/supabase-js";
import type { AnalysisRequest, Binding, SourcePack } from "../../../shared/analysis/contracts";
import { ApiError } from "../../lib/http";

export type Inputs = {
  packs: SourcePack[];
  bindings: Binding[];
  request: AnalysisRequest;
  organizationId: number | null;
  createdAt: string;
};

/** Service-only RPCs reauthorize the verified actor inside each database transaction. */
export async function gateway<T>(
  admin: SupabaseClient,
  name: string,
  args: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await admin.rpc(name, args);
  if (error) {
    const status = error.code === "42501" ? 403 : error.code === "40001" ? 409 : 422;
    const allowed = [
      "Scope exceeds 50000 observations",
      "Scope exceeds source byte limit",
      "Analysis rate limit reached",
      "A different administrator must review this proposal",
      "A published mapping already covers this source; revoke it before replacement",
      "Question revision changed",
      "Analysis expired or access changed",
      "Idempotency conflict",
      "Proposal changed during review",
      "AI budget exceeded",
      "AI request limit reached",
      "The anonymous publication requires administrator review",
    ];
    console.warn(
      JSON.stringify({
        event: "analysis_gateway_rejected",
        operation: args.operation,
        code: error.code,
      }),
    );
    throw new ApiError(
      status,
      allowed.includes(error.message)
        ? error.message
        : "This analysis operation is unavailable. Refresh and check your access.",
      "analysis_unavailable",
    );
  }
  return data as T;
}
export const runGateway = <T>(
  admin: SupabaseClient,
  actor: string,
  operation: string,
  runId?: string,
  input: unknown = {},
  key?: string,
) =>
  gateway<T>(admin, "analysis_v2_run", {
    actor,
    operation,
    run_id: runId ?? null,
    input,
    request_key: key ?? null,
  });

export function uuid(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  )
    throw new ApiError(400, "A valid analysis identifier is required", "invalid_identifier");
  return value;
}

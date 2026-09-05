import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuthenticatedCaller } from "../lib/supabase";
import { requirePlatformAdmin } from "../lib/supabase";
import type { SourceQuestion } from "../../shared/analysis/contracts";
import { ApiError, json, readJsonObject, requireMethod, requireSameOrigin } from "../lib/http";
import { mappingProposal } from "../services/analysis-v2/requests";
import { gateway, uuid } from "../services/analysis-v2/repository";

export async function mappingRoute(
  request: Request,
  admin: SupabaseClient,
  caller: AuthenticatedCaller,
) {
  requirePlatformAdmin(caller);
  requireMethod(request, "GET", "POST");
  requireSameOrigin(request);
  const call = <T>(operation: string, target?: string, input: unknown = {}) =>
    gateway<T>(admin, "analysis_v2_mapping", {
      actor: caller.user.id,
      operation,
      target: target ?? null,
      input,
    });
  const catalog = await call<{
    questions: SourceQuestion[];
    proposals: Array<{ id: string; payload: Record<string, unknown> }>;
  }>("catalog");
  if (request.method === "GET") return json(catalog);
  const body = await readJsonObject(request, 100000);
  if (body.operation === "propose")
    return json(await call("propose", undefined, mappingProposal(body, catalog.questions)), 201);
  if (body.operation === "publish") {
    const id = uuid(body.id),
      proposal = catalog.proposals.find((p) => p.id === id);
    if (!proposal) throw new ApiError(404, "Mapping proposal unavailable", "mapping_unavailable");
    return json(await call("publish", id, mappingProposal(proposal.payload, catalog.questions)));
  }
  if (body.operation === "revoke")
    return json(
      await call("revoke", uuid(body.id), {
        reason: typeof body.reason === "string" ? body.reason.slice(0, 500) : "",
      }),
    );
  throw new ApiError(400, "Unknown mapping operation", "invalid_operation");
}

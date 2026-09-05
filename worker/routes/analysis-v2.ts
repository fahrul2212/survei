import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuthenticatedCaller } from "../lib/supabase";
import type { AnalysisRun } from "../../shared/analysis/contracts";
import { analyze } from "../../shared/analysis/pipeline";
import { json, readJsonObject, requireMethod, requireSameOrigin } from "../lib/http";
import { analysisRequest } from "../services/analysis-v2/requests";
import { runGateway, uuid, type Inputs } from "../services/analysis-v2/repository";
import { loadSettings } from "../services/governance";

export async function analysisV2Route(
  request: Request,
  admin: SupabaseClient,
  caller: AuthenticatedCaller,
): Promise<Response> {
  const started = performance.now();
  requireMethod(request, "POST", "GET", "DELETE");
  requireSameOrigin(request);
  const path = new URL(request.url).pathname.split("/").filter(Boolean),
    id = path[3];
  if (id) requireMethod(request, "GET", "DELETE");
  if (request.method !== "POST")
    return json(
      await runGateway<AnalysisRun>(
        admin,
        caller.user.id,
        request.method === "GET" ? "read" : "cancel",
        uuid(id),
      ),
    );
  const input = analysisRequest(await readJsonObject(request, 16000));
  const key = uuid(request.headers.get("Idempotency-Key"));
  let run = await runGateway<AnalysisRun>(admin, caller.user.id, "create", undefined, input, key);
  if (run.state !== "computing") return json(run);
  try {
    const [sources, settings] = await Promise.all([
      runGateway<Inputs>(admin, caller.user.id, "inputs", run.id),
      loadSettings(admin),
    ]);
    const result = analyze(sources.packs, sources.bindings, sources.request, {
      ownOrganizationId: sources.organizationId,
      minimum: Number(settings.benchmark_minimum),
      now: sources.createdAt,
    });
    run = await runGateway<AnalysisRun>(admin, caller.user.id, "complete", run.id, result);
    console.info(
      JSON.stringify({
        event: "analysis_complete",
        runId: run.id,
        engine: result.engineVersion,
        elapsedMs: Math.round(performance.now() - started),
        facts: result.facts.length,
        charts: result.charts.length,
        needsReview: result.coverage.needsReview,
      }),
    );
    return json(run);
  } catch (error) {
    const completed = await runGateway<AnalysisRun>(admin, caller.user.id, "read", run.id).catch(
      () => null,
    );
    if (completed?.state === "ready" && !completed.invalidated) return json(completed);
    await runGateway(admin, caller.user.id, "fail", run.id).catch(() => undefined);
    throw error;
  }
}

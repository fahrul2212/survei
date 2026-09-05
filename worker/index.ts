import { estimateRoute } from "./routes/estimate";
import { modelsRoute, settingsRoute, testProviderRoute } from "./routes/settings";
import { summaryRoute } from "./routes/summary";
import { usageRoute } from "./routes/usage";
import { analysisV2Route } from "./routes/analysis-v2";
import { mappingRoute } from "./routes/analysis-mappings";
import { narrativeRoute } from "./routes/analysis-narrative";
import { questionBenchmarkRoute } from "./routes/benchmark";
import { errorResponse, json, withSecurityHeaders } from "./lib/http";
import { adminClient, requireCaller, requirePlatformAdmin } from "./lib/supabase";

async function api(request: Request, env: Env): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    const caller = await requireCaller(request, env);
    const admin = adminClient(env);
    const path = new URL(request.url).pathname;
    if (path === "/api/v2/analysis/mappings") return await mappingRoute(request, admin, caller);
    if (/^\/api\/v2\/analysis\/[0-9a-f-]+\/narrative$/.test(path))
      return await narrativeRoute(request, env, admin, caller);
    if (/^\/api\/v2\/analysis(?:\/[0-9a-f-]+)?$/.test(path))
      return await analysisV2Route(request, admin, caller);

    if (path === "/api/ai/summary") return await summaryRoute(request, env, admin, caller);
    if (path === "/api/ai/explore" || path === "/api/analysis")
      return json(
        {
          error:
            "Refresh the portal and build a new comparison. This analysis version has been replaced by reviewed, version-aware comparisons.",
          code: "analysis_version_retired",
        },
        410,
      );
    if (path === "/api/benchmark/questions")
      return await questionBenchmarkRoute(request, admin, caller);

    requirePlatformAdmin(caller);
    if (path === "/api/ai/settings") return await settingsRoute(request, env, admin, caller.user);
    if (path === "/api/ai/settings/test") return await testProviderRoute(request, env, admin);
    if (path === "/api/ai/models") return await modelsRoute(request, env, admin);
    if (path === "/api/ai/usage") return await usageRoute(request, admin);
    if (path === "/api/ai/estimate") return await estimateRoute(request, admin);
    return json({ error: "API route not found", code: "not_found", requestId }, 404);
  } catch (error) {
    return errorResponse(error, requestId);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path.startsWith("/api/")) return api(request, env);
    return withSecurityHeaders(await env.ASSETS.fetch(request));
  },
} satisfies ExportedHandler<Env>;

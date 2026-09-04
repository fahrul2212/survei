import { estimateRoute } from "./routes/estimate";
import { settingsRoute, testProviderRoute } from "./routes/settings";
import { summaryRoute } from "./routes/summary";
import { usageRoute } from "./routes/usage";
import { errorResponse, json, withSecurityHeaders } from "./lib/http";
import { adminClient, requireCaller, requirePlatformAdmin } from "./lib/supabase";

async function api(request: Request, env: Env): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    const caller = await requireCaller(request, env);
    const admin = adminClient(env);
    const path = new URL(request.url).pathname;

    if (path === "/api/ai/summary") return summaryRoute(request, env, admin, caller);

    requirePlatformAdmin(caller);
    if (path === "/api/ai/settings") return settingsRoute(request, env, admin, caller.user);
    if (path === "/api/ai/settings/test") return testProviderRoute(request, env, admin);
    if (path === "/api/ai/usage") return usageRoute(request, admin);
    if (path === "/api/ai/estimate") return estimateRoute(request, admin);
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

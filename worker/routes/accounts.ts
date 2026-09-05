import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuthenticatedCaller } from "../lib/supabase";
import { requirePlatformAdmin } from "../lib/supabase";
import { accountInput } from "../../shared/account-management";
import { ApiError, json, readJsonObject, requireMethod, requireSameOrigin } from "../lib/http";
import { uuid } from "../services/analysis-v2/repository";

export async function accountsRoute(
  request: Request,
  admin: SupabaseClient,
  caller: AuthenticatedCaller,
) {
  requirePlatformAdmin(caller);
  requireMethod(request, "GET", "POST");
  requireSameOrigin(request);
  const call = async <T>(operation: string, input: unknown, target: string | null = null) => {
    const { data, error } = await admin.rpc("manage_portal_accounts", {
      actor: caller.user.id,
      operation,
      target,
      input,
    });
    if (error)
      throw new ApiError(
        error.code === "42501" ? 403 : 409,
        error.message,
        "account_operation_failed",
      );
    return data as T;
  };
  if (request.method === "GET") {
    const params = new URL(request.url).searchParams;
    const page = Number(params.get("page") ?? 0);
    if (!Number.isInteger(page) || page < 0 || page > 10000)
      throw new ApiError(400, "Invalid account page");
    return json(await call("list", { search: params.get("search") ?? "", page }));
  }
  const body = await readJsonObject(request, 4000);
  if (body.operation === "resend") {
    const { data, error } = await admin.functions.invoke("invite-internal-user", {
      headers: { Authorization: `Bearer ${caller.token}` },
      body: { operation: "resend", id: uuid(body.id) },
    });
    if (error || data?.error)
      throw new ApiError(
        502,
        "Invitation delivery could not be confirmed. Check email delivery before trying again.",
      );
    return json({ invited: true });
  }
  const invite = body.operation === "invite";
  if (!invite && body.operation !== "update") throw new ApiError(400, "Unknown account action");
  let input;
  try {
    input = accountInput(body, invite);
  } catch {
    throw new ApiError(400, "Provide a valid name, role and account details.");
  }
  if (!invite) return json(await call("update", input, uuid(body.id)));
  const exists = await call<{ exists: boolean }>("lookup", { email: input.email });
  if (exists.exists)
    throw new ApiError(
      409,
      "This account already exists. Find it in Accounts to review its access.",
    );
  const { data, error } = await admin.functions.invoke("invite-internal-user", {
    headers: { Authorization: `Bearer ${caller.token}` },
    body: input,
  });
  if (error || data?.error)
    throw new ApiError(
      502,
      "Invitation could not be confirmed. Check Accounts and email delivery before retrying.",
    );
  return json({ invited: true }, 201);
}

export async function internalCatalog(
  request: Request,
  admin: SupabaseClient,
  caller: AuthenticatedCaller,
) {
  requireMethod(request, "GET");
  if (!caller.platformAdmin && caller.user.app_metadata?.role !== "platform_analyst")
    throw new ApiError(403, "Internal analysis access required");
  const [versions, organizations] = await Promise.all([
    admin
      .from("survey_versions")
      .select("id,name,reporting_year,status,opens_at,closes_at,published_at")
      .order("reporting_year", { ascending: false })
      .limit(1000),
    admin
      .from("organizations")
      .select("id,name,slug,is_active")
      .eq("is_active", true)
      .order("name")
      .limit(1000),
  ]);
  if (versions.error || organizations.error)
    throw new ApiError(502, "Unable to load analysis scope");
  if (versions.data.length === 1000 || organizations.data.length === 1000)
    throw new ApiError(
      422,
      "The analysis directory exceeds its supported size. Contact an administrator.",
    );
  return json({ versions: versions.data, organizations: organizations.data });
}

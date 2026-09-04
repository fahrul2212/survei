import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { ApiError } from "./http";

export type AuthenticatedCaller = {
  token: string;
  user: User;
  platformAdmin: boolean;
};

export function adminClient(env: Env): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}

export async function requireCaller(request: Request, env: Env): Promise<AuthenticatedCaller> {
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    throw new ApiError(401, "Authentication required", "authentication_required");
  }
  const token = authorization.slice(7).trim();
  if (!token) throw new ApiError(401, "Authentication required", "authentication_required");
  const authClient = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data.user) throw new ApiError(401, "Session is no longer valid", "invalid_session");
  return {
    token,
    user: data.user,
    platformAdmin: data.user.app_metadata?.role === "platform_admin",
  };
}

export function requirePlatformAdmin(caller: AuthenticatedCaller): void {
  if (!caller.platformAdmin) throw new ApiError(403, "Administrator access required", "administrator_required");
}

export function databaseError(error: { message?: string } | null, fallback: string): ApiError {
  console.error(JSON.stringify({ message: "Supabase operation failed", databaseError: error?.message ?? fallback }));
  return new ApiError(502, fallback, "database_error");
}

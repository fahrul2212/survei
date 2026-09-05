import { supabase } from "./supabase";
import { portalFetch, requestSessionRecovery } from "./session-recovery";

export class PortalApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
  }
}

/** Mutations are never retried automatically: their first attempt may have succeeded. */
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  if (!supabase) throw new Error("Portal connection is not configured.");
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) {
    requestSessionRecovery();
    throw new PortalApiError(
      "Your session has expired. Please sign in again.",
      401,
      "session_expired",
    );
  }
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${data.session.access_token}`);
  if (init?.body) headers.set("Content-Type", "application/json");
  const timeout = AbortSignal.timeout(90000);
  let response: Response;
  try {
    response = await portalFetch(path, {
      ...init,
      headers,
      signal: init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout,
    });
  } catch {
    throw new PortalApiError(
      "The connection was interrupted. Check the latest status before trying again.",
      0,
      "connection_interrupted",
    );
  }
  const body: unknown = await response.json().catch(() => null);
  const details = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  if (!response.ok)
    throw new PortalApiError(
      typeof details.error === "string"
        ? details.error
        : "The portal could not complete this request.",
      response.status,
      typeof details.code === "string" ? details.code : "request_failed",
    );
  if (body === null)
    throw new PortalApiError(
      "The server returned an incomplete response. Check the latest status.",
      502,
      "invalid_response",
    );
  return body as T;
}

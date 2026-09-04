const API_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
} as const;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code = "request_failed",
  ) {
    super(message);
  }
}

export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: API_HEADERS });
}

export function errorResponse(error: unknown, requestId: string): Response {
  if (error instanceof ApiError) {
    return json({ error: error.message, code: error.code, requestId }, error.status);
  }
  console.error(JSON.stringify({ message: "unhandled API error", requestId, error: error instanceof Error ? error.message : String(error) }));
  return json({ error: "Internal server error", code: "internal_error", requestId }, 500);
}

export function requireMethod(request: Request, ...allowed: string[]): void {
  if (!allowed.includes(request.method)) throw new ApiError(405, "Method not allowed", "method_not_allowed");
}

export function requireSameOrigin(request: Request): void {
  const origin = request.headers.get("Origin");
  if (origin && origin !== new URL(request.url).origin) {
    throw new ApiError(403, "Cross-origin request rejected", "origin_rejected");
  }
}

export async function readJsonObject(request: Request, maximumBytes = 24_000): Promise<Record<string, unknown>> {
  const contentType = request.headers.get("Content-Type")?.split(";", 1)[0]?.trim();
  if (contentType !== "application/json") throw new ApiError(415, "Content-Type must be application/json", "invalid_content_type");
  const declaredSize = Number(request.headers.get("Content-Length") ?? 0);
  if (declaredSize > maximumBytes) throw new ApiError(413, "Request body is too large", "body_too_large");
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > maximumBytes) {
    throw new ApiError(413, "Request body is too large", "body_too_large");
  }
  try {
    const parsed: unknown = JSON.parse(body);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    return parsed as Record<string, unknown>;
  } catch {
    throw new ApiError(400, "Request body must be a JSON object", "invalid_json");
  }
}

export function withSecurityHeaders(response: Response): Response {
  const secured = new Response(response.body, response);
  secured.headers.set("Content-Security-Policy", [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  ].join("; "));
  secured.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  secured.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  secured.headers.set("X-Content-Type-Options", "nosniff");
  secured.headers.set("X-Frame-Options", "DENY");
  return secured;
}

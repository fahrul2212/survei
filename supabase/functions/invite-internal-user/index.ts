import { adminClient, json, preflight, requireUser } from "../_shared/supabase.ts";
import { InvitationError, sendWithResend } from "../_shared/invitations.ts";
import { accountInput } from "../../../shared/account-management.ts";

Deno.serve(async (request) => {
  const options = preflight(request);
  if (options) return options;
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const caller = await requireUser(request);
    if (caller.app_metadata?.role !== "platform_admin")
      return json({ error: "Administrator required" }, 403);
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > 4000)
      return json({ error: "Invitation is too large" }, 413);
    const admin = adminClient();
    let input;
    let resend = false;
    let resendId: string | null = null;
    try {
      const body = JSON.parse(raw);
      if (body.operation === "resend") {
        if (typeof body.id !== "string" || !/^[0-9a-f-]{36}$/i.test(body.id))
          return json({ error: "Invalid account" }, 400);
        const found = await admin.auth.admin.getUserById(body.id);
        const user = found.data.user;
        if (
          found.error ||
          !user ||
          user.email_confirmed_at ||
          user.app_metadata?.portal_disabled === true ||
          !["platform_admin", "platform_analyst"].includes(user.app_metadata?.role)
        )
          return json({ error: "Only pending active internal invitations can be resent" }, 409);
        input = accountInput(
          { name: user.user_metadata.full_name, email: user.email, role: user.app_metadata.role },
          true,
        );
        resend = true;
        resendId = user.id;
      } else input = accountInput(body, true);
    } catch {
      return json({ error: "Provide a valid name, email and internal role" }, 400);
    }
    const lookup = await admin.rpc("manage_portal_accounts", {
      actor: caller.id,
      operation: "lookup",
      input: { email: input.email },
    });
    if (lookup.error) return json({ error: "Unable to verify account directory" }, 403);
    if (lookup.data.exists && !resend)
      return json({ error: "This account already exists. Manage its access from Accounts." }, 409);
    const since = new Date(Date.now() - 60000).toISOString();
    const rate = await admin
      .from("audit_events")
      .select("id", { count: "exact", head: true })
      .eq("actor_user_id", caller.id)
      .in("event_type", ["account.updated", "account.invitation_requested"])
      .gte("created_at", since);
    if (rate.error) return json({ error: "Unable to verify invitation limit" }, 503);
    if ((rate.count ?? 0) >= 5)
      return json({ error: "Wait one minute before inviting another colleague." }, 429);
    await sendWithResend(
      admin,
      { email: input.email, fullName: input.name },
      "STICA internal team",
      new Date(Date.now() + 3600000).toISOString(),
      async (user) => {
        if (resend) {
          if (user.id !== resendId)
            throw new InvitationError(409, "Invitation account changed. Refresh Accounts.");
          const authorized = await admin.rpc("manage_portal_accounts", {
            actor: caller.id,
            operation: "lookup",
            input: { email: input.email },
          });
          if (authorized.error) throw new InvitationError(403, "Administrator access changed.");
          const audit = await admin
            .from("audit_events")
            .insert({
              actor_user_id: caller.id,
              event_type: "account.invitation_requested",
              entity_type: "user",
              entity_id: user.id,
              details: { resend: true },
            });
          if (audit.error) throw new InvitationError(503, "Unable to record invitation request.");
          return;
        }
        const result = await admin.rpc("manage_portal_accounts", {
          actor: caller.id,
          operation: "update",
          target: user.id,
          input,
        });
        if (result.error)
          throw new InvitationError(
            409,
            "Account created but internal access could not be assigned. Review it in Accounts before retrying.",
          );
      },
    );
    return json({ invited: true }, 201);
  } catch (error) {
    if (error instanceof Response)
      return json({ error: "Authentication or active access required" }, error.status);
    return json(
      {
        error:
          error instanceof InvitationError
            ? error.message
            : "Invitation could not be delivered. Check Accounts before retrying.",
      },
      error instanceof InvitationError ? error.status : 502,
    );
  }
});

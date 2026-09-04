import { adminClient, json, preflight, requireUser } from "../_shared/supabase.ts";
import { InvitationError, invitationInput, inviteCompanyUser, requireInvitationManager } from "../_shared/invitations.ts";

Deno.serve(async (req) => {
  const options = preflight(req); if (options) return options;
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const caller = await requireUser(req);
    const admin = adminClient();
    const input = invitationInput(await req.json());
    await requireInvitationManager(admin, caller, input.organizationId);
    const result = await inviteCompanyUser(admin, caller, input);
    await admin.from("audit_events").insert({
      organization_id: input.organizationId,
      actor_user_id: caller.id,
      event_type: result.linked ? "member.linked" : "member.invited",
      entity_type: "user_invitation",
      entity_id: result.invitationId ?? result.user.id,
      details: { email: input.email, role: input.role },
    });
    return json({
      user: { id: result.user.id, email: result.user.email },
      role: input.role,
      invited: result.invited,
      linked: result.linked,
      invitationId: result.invitationId,
    });
  } catch (error) {
    if (error instanceof InvitationError) return json({ error: error.message }, error.status);
    return json({ error: "Unable to send team invitation" }, 500);
  }
});

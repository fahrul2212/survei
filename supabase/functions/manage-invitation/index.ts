import { adminClient, json, preflight, requireUser } from "../_shared/supabase.ts";
import { InvitationError, invitationInput, inviteCompanyUser, requireInvitationManager } from "../_shared/invitations.ts";

type ActionPayload = { action?: "complete" | "resend" | "revoke"; invitationId?: string };

Deno.serve(async (req) => {
  const options = preflight(req); if (options) return options;
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const caller = await requireUser(req);
    const admin = adminClient();
    const payload = (await req.json()) as ActionPayload;
    const invitationId = typeof payload.invitationId === "string" ? payload.invitationId : "";
    if (!invitationId || !payload.action) throw new InvitationError(400, "Invitation and action are required");

    const { data: invitation, error } = await admin.from("user_invitations").select("*").eq("id", invitationId).single();
    if (error || !invitation) throw new InvitationError(404, "Invitation not found");

    if (payload.action === "complete") {
      if (invitation.auth_user_id !== caller.id) throw new InvitationError(403, "This invitation belongs to another account");
      if (invitation.status !== "pending") throw new InvitationError(409, "This invitation is no longer pending");
      if (new Date(invitation.expires_at).getTime() <= Date.now()) {
        await admin.from("user_invitations").update({ status: "expired" }).eq("id", invitation.id);
        throw new InvitationError(410, "This invitation has expired. Ask an administrator to resend it.");
      }
      const profile = await admin.from("profiles").upsert({ user_id: caller.id, full_name: invitation.full_name });
      if (profile.error) throw new InvitationError(400, profile.error.message);
      const membership = await admin.from("organization_members").upsert({
        organization_id: invitation.organization_id, user_id: caller.id, role: invitation.role,
      }, { onConflict: "organization_id,user_id" });
      if (membership.error) throw new InvitationError(400, membership.error.message);
      const metadata = await admin.auth.admin.updateUserById(caller.id, {
        app_metadata: { ...(caller.app_metadata ?? {}), role: "company_user" },
        user_metadata: { ...(caller.user_metadata ?? {}), full_name: invitation.full_name },
      });
      if (metadata.error) throw new InvitationError(400, metadata.error.message);
      const completed = await admin.from("user_invitations").update({
        status: "accepted", accepted_at: new Date().toISOString(), last_error: null,
      }).eq("id", invitation.id).eq("status", "pending");
      if (completed.error) throw new InvitationError(400, completed.error.message);
      await admin.from("audit_events").insert({
        organization_id: invitation.organization_id, actor_user_id: caller.id,
        event_type: "invitation.accepted", entity_type: "user_invitation", entity_id: invitation.id,
        details: { role: invitation.role },
      });
      return json({ status: "accepted" });
    }

    await requireInvitationManager(admin, caller, invitation.organization_id);
    if (payload.action === "revoke") {
      if (!new Set(["pending", "expired"]).has(invitation.status)) {
        throw new InvitationError(409, "Only pending or expired invitations can be revoked");
      }
      const revoked = await admin.from("user_invitations").update({
        status: "revoked", revoked_at: new Date().toISOString(), last_error: null,
      }).eq("id", invitation.id);
      if (revoked.error) throw new InvitationError(400, revoked.error.message);
      await admin.from("audit_events").insert({
        organization_id: invitation.organization_id, actor_user_id: caller.id,
        event_type: "invitation.revoked", entity_type: "user_invitation", entity_id: invitation.id, details: {},
      });
      return json({ status: "revoked" });
    }

    if (!new Set(["pending", "expired"]).has(invitation.status)) {
      throw new InvitationError(409, "Only pending or expired invitations can be resent");
    }
    if (Number(invitation.sent_count) >= 10) throw new InvitationError(429, "Invitation resend limit reached");
    if (Date.now() - new Date(invitation.last_sent_at).getTime() < 60_000) {
      throw new InvitationError(429, "Please wait one minute before resending this invitation");
    }
    const input = invitationInput({
      organizationId: invitation.organization_id, email: invitation.email,
      fullName: invitation.full_name, role: invitation.role,
    });
    const result = await inviteCompanyUser(admin, caller, input, invitation.id);
    await admin.from("audit_events").insert({
      organization_id: invitation.organization_id, actor_user_id: caller.id,
      event_type: "invitation.resent", entity_type: "user_invitation", entity_id: invitation.id,
      details: { sent_count: Number(invitation.sent_count) + 1 },
    });
    return json({ status: "pending", invitationId: result.invitationId });
  } catch (error) {
    if (error instanceof InvitationError) return json({ error: error.message }, error.status);
    return json({ error: "Unable to manage invitation" }, 500);
  }
});

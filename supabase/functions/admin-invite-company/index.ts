import { adminClient, json, preflight, requireUser } from "../_shared/supabase.ts";
import { cleanText, InvitationError, invitationInput, inviteCompanyUser } from "../_shared/invitations.ts";

type InvitePayload = {
  companyName: string;
  companySlug: string;
  email: string;
  fullName: string;
  externalReference?: string;
  role?: "viewer" | "member" | "company_admin";
};

Deno.serve(async (req) => {
  const options = preflight(req); if (options) return options;
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const caller = await requireUser(req);
    if (caller.app_metadata?.role !== "platform_admin") {
      return json({ error: "Administrator access required" }, 403);
    }
    const payload = (await req.json()) as Partial<InvitePayload>;
    const companyName = cleanText(payload.companyName, 200);
    const companySlug = cleanText(payload.companySlug, 120).toLowerCase();
    if (!companyName || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(companySlug)) {
      return json({ error: "A valid company name and slug are required" }, 400);
    }

    const admin = adminClient();
    const { data: organization, error: organizationError } = await admin.from("organizations").upsert({
      name: companyName,
      slug: companySlug,
      contact_email: cleanText(payload.email, 320).toLowerCase(),
      external_reference: cleanText(payload.externalReference, 160) || null,
      is_active: true,
    }, { onConflict: "slug" }).select("id,name,slug").single();
    if (organizationError || !organization) {
      return json({ error: organizationError?.message ?? "Unable to create company" }, 400);
    }

    const input = invitationInput({
      organizationId: organization.id,
      email: payload.email,
      fullName: payload.fullName,
      role: payload.role ?? "company_admin",
    });
    const result = await inviteCompanyUser(admin, caller, input);
    await admin.from("audit_events").insert({
      organization_id: organization.id,
      actor_user_id: caller.id,
      event_type: result.linked ? "member.linked" : "member.invited",
      entity_type: "user_invitation",
      entity_id: result.invitationId ?? result.user.id,
      details: { email: input.email, role: input.role },
    });
    return json({
      organization,
      user: { id: result.user.id, email: result.user.email },
      invited: result.invited,
      linked: result.linked,
      invitationId: result.invitationId,
    });
  } catch (error) {
    if (error instanceof InvitationError) return json({ error: error.message }, error.status);
    return json({ error: "Unable to send company invitation" }, 500);
  }
});

import { adminClient, json, preflight, requireUser } from "../_shared/supabase.ts";

type Payload = {
  organizationId: number;
  email: string;
  fullName: string;
  role: "viewer" | "member" | "company_admin";
  redirectTo?: string;
};

const clean = (value: unknown) => typeof value === "string" ? value.trim() : "";

Deno.serve(async (req) => {
    const options = preflight(req); if (options) return options;
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
    let caller;
    try { caller = await requireUser(req); } catch { return json({ error: "Authentication required" }, 401); }
    const admin = adminClient();
    const payload = (await req.json()) as Partial<Payload>;
    const organizationId = Number(payload.organizationId);
    const email = clean(payload.email).toLowerCase();
    const fullName = clean(payload.fullName);
    const role = payload.role ?? "member";
    const callerId = caller.id;
    const platformAdmin = caller.app_metadata?.role === "platform_admin";

    if (!Number.isInteger(organizationId) || organizationId <= 0 || !email || !fullName) {
      return json({ error: "Company, name, and email are required" }, 400);
    }
    if (!["viewer", "member", "company_admin"].includes(role)) {
      return json({ error: "Invalid company role" }, 400);
    }

    if (!platformAdmin) {
      const { data: membership } = await admin
        .from("organization_members")
        .select("role")
        .eq("organization_id", organizationId)
        .eq("user_id", callerId)
        .maybeSingle();
      if (membership?.role !== "company_admin") {
        return json({ error: "Company administrator access required" }, 403);
      }
    }

    const { data: userPage, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (listError) return json({ error: listError.message }, 400);
    let user = userPage.users.find((candidate) => candidate.email?.toLowerCase() === email);
    let invited = false;

    if (!user) {
      const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
        data: { full_name: fullName },
        redirectTo: clean(payload.redirectTo) || undefined,
      });
      if (error || !data.user) return json({ error: error?.message ?? "Unable to invite user" }, 400);
      user = data.user;
      invited = true;
    }

    const { error: metadataError } = await admin.auth.admin.updateUserById(user.id, {
      app_metadata: { ...(user.app_metadata ?? {}), role: "company_user" },
      user_metadata: { ...(user.user_metadata ?? {}), full_name: fullName },
    });
    if (metadataError) return json({ error: metadataError.message }, 400);

    const { error: profileError } = await admin.from("profiles").upsert({ user_id: user.id, full_name: fullName });
    if (profileError) return json({ error: profileError.message }, 400);
    const { error: memberError } = await admin.from("organization_members").upsert(
      { organization_id: organizationId, user_id: user.id, role },
      { onConflict: "organization_id,user_id" },
    );
    if (memberError) return json({ error: memberError.message }, 400);

    await admin.from("audit_events").insert({
      organization_id: organizationId,
      actor_user_id: callerId,
      event_type: invited ? "member.invited" : "member.added",
      entity_type: "organization_member",
      entity_id: user.id,
      details: { email, role },
    });
    return json({ user: { id: user.id, email }, invited, role });
});

import { adminClient, json, preflight, requireUser } from "../_shared/supabase.ts";

type InvitePayload = {
  companyName: string;
  companySlug: string;
  email: string;
  fullName: string;
  externalReference?: string;
  redirectTo?: string;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

 Deno.serve(async (req) => {
    const options = preflight(req); if (options) return options;
    if (req.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }

    let caller;
    try { caller = await requireUser(req); } catch { return json({ error: "Authentication required" }, 401); }
    const admin = adminClient();
    const appMetadata = caller.app_metadata as { role?: string } | undefined;
    if (appMetadata?.role !== "platform_admin") {
      return json({ error: "Administrator access required" }, 403);
    }

    const payload = (await req.json()) as Partial<InvitePayload>;
    const companyName = clean(payload.companyName);
    const companySlug = clean(payload.companySlug).toLowerCase();
    const email = clean(payload.email).toLowerCase();
    const fullName = clean(payload.fullName);

    if (!companyName || !companySlug || !email || !fullName) {
      return json(
        { error: "Company name, slug, contact name, and email are required" },
        400,
      );
    }

    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(companySlug)) {
      return json({ error: "Company slug is invalid" }, 400);
    }

    const { data: organization, error: organizationError } = await admin
      .from("organizations")
      .upsert(
        {
          name: companyName,
          slug: companySlug,
          contact_email: email,
          external_reference: clean(payload.externalReference) || null,
          is_active: true,
        },
        { onConflict: "slug" },
      )
      .select("id, name, slug")
      .single();

    if (organizationError || !organization) {
      return json(
        { error: organizationError?.message ?? "Unable to create company" },
        400,
      );
    }

    const { data: userPage, error: listError } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });

    if (listError) {
      return json({ error: listError.message }, 400);
    }

    let user = userPage.users.find((candidate) => candidate.email?.toLowerCase() === email);
    let invited = false;

    if (!user) {
      const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(
        email,
        {
          data: { full_name: fullName },
          redirectTo: clean(payload.redirectTo) || undefined,
        },
      );

      if (inviteError || !inviteData.user) {
        return json(
          { error: inviteError?.message ?? "Unable to invite company user" },
          400,
        );
      }

      user = inviteData.user;
      invited = true;
    }

    const existingAppMetadata = (user.app_metadata ?? {}) as Record<string, unknown>;
    const { error: metadataError } = await admin.auth.admin.updateUserById(user.id, {
      app_metadata: { ...existingAppMetadata, role: "company_user" },
      user_metadata: { ...(user.user_metadata ?? {}), full_name: fullName },
    });

    if (metadataError) {
      return json({ error: metadataError.message }, 400);
    }

    const { error: profileError } = await admin.from("profiles").upsert({
      user_id: user.id,
      full_name: fullName,
    });

    if (profileError) {
      return json({ error: profileError.message }, 400);
    }

    const { error: membershipError } = await admin.from("organization_members").upsert(
      {
        organization_id: organization.id,
        user_id: user.id,
        role: "company_admin",
      },
      { onConflict: "organization_id,user_id" },
    );

    if (membershipError) {
      return json({ error: membershipError.message }, 400);
    }

    return json({
      organization,
      user: { id: user.id, email: user.email },
      invited,
    });
});

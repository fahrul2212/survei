import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

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

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method !== "POST") {
      return Response.json({ error: "Method not allowed" }, { status: 405 });
    }

    const appMetadata = ctx.jwtClaims?.app_metadata as { role?: string } | undefined;
    if (appMetadata?.role !== "platform_admin") {
      return Response.json({ error: "Administrator access required" }, { status: 403 });
    }

    const payload = (await req.json()) as Partial<InvitePayload>;
    const companyName = clean(payload.companyName);
    const companySlug = clean(payload.companySlug).toLowerCase();
    const email = clean(payload.email).toLowerCase();
    const fullName = clean(payload.fullName);

    if (!companyName || !companySlug || !email || !fullName) {
      return Response.json(
        { error: "Company name, slug, contact name, and email are required" },
        { status: 400 },
      );
    }

    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(companySlug)) {
      return Response.json({ error: "Company slug is invalid" }, { status: 400 });
    }

    const { data: organization, error: organizationError } = await ctx.supabaseAdmin
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
      return Response.json(
        { error: organizationError?.message ?? "Unable to create company" },
        { status: 400 },
      );
    }

    const { data: userPage, error: listError } = await ctx.supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });

    if (listError) {
      return Response.json({ error: listError.message }, { status: 400 });
    }

    let user = userPage.users.find((candidate) => candidate.email?.toLowerCase() === email);
    let invited = false;

    if (!user) {
      const { data: inviteData, error: inviteError } = await ctx.supabaseAdmin.auth.admin.inviteUserByEmail(
        email,
        {
          data: { full_name: fullName },
          redirectTo: clean(payload.redirectTo) || undefined,
        },
      );

      if (inviteError || !inviteData.user) {
        return Response.json(
          { error: inviteError?.message ?? "Unable to invite company user" },
          { status: 400 },
        );
      }

      user = inviteData.user;
      invited = true;
    }

    const existingAppMetadata = (user.app_metadata ?? {}) as Record<string, unknown>;
    const { error: metadataError } = await ctx.supabaseAdmin.auth.admin.updateUserById(user.id, {
      app_metadata: { ...existingAppMetadata, role: "company_user" },
      user_metadata: { ...(user.user_metadata ?? {}), full_name: fullName },
    });

    if (metadataError) {
      return Response.json({ error: metadataError.message }, { status: 400 });
    }

    const { error: profileError } = await ctx.supabaseAdmin.from("profiles").upsert({
      user_id: user.id,
      full_name: fullName,
    });

    if (profileError) {
      return Response.json({ error: profileError.message }, { status: 400 });
    }

    const { error: membershipError } = await ctx.supabaseAdmin.from("organization_members").upsert(
      {
        organization_id: organization.id,
        user_id: user.id,
        role: "company_admin",
      },
      { onConflict: "organization_id,user_id" },
    );

    if (membershipError) {
      return Response.json({ error: membershipError.message }, { status: 400 });
    }

    return Response.json({
      organization,
      user: { id: user.id, email: user.email },
      invited,
    });
  }),
};

import type { SupabaseClient, User } from "npm:@supabase/supabase-js@2.112.4";
import { renderEmail } from "./email-templates.ts";

export type CompanyRole = "viewer" | "member" | "company_admin";

export type InvitationInput = {
  organizationId: number;
  email: string;
  fullName: string;
  role: CompanyRole;
};

const INVITATION_ROLES = new Set<CompanyRole>(["viewer", "member", "company_admin"]);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class InvitationError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function cleanText(value: unknown, maximum = 200): string {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

export function invitationInput(value: Partial<InvitationInput>): InvitationInput {
  const organizationId = Number(value.organizationId);
  const email = cleanText(value.email, 320).toLowerCase();
  const fullName = cleanText(value.fullName, 160);
  const role = value.role ?? "member";
  if (!Number.isInteger(organizationId) || organizationId <= 0 || !EMAIL_PATTERN.test(email) || !fullName) {
    throw new InvitationError(400, "Company, name, and a valid email are required");
  }
  if (!INVITATION_ROLES.has(role)) throw new InvitationError(400, "Invalid company role");
  return { organizationId, email, fullName, role };
}

export async function requireInvitationManager(
  admin: SupabaseClient,
  caller: User,
  organizationId: number,
): Promise<void> {
  if (caller.app_metadata?.role === "platform_admin") return;
  const { data, error } = await admin.from("organization_members").select("role")
    .eq("organization_id", organizationId).eq("user_id", caller.id).maybeSingle();
  if (error || data?.role !== "company_admin") {
    throw new InvitationError(403, "Company administrator access required");
  }
}

async function findUserByEmail(admin: SupabaseClient, email: string): Promise<User | null> {
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new InvitationError(400, error.message);
    const match = data.users.find((user) => user.email?.toLowerCase() === email);
    if (match) return match;
    if (data.users.length < 1000) return null;
  }
  throw new InvitationError(503, "Unable to safely search the user directory");
}

function portalUrl(): string {
  const configured = cleanText(Deno.env.get("PORTAL_URL"), 500);
  let parsed: URL;
  try { parsed = new URL(configured); } catch { throw new InvitationError(503, "PORTAL_URL is not configured"); }
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
    throw new InvitationError(503, "PORTAL_URL must use HTTPS");
  }
  parsed.pathname = "/";
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString();
}

function expiryTime(): string {
  const configured = Number(Deno.env.get("INVITATION_EXPIRY_MINUTES") ?? "60");
  const minutes = Number.isFinite(configured) ? Math.min(10_080, Math.max(15, Math.round(configured))) : 60;
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

async function enforceInvitationRate(admin: SupabaseClient, callerId: string): Promise<void> {
  const since = new Date(Date.now() - 60_000).toISOString();
  const { count, error } = await admin.from("user_invitations").select("id", { count: "exact", head: true })
    .eq("invited_by", callerId).gte("last_sent_at", since);
  if (error) throw new InvitationError(400, error.message);
  if ((count ?? 0) >= 5) throw new InvitationError(429, "Too many invitations. Please wait one minute.");
}

async function sendWithResend(
  admin: SupabaseClient,
  input: InvitationInput,
  companyName: string,
  expiresAt: string,
): Promise<{ user: User; method: "resend" }> {
  const apiKey = Deno.env.get("RESEND_API_KEY") ?? "";
  const sender = cleanText(Deno.env.get("INVITATION_FROM_EMAIL") ?? Deno.env.get("REMINDER_FROM_EMAIL"), 320);
  if (!apiKey || !sender) throw new InvitationError(503, "Invitation email provider is not configured");
  const { data, error } = await admin.auth.admin.generateLink({
    type: "invite",
    email: input.email,
    options: { data: { full_name: input.fullName }, redirectTo: portalUrl() },
  });
  if (error || !data.user || !data.properties?.hashed_token) {
    throw new InvitationError(400, error?.message ?? "Unable to create a secure invitation link");
  }
  const confirmationUrl = new URL(portalUrl());
  confirmationUrl.searchParams.set("invitation_token", data.properties.hashed_token);
  const email = await renderEmail(admin, "invitation", {
    full_name: input.fullName,
    company_name: companyName,
    action_url: confirmationUrl.toString(),
    expires_at: new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(expiresAt)) + " UTC",
  }, { value: confirmationUrl.toString(), label: "Review and accept your invitation" });
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: sender,
      to: [input.email],
      subject: email.subject,
      html: email.html,
      text: email.text,
    }),
  });
  if (!response.ok) throw new InvitationError(502, "The invitation email provider rejected the message");
  return { user: data.user, method: "resend" };
}

async function sendWithSupabase(
  admin: SupabaseClient,
  input: InvitationInput,
): Promise<{ user: User; method: "supabase_auth" }> {
  const { data, error } = await admin.auth.admin.inviteUserByEmail(input.email, {
    data: { full_name: input.fullName }, redirectTo: portalUrl(),
  });
  if (error || !data.user) throw new InvitationError(400, error?.message ?? "Unable to send invitation");
  return { user: data.user, method: "supabase_auth" };
}

export async function inviteCompanyUser(
  admin: SupabaseClient,
  caller: User,
  input: InvitationInput,
  existingInvitationId?: string,
): Promise<{ invited: boolean; linked: boolean; invitationId: string | null; user: User }> {
  await enforceInvitationRate(admin, caller.id);
  const organization = await admin.from("organizations").select("id,is_active,name").eq("id", input.organizationId).maybeSingle();
  if (organization.error) throw new InvitationError(400, organization.error.message);
  if (!organization.data?.is_active) throw new InvitationError(404, "Active company not found");
  await admin.from("user_invitations").update({ status: "expired" })
    .eq("organization_id", input.organizationId).eq("email", input.email)
    .eq("status", "pending").lt("expires_at", new Date().toISOString());

  if (!existingInvitationId) {
    const pending = await admin.from("user_invitations").select("id,last_sent_at")
      .eq("organization_id", input.organizationId).eq("email", input.email).eq("status", "pending").maybeSingle();
    if (pending.error) throw new InvitationError(400, pending.error.message);
    if (pending.data) {
      const elapsed = Date.now() - new Date(pending.data.last_sent_at).getTime();
      if (elapsed < 60_000) throw new InvitationError(429, "This invitation was sent recently. Please wait one minute before resending.");
      existingInvitationId = pending.data.id;
    }
  }

  const existingUser = await findUserByEmail(admin, input.email);
  if (existingUser?.app_metadata?.role === "platform_admin") {
    throw new InvitationError(409, "A platform administrator account cannot be converted into a company account");
  }
  if (existingUser?.email_confirmed_at) {
    const { error: membershipError } = await admin.from("organization_members").upsert({
      organization_id: input.organizationId, user_id: existingUser.id, role: input.role,
    }, { onConflict: "organization_id,user_id" });
    if (membershipError) throw new InvitationError(400, membershipError.message);
    await admin.auth.admin.updateUserById(existingUser.id, {
      app_metadata: { ...(existingUser.app_metadata ?? {}), role: "company_user" },
    });
    const { error: profileError } = await admin.from("profiles").upsert({ user_id: existingUser.id, full_name: input.fullName });
    if (profileError) throw new InvitationError(400, profileError.message);
    const acceptedAt = new Date().toISOString();
    const pending = await admin.from("user_invitations").update({
      auth_user_id: existingUser.id, full_name: input.fullName, role: input.role,
      status: "accepted", accepted_at: acceptedAt, last_error: null,
    }).eq("organization_id", input.organizationId).eq("email", input.email)
      .eq("status", "pending").select("id").maybeSingle();
    if (pending.error) throw new InvitationError(400, pending.error.message);
    let acceptedInvitationId = pending.data?.id ?? null;
    if (!acceptedInvitationId) {
      const accepted = await admin.from("user_invitations").insert({
      organization_id: input.organizationId, auth_user_id: existingUser.id, email: input.email,
      full_name: input.fullName, role: input.role, status: "accepted", invited_by: caller.id,
      expires_at: expiryTime(), accepted_at: acceptedAt, delivery_method: "supabase_auth",
      }).select("id").single();
      if (accepted.error || !accepted.data) throw new InvitationError(400, accepted.error?.message ?? "Unable to record access");
      acceptedInvitationId = accepted.data.id;
    }
    return { invited: false, linked: true, invitationId: acceptedInvitationId, user: existingUser };
  }

  const expiresAt = expiryTime();
  let sent: { user: User; method: "resend" | "supabase_auth" };
  if (Deno.env.get("RESEND_API_KEY")) sent = await sendWithResend(admin, input, String(organization.data.name), expiresAt);
  else sent = await sendWithSupabase(admin, input);

  let invitationId = existingInvitationId;
  if (existingInvitationId) {
    const current = await admin.from("user_invitations").select("sent_count").eq("id", existingInvitationId).single();
    if (current.error || !current.data) throw new InvitationError(404, "Invitation not found");
    const nextCount = Math.min(100, Number(current.data.sent_count ?? 1) + 1);
    const { error } = await admin.from("user_invitations").update({
      auth_user_id: sent.user.id, full_name: input.fullName, role: input.role, status: "pending",
      expires_at: expiresAt, last_sent_at: new Date().toISOString(),
      sent_count: nextCount, delivery_method: sent.method, last_error: null, revoked_at: null,
    }).eq("id", existingInvitationId);
    if (error) throw new InvitationError(400, error.message);
  } else {
    const { data, error } = await admin.from("user_invitations").insert({
      organization_id: input.organizationId, auth_user_id: sent.user.id, email: input.email,
      full_name: input.fullName, role: input.role, status: "pending", invited_by: caller.id,
      expires_at: expiresAt, delivery_method: sent.method,
    }).select("id").single();
    if (error || !data) throw new InvitationError(400, error?.message ?? "Unable to track invitation");
    invitationId = data.id;
  }

  await admin.auth.admin.updateUserById(sent.user.id, {
    app_metadata: { ...(sent.user.app_metadata ?? {}), role: "company_user" },
    user_metadata: { ...(sent.user.user_metadata ?? {}), full_name: input.fullName },
  });
  return { invited: true, linked: false, invitationId: invitationId ?? null, user: sent.user };
}

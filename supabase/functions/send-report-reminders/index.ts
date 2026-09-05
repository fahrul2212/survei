import { adminClient, json, preflight, requireUser } from "../_shared/supabase.ts";
import { renderEmail } from "../_shared/email-templates.ts";

function safeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

async function loadEmailDirectory(admin: ReturnType<typeof adminClient>): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    data.users.forEach((user) => result.set(user.id, user.email ?? ""));
    if (data.users.length < 1000) break;
  }
  return result;
}

Deno.serve(async (req) => {
    const options = preflight(req); if (options) return options;
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
    const admin = adminClient();
    const cronSecret = Deno.env.get("REMINDER_CRON_SECRET") ?? "";
    const resendKey = Deno.env.get("RESEND_API_KEY") ?? "";
    const suppliedSecret = req.headers.get("x-cron-secret") ?? "";
    const cronAuthorized = Boolean(cronSecret && suppliedSecret && safeEqual(cronSecret, suppliedSecret));
    let action = "scheduled";
    try {
      const payload = await req.json() as { action?: string };
      action = payload.action ?? action;
    } catch { /* cron calls may have no body */ }
    let caller: Awaited<ReturnType<typeof requireUser>> | null = null;
    if (!cronAuthorized) {
      try { caller = await requireUser(req); }
      catch (response) { return response instanceof Response ? response : json({ error: "Unauthorized" }, 401); }
      if (caller.app_metadata?.role !== "platform_admin") return json({ error: "Administrator access required" }, 403);
      if (!new Set(["test", "run"]).has(action)) return json({ error: "Unauthorized" }, 401);
    }
    if (!resendKey) return json({ error: "RESEND_API_KEY is not configured" }, 503);

    const sender = Deno.env.get("REMINDER_FROM_EMAIL") ?? "";
    const portalUrl = Deno.env.get("PORTAL_URL") ?? "";
    if (!sender || !portalUrl) return json({ error: "REMINDER_FROM_EMAIL and PORTAL_URL must be configured" }, 503);
    try {
      if (new URL(portalUrl).protocol !== "https:") throw new Error("not https");
    } catch {
      return json({ error: "PORTAL_URL must be a valid HTTPS URL" }, 503);
    }
    if (action === "test") {
      if (!caller?.email) return json({ error: "The administrator account has no email address" }, 400);
      const sample = await renderEmail(admin, "reminder", {
        company_name: "Sample Textile Company",
        days_remaining: "7",
        survey_name: "STICA Climate Transition Plan",
        status: "in progress",
        portal_url: portalUrl,
      }, { value: portalUrl, label: "Open the STICA reporting portal" });
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: sender, to: [caller.email], subject: `[TEST] ${sample.subject}`, html: sample.html, text: sample.text }),
      });
      const responseBody = await response.json() as { id?: string; message?: string };
      if (!response.ok) return json({ error: responseBody.message ?? "Email provider error" }, 502);
      await admin.from("audit_events").insert({
        actor_user_id: caller.id, event_type: "reminder.test_sent", entity_type: "email_template",
        entity_id: "reminder", details: { provider: "resend" },
      });
      return json({ sent: 1, recipient: caller.email.replace(/^(.{2}).*(@.*)$/, "$1•••$2") });
    }
    const today = new Date();
    const todayKey = today.toISOString().slice(0, 10);
    const { data: policies, error: policyError } = await admin
      .from("reminder_policies")
      .select("id,survey_version_id,days_before_due,include_not_started,include_in_progress,survey:survey_versions!inner(name,reporting_year,status,closes_at)")
      .eq("enabled", true).eq("survey.status", "published").not("survey.closes_at", "is", null);
    if (policyError) return json({ error: policyError.message }, 400);

    const { data: organizations } = await admin.from("organizations").select("id,name").eq("is_active", true);
    const { data: members } = await admin.from("organization_members").select("organization_id,user_id,role").in("role", ["member", "company_admin"]);
    let emailByUser: Map<string, string>;
    try {
      emailByUser = await loadEmailDirectory(admin);
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "Unable to load reminder recipients" }, 400);
    }
    let sent = 0, skipped = 0, failed = 0;

    for (const policy of policies ?? []) {
      const survey = Array.isArray(policy.survey) ? policy.survey[0] : policy.survey;
      const deadline = new Date(`${String(survey.closes_at).slice(0, 10)}T00:00:00Z`);
      const daysRemaining = Math.round((deadline.getTime() - new Date(`${todayKey}T00:00:00Z`).getTime()) / 86400000);
      if (!(policy.days_before_due as number[]).includes(daysRemaining)) continue;
      const { data: submissions } = await admin.from("company_submissions")
        .select("organization_id,status").eq("survey_version_id", policy.survey_version_id);
      const statusByOrg = new Map((submissions ?? []).map((item) => [item.organization_id, item.status]));

      for (const organization of organizations ?? []) {
        const status = statusByOrg.get(organization.id) ?? "not_started";
        if (status === "submitted" || (status === "not_started" && !policy.include_not_started) || (status !== "not_started" && !policy.include_in_progress)) {
          skipped += 1; continue;
        }
        for (const member of (members ?? []).filter((item) => item.organization_id === organization.id)) {
          const email = emailByUser.get(member.user_id) ?? "";
          if (!email) { skipped += 1; continue; }
          const reminderKey = `${policy.id}:${organization.id}:${member.user_id}:${todayKey}`;
          let { data: delivery, error: deliveryError } = await admin.from("reminder_deliveries").insert({
            policy_id: policy.id, organization_id: organization.id, survey_version_id: policy.survey_version_id,
            recipient_user_id: member.user_id, recipient_email: email, reminder_key: reminderKey,
            scheduled_for: todayKey, status: "sending", attempts: 1, provider: "resend",
          }).select("id").maybeSingle();
          if (deliveryError?.code === "23505") {
            const { data: existing } = await admin.from("reminder_deliveries").select("id,status,attempts").eq("reminder_key", reminderKey).maybeSingle();
            if (existing?.status === "failed" && existing.attempts < 3) {
              const retry = await admin.from("reminder_deliveries").update({ status: "sending", attempts: existing.attempts + 1, error_message: null }).eq("id", existing.id).select("id").single();
              delivery = retry.data;
              deliveryError = retry.error;
            } else { skipped += 1; continue; }
          }
          if (deliveryError || !delivery) { failed += 1; continue; }

          const message = await renderEmail(admin, "reminder", {
            company_name: String(organization.name),
            days_remaining: String(daysRemaining),
            survey_name: String(survey.name),
            status: String(status).replaceAll("_", " "),
            portal_url: portalUrl,
          }, { value: portalUrl, label: "Open the STICA reporting portal" });
          const response = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              from: sender, to: [email], subject: message.subject, html: message.html, text: message.text,
            }),
          });
          const body = await response.json() as { id?: string; message?: string };
          if (response.ok) {
            sent += 1;
            await admin.from("reminder_deliveries").update({ status: "sent", sent_at: new Date().toISOString(), provider_message_id: body.id ?? null }).eq("id", delivery.id);
          } else {
            failed += 1;
            await admin.from("reminder_deliveries").update({ status: "failed", error_message: body.message ?? "Email provider error" }).eq("id", delivery.id);
          }
        }
      }
    }
    return json({ sent, skipped, failed, date: todayKey });
});

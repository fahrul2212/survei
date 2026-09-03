import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const REF = "ptqdzqxfmtonitflenod";
const URL = `https://${REF}.supabase.co`;

const rawKeys = execFileSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", `npx supabase projects api-keys --project-ref ${REF} -o json`], { encoding: "utf8", windowsHide: true });
const serviceKey = JSON.parse(rawKeys).find((key) => key.name === "service_role")?.api_key;
if (!serviceKey) throw new Error("Service role key not found.");

const db = createClient(URL, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

async function deleteShowcaseOrgs() {
  const slugsToDelete = [
    "circular-fibre-showcase",
    "baltic-loom-showcase",
    "nordic-apparel-showcase",
    "scandic-dyehouse-showcase",
    "rewear-retail-showcase",
  ];

  console.log("Finding organizations to delete:", slugsToDelete);
  const { data: orgs, error: fetchErr } = await db.from("organizations").select("id, name, slug").in("slug", slugsToDelete);
  if (fetchErr) throw fetchErr;
  if (!orgs || orgs.length === 0) {
    console.log("No showcase organizations found to delete.");
    return;
  }

  const orgIds = orgs.map((o) => o.id);
  console.log(`Found ${orgs.length} orgs to remove:`, orgs.map((o) => o.name));

  // 1. Get all submissions for these orgs
  const { data: subs, error: subsErr } = await db.from("company_submissions").select("id").in("organization_id", orgIds);
  if (subsErr) throw subsErr;
  const subIds = (subs || []).map((s) => s.id);
  console.log(`Found ${subIds.length} submissions to remove.`);

  if (subIds.length > 0) {
    // 2. Delete submission_snapshots
    const { error: snapErr } = await db.from("submission_snapshots").delete().in("submission_id", subIds);
    if (snapErr) console.warn("Snapshot delete:", snapErr.message);

    // 3. Delete answers
    const { error: ansErr } = await db.from("answers").delete().in("submission_id", subIds);
    if (ansErr) console.warn("Answers delete:", ansErr.message);

    // 4. Delete submission_documents
    const { error: docErr } = await db.from("submission_documents").delete().in("submission_id", subIds);
    if (docErr) console.warn("Doc delete:", docErr.message);

    // 5. Delete company_submissions
    const { error: delSubsErr } = await db.from("company_submissions").delete().in("id", subIds);
    if (delSubsErr) throw delSubsErr;
  }

  // 6. Delete email_deliveries & ai_summaries
  const { error: emailErr } = await db.from("email_deliveries").delete().in("organization_id", orgIds);
  if (emailErr) console.warn("Email deliveries delete:", emailErr.message);

  const { error: aiErr } = await db.from("ai_summaries").delete().in("organization_id", orgIds);
  if (aiErr) console.warn("AI summaries delete:", aiErr.message);

  // 7. Delete audit_events referencing these orgs
  const { error: auditErr } = await db.from("audit_events").delete().in("organization_id", orgIds);
  if (auditErr) console.warn("Audit events delete:", auditErr.message);

  // 8. Delete organization_members
  const { error: memErr } = await db.from("organization_members").delete().in("organization_id", orgIds);
  if (memErr) console.warn("Members delete:", memErr.message);

  // 9. Delete organizations
  const { error: delOrgsErr } = await db.from("organizations").delete().in("id", orgIds);
  if (delOrgsErr) throw delOrgsErr;

  console.log("Successfully deleted showcase organizations!");

  // Also clean up North Thread AB name from '(Showcase)'
  const { error: renameErr } = await db
    .from("organizations")
    .update({ name: "North Thread AB" })
    .eq("slug", "north-thread-showcase");
  if (renameErr) console.warn("Rename North Thread AB:", renameErr.message);
  else console.log("Renamed North Thread AB (Showcase) -> North Thread AB.");
}

deleteShowcaseOrgs().catch((err) => {
  console.error("Error deleting showcase orgs:", err);
  process.exitCode = 1;
});

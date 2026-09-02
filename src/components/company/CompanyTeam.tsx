import { useCallback, useEffect, useState, type FormEvent } from "react";
import { MailPlus, ShieldCheck, Trash2, Users } from "lucide-react";
import { supabase } from "../../lib/supabase";
import type { CompanyRole, MemberRow, Organization } from "../../lib/portal";
import { Button, EmptyState, PageContainer, PageHeader, type Notice } from "../ui";

const roleLabels: Record<CompanyRole, string> = {
  company_admin: "Company admin",
  member: "Contributor",
  viewer: "Viewer",
};

export function CompanyTeam({ organization, canManage, setNotice }: {
  organization: Organization;
  canManage: boolean;
  setNotice: (notice: Notice) => void;
}) {
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!supabase || !canManage) { setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase.rpc("get_my_organization_members", { target_organization_id: organization.id });
    if (error) setNotice({ kind: "error", message: error.message });
    else setMembers((data ?? []) as MemberRow[]);
    setLoading(false);
  }, [canManage, organization.id, setNotice]);

  useEffect(() => { void load(); }, [load]);

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy(true);
    const { error } = await supabase.functions.invoke("invite-company-member", { body: {
      organizationId: organization.id,
      fullName: String(form.get("fullName") ?? ""),
      email: String(form.get("email") ?? ""),
      role: String(form.get("role") ?? "member"),
      redirectTo: window.location.origin,
    } });
    if (error) setNotice({ kind: "error", message: error.message });
    else {
      setNotice({ kind: "success", message: "Team invitation sent and access assigned." });
      formElement.reset();
      await load();
    }
    setBusy(false);
  }

  async function changeRole(userId: string, role: CompanyRole) {
    if (!supabase) return;
    setBusy(true);
    const { error } = await supabase.rpc("update_my_organization_member_role", {
      target_organization_id: organization.id, target_user_id: userId, new_role: role,
    });
    if (error) setNotice({ kind: "error", message: error.message });
    else { setNotice({ kind: "success", message: "Team role updated." }); await load(); }
    setBusy(false);
  }

  async function remove(userId: string) {
    if (!supabase || !window.confirm("Remove this team member from the company workspace?")) return;
    setBusy(true);
    const { error } = await supabase.rpc("remove_my_organization_member", {
      target_organization_id: organization.id, target_user_id: userId,
    });
    if (error) setNotice({ kind: "error", message: error.message });
    else { setNotice({ kind: "success", message: "Team member removed." }); await load(); }
    setBusy(false);
  }

  return (
    <PageContainer>
      <PageHeader eyebrow="Company access" title="Team and roles" description="Invite multiple users and give each person only the access they need." />
      {!canManage ? (
        <section className="rounded-xl border border-slate-200 bg-white">
          <EmptyState icon={ShieldCheck} title="Company admin access required" description="Your role can use the reporting workspace but cannot manage other users." />
        </section>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.65fr)]">
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-5 py-4 md:px-6">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{members.length} users</p>
              <h2 className="mt-1 text-lg font-bold text-slate-900">Company team</h2>
            </div>
            {loading ? <p className="p-6 text-sm text-slate-500">Loading team…</p> : (
              <div className="divide-y divide-slate-100">
                {members.map((member) => (
                  <article key={member.user_id} className="grid gap-4 p-5 md:grid-cols-[minmax(0,1fr)_12rem_auto] md:items-center md:px-6">
                    <div className="min-w-0">
                      <strong className="block truncate text-sm text-slate-900">{member.full_name}</strong>
                      <span className="block truncate text-sm text-slate-500">{member.email}</span>
                    </div>
                    <select className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-[#d91f17] focus:ring-2 focus:ring-red-100" value={member.role} disabled={busy} onChange={(event) => void changeRole(member.user_id, event.target.value as CompanyRole)} aria-label={`Role for ${member.full_name}`}>
                      {Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                    <Button variant="ghost" size="icon" aria-label={`Remove ${member.full_name}`} disabled={busy} onClick={() => void remove(member.user_id)}><Trash2 size={17} /></Button>
                  </article>
                ))}
              </div>
            )}
          </section>

          <form className="h-fit rounded-xl border border-slate-200 bg-white p-5 md:p-6" onSubmit={invite}>
            <span className="grid size-10 place-items-center rounded-lg bg-red-50 text-[#d91f17]"><MailPlus size={19} /></span>
            <h2 className="mt-4 text-lg font-bold text-slate-900">Invite a colleague</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">They will receive a secure sign-in invitation by email.</p>
            <div className="mt-5 grid gap-4">
              <label className="grid gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">Full name<input name="fullName" required className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm font-normal normal-case tracking-normal text-slate-900 outline-none focus:border-[#d91f17] focus:ring-2 focus:ring-red-100" /></label>
              <label className="grid gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">Email<input name="email" type="email" required className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm font-normal normal-case tracking-normal text-slate-900 outline-none focus:border-[#d91f17] focus:ring-2 focus:ring-red-100" /></label>
              <label className="grid gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">Role<select name="role" defaultValue="member" className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal normal-case tracking-normal text-slate-900 outline-none focus:border-[#d91f17] focus:ring-2 focus:ring-red-100"><option value="member">Contributor</option><option value="viewer">Viewer</option><option value="company_admin">Company admin</option></select></label>
              <Button type="submit" icon={Users} disabled={busy}>{busy ? "Sending invitation…" : "Invite team member"}</Button>
            </div>
          </form>
        </div>
      )}
    </PageContainer>
  );
}

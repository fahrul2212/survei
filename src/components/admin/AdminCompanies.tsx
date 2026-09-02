import { useState, useMemo, FormEvent } from "react";
import { Plus, Search, Mail, Settings, Users, Download, Send } from "lucide-react";
import { Button, NoticeBar, EmptyState, SearchField, PageHeader, type Notice } from "../ui";
import { CompanyDirectory, type CompanyStatusFilter } from "./CompanyDirectory";
import { supabase } from "../../lib/supabase";
import { slugify, formatDate } from "../../lib/portal";
import type { Organization, SurveyVersion, ProgressRow } from "../../lib/portal";

const ORG_PAGE_SIZE = 12;

type MemberRow = {
  user_id: string;
  email: string;
  full_name: string;
  role: string;
  created_at: string;
};

export function AdminCompanies({
  orgs,
  versions,
  current,
  currentRows,
  onCurrentSurveyChange,
  selected,
  busy,
  setBusy,
  setNotice,
  load
}: {
  orgs: Organization[];
  versions: SurveyVersion[];
  current?: SurveyVersion;
  currentRows: ProgressRow[];
  onCurrentSurveyChange: (id: number) => void;
  selected: number | null;
  busy: boolean;
  setBusy: (b: boolean) => void;
  setNotice: (n: Notice) => void;
  load: (silent?: boolean, v?: number) => Promise<void>;
}) {
  // Company management (Modals & Edit)
  const [addOrgModalOpen, setAddOrgModalOpen] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [newOrgSlug, setNewOrgSlug] = useState("");
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [editingOrg, setEditingOrg] = useState<Organization | null>(null);
  const [editOrgForm, setEditOrgForm] = useState({ name: "", contactEmail: "", externalReference: "" });
  const [membersModalOrg, setMembersModalOrg] = useState<Organization | null>(null);
  const [orgMembersCache, setOrgMembersCache] = useState<Record<number, MemberRow[]>>({});
  const [membersBusy, setMembersBusy] = useState(false);

  const [orgSearch, setOrgSearch] = useState("");
  const [orgStatusFilter, setOrgStatusFilter] = useState<CompanyStatusFilter>("all");
  const [orgPage, setOrgPage] = useState(0);


  const filteredOrgs = useMemo(() => {
    return orgs.filter((o) => {
      const matchesSearch =
        !orgSearch ||
        o.name.toLowerCase().includes(orgSearch.toLowerCase()) ||
        o.slug.toLowerCase().includes(orgSearch.toLowerCase()) ||
        (o.contact_email && o.contact_email.toLowerCase().includes(orgSearch.toLowerCase())) ||
        (o.external_reference && o.external_reference.toLowerCase().includes(orgSearch.toLowerCase()));
      const matchesStatus =
        orgStatusFilter === "all" ||
        (orgStatusFilter === "active" && o.is_active) ||
        (orgStatusFilter === "inactive" && !o.is_active);
      return matchesSearch && matchesStatus;
    });
  }, [orgSearch, orgStatusFilter, orgs]);

  const totalOrgPages = Math.max(1, Math.ceil(filteredOrgs.length / ORG_PAGE_SIZE));
  const paginatedOrgs = useMemo(() => {
    return filteredOrgs.slice(orgPage * ORG_PAGE_SIZE, (orgPage + 1) * ORG_PAGE_SIZE);
  }, [filteredOrgs, orgPage]);



  async function invite(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!supabase) return;
    const f = new FormData(e.currentTarget);
    setBusy(true);
    const r = await supabase.functions.invoke("admin-invite-company", {
      body: {
        companyName: f.get("companyName"),
        companySlug: f.get("companySlug"),
        fullName: f.get("fullName"),
        email: f.get("email"),
        externalReference: f.get("externalReference"),
        redirectTo: location.origin,
      },
    });
    setBusy(false);
    if (r.error || r.data?.error) {
      return setNotice({ kind: "error", message: r.data?.error ?? r.error?.message ?? "Invitation failed" });
    }
    setNotice({ kind: "success", message: r.data.invited ? "Company created and invitation sent." : "Existing user linked." });
    setAddOrgModalOpen(false);
    await load(true, selected ?? undefined);
  }

  function beginEditOrg(o: Organization) {
    setEditingOrg(o);
    setEditOrgForm({
      name: o.name,
      contactEmail: o.contact_email ?? "",
      externalReference: o.external_reference ?? "",
    });
  }

  async function saveOrg(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!supabase || !editingOrg) return;
    setBusy(true);
    setNotice(null);
    try {
      const r = await supabase.rpc("update_organization", {
        target_organization_id: editingOrg.id,
        new_name: editOrgForm.name,
        new_contact_email: editOrgForm.contactEmail || null,
        new_external_reference: editOrgForm.externalReference || null,
      });
      if (r.error) throw r.error;
      setEditingOrg(null);
      await load(true, selected ?? undefined);
      setNotice({ kind: "success", message: "Company details updated." });
    } catch (e) {
      setNotice({ kind: "error", message: e instanceof Error ? e.message : "Unable to update company" });
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(o: Organization) {
    if (!supabase) return;
    const r = await supabase.from("organizations").update({ is_active: !o.is_active }).eq("id", o.id);
    if (r.error) return setNotice({ kind: "error", message: r.error.message });
    await load(true, selected ?? undefined);
  }

  async function openMembersModal(o: Organization) {
    setMembersModalOrg(o);
    if (orgMembersCache[o.id]) return;
    if (!supabase) return;
    setMembersBusy(true);
    try {
      const r = await supabase.rpc("get_organization_members", { target_organization_id: o.id });
      if (r.error) throw r.error;
      setOrgMembersCache((prev) => ({ ...prev, [o.id]: (r.data ?? []) as MemberRow[] }));
    } catch (e) {
      setNotice({ kind: "error", message: e instanceof Error ? e.message : "Unable to load members" });
    } finally {
      setMembersBusy(false);
    }
  }

  async function removeMember(orgId: number, userId: string, email: string) {
    if (!supabase) return;
    setMembersBusy(true);
    try {
      const r = await supabase.rpc("remove_organization_member", {
        target_organization_id: orgId,
        target_user_id: userId,
      });
      if (r.error) throw r.error;
      setOrgMembersCache((prev) => ({
        ...prev,
        [orgId]: (prev[orgId] ?? []).filter((m) => m.user_id !== userId),
      }));
      setNotice({ kind: "success", message: `${email} removed.` });
    } catch (e) {
      setNotice({ kind: "error", message: e instanceof Error ? e.message : "Unable to remove member" });
    } finally {
      setMembersBusy(false);
    }
  }

  async function changeMemberRole(orgId: number, userId: string, newRole: string) {
    if (!supabase) return;
    setMembersBusy(true);
    try {
      const r = await supabase.rpc("update_member_role", {
        target_organization_id: orgId,
        target_user_id: userId,
        new_role: newRole,
      });
      if (r.error) throw r.error;
      setOrgMembersCache((prev) => ({
        ...prev,
        [orgId]: (prev[orgId] ?? []).map((m) =>
          m.user_id === userId ? { ...m, role: newRole as MemberRow["role"] } : m,
        ),
      }));
    } catch (e) {
      setNotice({ kind: "error", message: e instanceof Error ? e.message : "Unable to update role" });
    } finally {
      setMembersBusy(false);
    }
  }


  return (
    <>
{/* ══════════════════════════ COMPANIES ════════════════════════════════ */}
      
        <div className="mx-auto w-full max-w-[1400px] px-4 py-8 md:px-8 lg:px-12 lg:pb-20">
          <PageHeader
            eyebrow="Participation"
            title="Companies"
            description="Manage organizations, members, and secure access."
            actions={(
              <Button
                icon={Plus}
                variant="primary"
                onClick={() => {
                  setAddOrgModalOpen(true);
                  setNewOrgName("");
                  setNewOrgSlug("");
                  setSlugManuallyEdited(false);
                }}
              >
                Add company
              </Button>
            )}
          />

          {versions.filter((survey) => survey.status === "published").length > 1 && (
            <section className="mb-6 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between md:p-5">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Participation survey</p>
                <p className="mt-1 text-sm text-slate-600">Choose which active survey drives the participation summary.</p>
              </div>
              <select
                className="min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-[#d91f17] focus:ring-2 focus:ring-red-100 sm:w-80"
                value={current?.id ?? ""}
                onChange={(event) => onCurrentSurveyChange(Number(event.target.value))}
                aria-label="Participation survey"
              >
                {versions.filter((survey) => survey.status === "published").map((survey) => (
                  <option key={survey.id} value={survey.id}>{survey.reporting_year} · {survey.name}</option>
                ))}
              </select>
            </section>
          )}

          <section className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4 lg:gap-4">
            <article className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 md:p-5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Total registered</span>
              <strong className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">
                {orgs.length}
              </strong>
            </article>
            <article className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 md:p-5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Active companies</span>
              <strong className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">
                {orgs.filter((o) => o.is_active).length}
              </strong>
            </article>
            <article className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 md:p-5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Archived</span>
              <strong className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">
                {orgs.filter((o) => !o.is_active).length}
              </strong>
            </article>
            <article className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 md:p-5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Reporting in {current?.reporting_year ?? "2026"}</span>
              <strong className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">
                {currentRows.filter((r) => r.status !== "not_started").length}
              </strong>
            </article>
          </section>

          <CompanyDirectory
            organizations={paginatedOrgs}
            totalOrganizations={orgs.length}
            totalActive={orgs.filter((organization) => organization.is_active).length}
            statusFilter={orgStatusFilter}
            search={orgSearch}
            page={orgPage}
            totalPages={totalOrgPages}
            filteredCount={filteredOrgs.length}
            onSearch={(value) => {
              setOrgSearch(value);
              setOrgPage(0);
            }}
            onStatusFilter={(filter) => {
              setOrgStatusFilter(filter);
              setOrgPage(0);
            }}
            onPage={setOrgPage}
            onEdit={beginEditOrg}
            onMembers={(organization) => void openMembersModal(organization)}
            onToggleActive={(organization) => void toggleActive(organization)}
          />
        </div>
      {/* ── Add company modal dialog ── */}
      {addOrgModalOpen && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4"
          role="presentation"
          onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) setAddOrgModalOpen(false); }}
        >
          <section className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 text-left shadow-xl md:p-8" role="dialog" aria-modal="true" aria-labelledby="add-org-title">
            <p className="mb-2 inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-widest text-[#d91f17]">New registration</p>
            <h2 id="add-org-title" className="mb-3 text-2xl font-bold tracking-tight text-slate-900">Add Company &amp; Send Invitation</h2>
            <p className="text-[15px] leading-relaxed text-slate-600">Register a participating company and invite their administrator via email.</p>
            <form onSubmit={invite} className="mt-6 flex flex-col gap-5">
              <div className="grid gap-5 md:grid-cols-2">
                <label className="flex flex-col gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
                  Company name
                  <input className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-3 text-sm font-normal normal-case tracking-normal text-slate-900 outline-none transition focus:border-[#d91f17] focus:ring-2 focus:ring-red-100"
                    name="companyName"
                    value={newOrgName}
                    onChange={(e) => {
                      setNewOrgName(e.target.value);
                      if (!slugManuallyEdited) {
                        setNewOrgSlug(slugify(e.target.value));
                      }
                    }}
                    placeholder="e.g. Nordic Weave AB"
                    required
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
                  Company code / slug
                  <input className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-3 text-sm font-normal normal-case tracking-normal text-slate-900 outline-none transition focus:border-[#d91f17] focus:ring-2 focus:ring-red-100"
                    name="companySlug"
                    value={newOrgSlug}
                    onChange={(e) => {
                      setNewOrgSlug(e.target.value);
                      setSlugManuallyEdited(true);
                    }}
                    pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                    placeholder="e.g. nordic-weave-ab"
                    required
                  />
                </label>
              </div>
              <div className="grid gap-5 md:grid-cols-2">
                <label className="flex flex-col gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
                  Administrator name
                  <input className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-3 text-sm font-normal normal-case tracking-normal text-slate-900 outline-none transition focus:border-[#d91f17] focus:ring-2 focus:ring-red-100" name="fullName" placeholder="e.g. Anna Lindberg" required />
                </label>
                <label className="flex flex-col gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
                  Administrator email
                  <input className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-3 text-sm font-normal normal-case tracking-normal text-slate-900 outline-none transition focus:border-[#d91f17] focus:ring-2 focus:ring-red-100" name="email" type="email" placeholder="e.g. anna@nordicweave.com" required />
                </label>
              </div>
              <label className="flex flex-col gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
                External reference
                <input className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-3 text-sm font-normal normal-case tracking-normal text-slate-900 outline-none transition focus:border-[#d91f17] focus:ring-2 focus:ring-red-100" name="externalReference" placeholder="Optional, e.g. STICA-2026-057" />
              </label>
              <div className="-mx-6 -mb-6 mt-6 flex items-center justify-end gap-3 border-t border-slate-100 bg-slate-50 p-5 md:-mx-8 md:-mb-8">
                <button type="button" className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-900 transition-colors hover:border-slate-400 hover:bg-slate-50" onClick={() => setAddOrgModalOpen(false)} disabled={busy}>
                  Cancel
                </button>
                <button type="submit" className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-slate-800" disabled={busy} aria-busy={busy}>
                  {busy ? "Sending invitation…" : <><Send size={16} aria-hidden="true" /> Send invitation</>}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* ── Edit org dialog ── */}
      {editingOrg && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4"
          role="presentation"
          onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) setEditingOrg(null); }}
        >
          <section className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 text-left shadow-xl md:p-8" role="dialog" aria-modal="true" aria-labelledby="edit-org-title">
            <p className="mb-2 inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-widest text-[#d91f17]">Edit company</p>
            <h2 id="edit-org-title" className="mb-3 text-2xl font-bold tracking-tight text-slate-900">{editingOrg.name}</h2>
            <form onSubmit={saveOrg} className="mt-6 flex flex-col gap-5">
              <label className="flex flex-col gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
                Company name
                <input className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-3 text-sm font-normal normal-case tracking-normal text-slate-900 outline-none transition focus:border-[#d91f17] focus:ring-2 focus:ring-red-100"
                  value={editOrgForm.name}
                  onChange={(e) => setEditOrgForm((f) => ({ ...f, name: e.target.value }))}
                  required
                />
              </label>
              <label className="flex flex-col gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
                Contact email
                <input className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-3 text-sm font-normal normal-case tracking-normal text-slate-900 outline-none transition focus:border-[#d91f17] focus:ring-2 focus:ring-red-100"
                  type="email"
                  value={editOrgForm.contactEmail}
                  onChange={(e) => setEditOrgForm((f) => ({ ...f, contactEmail: e.target.value }))}
                  placeholder="Optional"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
                External reference
                <input className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-3 text-sm font-normal normal-case tracking-normal text-slate-900 outline-none transition focus:border-[#d91f17] focus:ring-2 focus:ring-red-100"
                  value={editOrgForm.externalReference}
                  onChange={(e) => setEditOrgForm((f) => ({ ...f, externalReference: e.target.value }))}
                  placeholder="Optional, e.g. STICA-2026-057"
                />
              </label>
              <div className="-mx-6 -mb-6 mt-6 flex items-center justify-end gap-3 border-t border-slate-100 bg-slate-50 p-5 md:-mx-8 md:-mb-8">
                <button type="button" className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-900 transition-colors hover:border-slate-400 hover:bg-slate-50" onClick={() => setEditingOrg(null)} disabled={busy}>Cancel</button>
                <button type="submit" className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-slate-800" disabled={busy} aria-busy={busy}>
                  {busy ? "Saving…" : "Save changes"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* ── Manage members modal dialog ── */}
      {membersModalOrg && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4"
          role="presentation"
          onMouseDown={(e) => { if (e.target === e.currentTarget && !membersBusy) setMembersModalOrg(null); }}
        >
          <section className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 text-left shadow-xl md:p-8" role="dialog" aria-modal="true" aria-labelledby="members-modal-title">
            <p className="mb-2 inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-widest text-[#d91f17]">Team management</p>
            <h2 id="members-modal-title" className="mb-3 text-2xl font-bold tracking-tight text-slate-900">Members of {membersModalOrg.name}</h2>
            <p className="text-[15px] leading-relaxed text-slate-600">Users who have access to this company's reporting workspace.</p>
            
            <div className="mt-6">
              {membersBusy && !orgMembersCache[membersModalOrg.id] ? (
                <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm font-medium text-slate-500">Loading members…</p>
              ) : (orgMembersCache[membersModalOrg.id] ?? []).length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
                  <p className="text-sm font-medium text-slate-600">No linked users for this company.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200"><table className="w-full whitespace-nowrap text-left text-sm text-slate-600">
                    <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                      <tr>
                        <th>Name</th>
                        <th className="px-4 py-3 font-medium">Email</th>
                        <th className="px-4 py-3 font-medium">Role</th>
                        <th className="px-4 py-3 font-medium">Joined</th>
                        <th className="px-4 py-3 font-medium">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {(orgMembersCache[membersModalOrg.id] ?? []).map((m) => (
                        <tr key={m.user_id} className="transition-colors hover:bg-slate-50">
                          <td className="px-4 py-3"><strong className="font-medium text-slate-900">{m.full_name}</strong></td>
                          <td className="px-4 py-3"><small className="text-slate-500">{m.email}</small></td>
                          <td>
                            <select
                              value={m.role}
                              disabled={membersBusy}
                              onChange={(e) => void changeMemberRole(membersModalOrg.id, m.user_id, e.target.value)}
                              className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                            >
                              <option value="viewer">Viewer</option>
                              <option value="member">Contributor</option>
                              <option value="company_admin">Company admin</option>
                            </select>
                          </td>
                          <td className="px-4 py-3"><small className="text-slate-500">{formatDate(m.created_at)}</small></td>
                          <td>
                            <button
                              type="button"
                              className="font-semibold text-[#d91f17] hover:underline"
                              disabled={membersBusy}
                              onClick={() => void removeMember(membersModalOrg.id, m.user_id, m.email)}
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table></div>
                </div>
              )}
            </div>

            <div className="-mx-6 -mb-6 mt-6 flex items-center justify-end gap-3 border-t border-slate-100 bg-slate-50 p-5 md:-mx-8 md:-mb-8">
              <button
                type="button"
                className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-900 transition-colors hover:border-slate-400 hover:bg-slate-50"
                onClick={() => setMembersModalOrg(null)}
              >
                Close
              </button>
            </div>
          </section>
        </div>
      )}


    </>
  );
}

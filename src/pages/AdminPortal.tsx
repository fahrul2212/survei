import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ClipboardPlus,
  Clock3,
  LockKeyhole,
  Plus,
  Printer,
  RotateCcw,
  Send,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import {
  evaluateVisibility,
  formatDate,
  isAnswered,
  normalizeImportMatrix,
  parseSurveyQuestion,
  slugify,
  surveyDisplayTitle,
  valueAsText,
  type AnswerRecord,
  type ExportRow,
  type JsonAnswer,
  type MemberRow,
  type Organization,
  type ProgressRow,
  type QuestionType,
  type Submission,
  type SurveyQuestion,
  type SurveyVersion,
} from "../lib/portal";
import { exportPivotXlsx, exportResponsesXlsx, readImportWorkbook } from "../lib/spreadsheet";
import {
  Button,
  EmptyState,
  Loading,
  Logo,
  NoticeBar,
  PageHeader,
  QuestionField,
  SearchField,
  Shell,
  type Notice,
} from "../components/ui";
import { AuditLogView } from "../components/admin/AuditLogView";
import { CompanyDirectory, type CompanyStatusFilter } from "../components/admin/CompanyDirectory";
import { AdminDashboard } from "../components/admin/AdminDashboard";
import { SurveyWorkspaceHeader } from "../components/admin/SurveyWorkspaceHeader";
import { SurveyBuilder } from "../components/admin/SurveyBuilder";

// ── Constants ─────────────────────────────────────────────────────────────────

const QUESTION_SELECT = `id,survey_version_id,display_order,is_required,carry_forward_enabled,visibility_rule,section_key,section_title,question_revision:question_revisions!inner(id,prompt,help_text,question_type,options,validation,question:question_definitions!inner(id,stable_key,category))`;
const EXPORT_PAGE_SIZE = 25;
const Q_PAGE_SIZE = 12;
const ORG_PAGE_SIZE = 12;

// ── Types ─────────────────────────────────────────────────────────────────────

type QForm = {
  id: number | null;
  stableKey: string;
  category: string;
  prompt: string;
  help: string;
  type: QuestionType;
  options: string;
  required: boolean;
  sectionKey: string;
  sectionTitle: string;
  carry: string;
  condition: string;
  operator: string;
  expected: string;
};

const EMPTY_Q: QForm = {
  id: null,
  stableKey: "",
  category: "",
  prompt: "",
  help: "",
  type: "text",
  options: "",
  required: false,
  sectionKey: "general",
  sectionTitle: "General",
  carry: "",
  condition: "",
  operator: "equals",
  expected: "",
};

// ── Utility ───────────────────────────────────────────────────────────────────

async function allExports(filters: { year?: number; company?: string; question?: string } = {}): Promise<ExportRow[]> {
  if (!supabase) return [];
  const result: ExportRow[] = [];
  for (let from = 0; ; from += 1000) {
    let q = supabase
      .from("reporting_export")
      .select("*")
      .order("reporting_year", { ascending: false })
      .order("company_name")
      .order("display_order")
      .range(from, from + 999);
    if (filters.year) q = q.eq("reporting_year", filters.year);
    if (filters.company) q = q.eq("company_slug", filters.company);
    if (filters.question) q = q.eq("question_key", filters.question);
    const r = await q;
    if (r.error) throw r.error;
    result.push(...(r.data as ExportRow[]));
    if ((r.data?.length ?? 0) < 1000) break;
  }
  return result;
}


export function AdminPortal({ session }: { session: Session }) {
  // Navigation
  const [view, setView] = useState("dashboard");

  // Core data
  const [versions, setVersions] = useState<SurveyVersion[]>([]);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [rows, setRows] = useState<ProgressRow[]>([]);
  const [questions, setQuestions] = useState<SurveyQuestion[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [carry, setCarry] = useState<Record<number, string>>({});

  // Filters & Search
  const [dashSearch, setDashSearch] = useState("");
  const [dashStatusFilter, setDashStatusFilter] = useState<string>("all");
  const [qSearch, setQSearch] = useState("");
  const [qSectionFilter, setQSectionFilter] = useState("");
  const [orgSearch, setOrgSearch] = useState("");
  const [orgStatusFilter, setOrgStatusFilter] = useState<CompanyStatusFilter>("all");
  const [orgPage, setOrgPage] = useState(0);

  // Reopen modal
  const [reopenTarget, setReopenTarget] = useState<ProgressRow | null>(null);
  const [reopenReason, setReopenReason] = useState("");

  // Survey builder sub-views
  const [addOrgModalOpen, setAddOrgModalOpen] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [newOrgSlug, setNewOrgSlug] = useState("");
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [editingOrg, setEditingOrg] = useState<Organization | null>(null);
  const [editOrgForm, setEditOrgForm] = useState({ name: "", contactEmail: "", externalReference: "" });
  const [membersModalOrg, setMembersModalOrg] = useState<Organization | null>(null);
  const [orgMembersCache, setOrgMembersCache] = useState<Record<number, MemberRow[]>>({});
  const [membersBusy, setMembersBusy] = useState(false);

  // Data / export
  const [exports, setExports] = useState<ExportRow[]>([]);
  const [exportFormat, setExportFormat] = useState<"flat" | "pivot">("flat");
  const [exportPage, setExportPage] = useState(0);
  const [year, setYear] = useState("");
  const [company, setCompany] = useState("");
  const [question, setQuestion] = useState("");
  const [importFileName, setImportFileName] = useState("");

  // Global state
  const [notice, setNotice] = useState<Notice>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // ── Loaders ──────────────────────────────────────────────────────────────

  const loadQuestions = useCallback(async (id: number) => {
    if (!supabase) return;
    const [a, b] = await Promise.all([
      supabase.from("survey_questions").select(QUESTION_SELECT).eq("survey_version_id", id).order("display_order"),
      supabase.from("question_carry_forward_rules").select("target_survey_question_id,source:question_definitions!inner(stable_key)"),
    ]);
    if (a.error) throw a.error;
    if (b.error) throw b.error;
    setQuestions((a.data ?? []).map(parseSurveyQuestion));
    setCarry(
      Object.fromEntries(
        (b.data ?? []).map((x) => [
          x.target_survey_question_id,
          (Array.isArray(x.source) ? x.source[0] : x.source)?.stable_key ?? "",
        ]),
      ),
    );
  }, []);

  const load = useCallback(async (silent = false, preferredId?: number) => {
    if (!supabase) return;
    if (!silent) setLoading(true);
    try {
      const [a, b, c] = await Promise.all([
        supabase.from("survey_versions").select("*").order("reporting_year", { ascending: false }),
        supabase.from("organizations").select("*").order("name"),
        supabase.from("admin_submission_progress").select("*").order("reporting_year", { ascending: false }),
      ]);
      if (a.error) throw a.error;
      if (b.error) throw b.error;
      if (c.error) throw c.error;
      const vv = (a.data ?? []) as SurveyVersion[];
      setVersions(vv);
      setOrgs((b.data ?? []) as Organization[]);
      setRows((c.data ?? []) as ProgressRow[]);
      const id = preferredId ?? vv[0]?.id ?? null;
      setSelected(id);
      if (id) await loadQuestions(id);
    } catch (e) {
      setNotice({ kind: "error", message: e instanceof Error ? e.message : "Unable to load admin data" });
    } finally {
      if (!silent) setLoading(false);
    }
  }, [loadQuestions]);

  useEffect(() => { void load(); }, [load]);

  // ── Derived state ─────────────────────────────────────────────────────────

  const selectedVersion = versions.find((v) => v.id === selected);
  const current = versions.find((v) => v.status === "published") ?? versions[0];
  const currentRows = current ? rows.filter((r) => r.survey_version_id === current.id) : [];
  
  const filteredDashboardRows = useMemo(() => {
    return currentRows.filter((r) => {
      const matchesSearch =
        !dashSearch ||
        r.organization_name.toLowerCase().includes(dashSearch.toLowerCase()) ||
        (r.contact_email && r.contact_email.toLowerCase().includes(dashSearch.toLowerCase()));
      const matchesStatus =
        dashStatusFilter === "all" ||
        (dashStatusFilter === "submitted" && r.status === "submitted") ||
        (dashStatusFilter === "in_progress" && (r.status === "draft" || r.status === "reopened")) ||
        (dashStatusFilter === "not_started" && r.status === "not_started");
      return matchesSearch && matchesStatus;
    });
  }, [currentRows, dashSearch, dashStatusFilter]);

  const submitted = currentRows.filter((r) => r.status === "submitted").length;
  const inProgress = currentRows.filter((r) => r.status === "draft" || r.status === "reopened").length;
  const notStarted = currentRows.filter((r) => r.status === "not_started").length;
  const years = [...new Set(rows.map((r) => r.reporting_year))].sort((a, b) => b - a);
  const visibleExports = exports.slice(exportPage * EXPORT_PAGE_SIZE, (exportPage + 1) * EXPORT_PAGE_SIZE);

  const filteredQuestions = useMemo(() => {
    return questions.filter((q) => {
      const matchesSearch =
        !qSearch ||
        q.stableKey.toLowerCase().includes(qSearch.toLowerCase()) ||
        q.prompt.toLowerCase().includes(qSearch.toLowerCase()) ||
        q.sectionTitle.toLowerCase().includes(qSearch.toLowerCase());
      const matchesSection = !qSectionFilter || q.sectionKey === qSectionFilter;
      return matchesSearch && matchesSection;
    });
  }, [qSearch, qSectionFilter, questions]);

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

  // ── Company management actions ────────────────────────────────────────────

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

  // ── Admin submission actions ──────────────────────────────────────────────

  async function executeReopen() {
    if (!supabase || !reopenTarget || !reopenTarget.submission_id || !reopenReason.trim()) return;
    setBusy(true);
    const x = await supabase.rpc("reopen_submission", {
      target_submission_id: reopenTarget.submission_id,
      reason: reopenReason.trim(),
    });
    setBusy(false);
    if (x.error) {
      setNotice({ kind: "error", message: x.error.message });
    } else {
      setNotice({ kind: "success", message: `Reopened report for ${reopenTarget.organization_name}.` });
      setReopenTarget(null);
      setReopenReason("");
      await load(true, selected ?? undefined);
    }
  }

  // ── Export actions ────────────────────────────────────────────────────────

  async function prepare() {
    try {
      setBusy(true);
      const data = await allExports({
        year: year ? Number(year) : undefined,
        company: company || undefined,
        question: question.toUpperCase() || undefined,
      });
      setExports(data);
      setExportPage(0);
      setNotice({ kind: "success", message: `${data.length} response rows prepared.` });
    } catch (e) {
      setNotice({ kind: "error", message: e instanceof Error ? e.message : "Export failed" });
    } finally {
      setBusy(false);
    }
  }

  async function downloadExport() {
    setBusy(true);
    try {
      const data = exports.length ? exports : await allExports();
      const fileName = `stica-${exportFormat}-${year || "all-years"}.xlsx`;
      if (exportFormat === "pivot") {
        await exportPivotXlsx(data, fileName);
      } else {
        await exportResponsesXlsx(data, fileName);
      }
    } catch (e) {
      setNotice({ kind: "error", message: e instanceof Error ? e.message : "Download failed" });
    } finally {
      setBusy(false);
    }
  }

  // ── Historical import ─────────────────────────────────────────────────────

  async function importHistory(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!supabase) return;
    const input = e.currentTarget.elements.namedItem("historyFile") as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      setBusy(true);
      const data = normalizeImportMatrix(await readImportWorkbook(file));
      const r = await supabase.rpc("import_historical_responses", { import_rows: data });
      if (r.error) throw r.error;
      setNotice({ kind: "success", message: `${r.data} historical rows imported.` });
      e.currentTarget.reset();
      setImportFileName("");
      await load(true, selected ?? undefined);
    } catch (x) {
      setNotice({ kind: "error", message: x instanceof Error ? x.message : "Import failed" });
    } finally {
      setBusy(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) return <Loading text="Loading administrator workspace" />;

  const navItems: Array<[string, string, string?]> = [
    ["dashboard", "Progress"],
    ["surveys", "Survey builder"],
    ["companies", "Companies"],
    ["data", "Import & export"],
    ["analytics", "Analytics"],
    ["audit", "Audit log"],
  ];

  return (
    <Shell admin view={view} setView={setView} items={navItems} user={session.user} name="STICA Administration">
      <NoticeBar notice={notice} clear={() => setNotice(null)} />

      {/* ── Add company modal dialog ── */}
      {addOrgModalOpen && (
        <div
          className="dialog-backdrop"
          role="presentation"
          onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) setAddOrgModalOpen(false); }}
        >
          <section className="confirm-dialog confirm-dialog--wide" role="dialog" aria-modal="true" aria-labelledby="add-org-title">
            <p className="eyebrow eyebrow--red">New registration</p>
            <h2 id="add-org-title">Add Company &amp; Send Invitation</h2>
            <p>Register a participating company and invite their administrator via email.</p>
            <form onSubmit={invite} className="dialog-form">
              <div className="form-grid">
                <label>
                  Company name
                  <input
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
                <label>
                  Company code / slug
                  <input
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
              <div className="form-grid">
                <label>
                  Administrator name
                  <input name="fullName" placeholder="e.g. Anna Lindberg" required />
                </label>
                <label>
                  Administrator email
                  <input name="email" type="email" placeholder="e.g. anna@nordicweave.com" required />
                </label>
              </div>
              <label>
                External reference
                <input name="externalReference" placeholder="Optional, e.g. STICA-2026-057" />
              </label>
              <div className="confirm-dialog__actions">
                <button type="button" className="button button--secondary" onClick={() => setAddOrgModalOpen(false)} disabled={busy}>
                  Cancel
                </button>
                <button type="submit" className="button button--primary" disabled={busy} aria-busy={busy}>
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
          className="dialog-backdrop"
          role="presentation"
          onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) setEditingOrg(null); }}
        >
          <section className="confirm-dialog confirm-dialog--wide" role="dialog" aria-modal="true" aria-labelledby="edit-org-title">
            <p className="eyebrow eyebrow--red">Edit company</p>
            <h2 id="edit-org-title">{editingOrg.name}</h2>
            <form onSubmit={saveOrg} className="dialog-form">
              <label>
                Company name
                <input
                  value={editOrgForm.name}
                  onChange={(e) => setEditOrgForm((f) => ({ ...f, name: e.target.value }))}
                  required
                />
              </label>
              <label>
                Contact email
                <input
                  type="email"
                  value={editOrgForm.contactEmail}
                  onChange={(e) => setEditOrgForm((f) => ({ ...f, contactEmail: e.target.value }))}
                  placeholder="Optional"
                />
              </label>
              <label>
                External reference
                <input
                  value={editOrgForm.externalReference}
                  onChange={(e) => setEditOrgForm((f) => ({ ...f, externalReference: e.target.value }))}
                  placeholder="Optional, e.g. STICA-2026-057"
                />
              </label>
              <div className="confirm-dialog__actions">
                <button type="button" className="button button--secondary" onClick={() => setEditingOrg(null)} disabled={busy}>Cancel</button>
                <button type="submit" className="button button--primary" disabled={busy} aria-busy={busy}>
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
          className="dialog-backdrop"
          role="presentation"
          onMouseDown={(e) => { if (e.target === e.currentTarget && !membersBusy) setMembersModalOrg(null); }}
        >
          <section className="confirm-dialog confirm-dialog--wide" role="dialog" aria-modal="true" aria-labelledby="members-modal-title">
            <p className="eyebrow eyebrow--red">Team management</p>
            <h2 id="members-modal-title">Members of {membersModalOrg.name}</h2>
            <p>Users who have access to this company's reporting workspace.</p>
            
            <div className="members-modal-body">
              {membersBusy && !orgMembersCache[membersModalOrg.id] ? (
                <p className="members-empty members-empty--loading">Loading members…</p>
              ) : (orgMembersCache[membersModalOrg.id] ?? []).length === 0 ? (
                <div className="members-empty">
                  <p>No linked users for this company.</p>
                </div>
              ) : (
                <div className="table-scroll members-table-scroll">
                  <table className="members-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Role</th>
                        <th>Joined</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(orgMembersCache[membersModalOrg.id] ?? []).map((m) => (
                        <tr key={m.user_id}>
                          <td><strong>{m.full_name}</strong></td>
                          <td><small>{m.email}</small></td>
                          <td>
                            <select
                              value={m.role}
                              disabled={membersBusy}
                              onChange={(e) => void changeMemberRole(membersModalOrg.id, m.user_id, e.target.value)}
                              className="member-role-select"
                            >
                              <option value="member">Member</option>
                              <option value="company_admin">Company admin</option>
                            </select>
                          </td>
                          <td><small>{formatDate(m.created_at)}</small></td>
                          <td>
                            <button
                              type="button"
                              className="danger-link"
                              disabled={membersBusy}
                              onClick={() => void removeMember(membersModalOrg.id, m.user_id, m.email)}
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="confirm-dialog__actions">
              <button
                type="button"
                className="button button--secondary"
                onClick={() => setMembersModalOrg(null)}
              >
                Close
              </button>
            </div>
          </section>
        </div>
      )}

      {/* ── Reopen dialog ── */}
      {reopenTarget && (
        <div
          className="dialog-backdrop"
          role="presentation"
          onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) setReopenTarget(null); }}
        >
          <section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="reopen-title">
            <p className="eyebrow eyebrow--red">Reopen submission</p>
            <h2 id="reopen-title">Reopen for {reopenTarget.organization_name}?</h2>
            <p>This allows the company to edit and resubmit their responses for reporting year {reopenTarget.reporting_year}.</p>
            <div className="dialog-form">
              <label>
                Reason for reopening (logged to audit trail)
                <textarea
                  rows={3}
                  value={reopenReason}
                  placeholder="e.g. Correction requested for Scope 3 emissions data"
                  onChange={(e) => setReopenReason(e.target.value)}
                  required
                />
              </label>
              <div className="confirm-dialog__actions">
                <button type="button" className="button button--secondary" onClick={() => setReopenTarget(null)} disabled={busy}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="button button--primary"
                  onClick={() => void executeReopen()}
                  disabled={busy || !reopenReason.trim()}
                >
                  {busy ? "Reopening…" : "Confirm & reopen"}
                </button>
              </div>
            </div>
          </section>
        </div>
      )}

      {view === "dashboard" && (
        <AdminDashboard
          versions={versions}
          orgs={orgs}
          rows={rows}
          setView={setView}
        />
      )}

      {/* ══════════════════════════ SURVEY BUILDER ════════════════════════════ */}
      {view === "surveys" && (
        <SurveyBuilder
          versions={versions}
          questions={questions}
          carry={carry}
          selected={selected}
          busy={busy}
          qSearch={qSearch}
          qSectionFilter={qSectionFilter}
          setQSearch={setQSearch}
          setQSectionFilter={setQSectionFilter}
          setBusy={setBusy}
          setNotice={setNotice}
          setSelected={setSelected}
          setVersions={setVersions}
          setQuestions={setQuestions}
          setCarry={setCarry}
          loadQuestions={loadQuestions}
          load={load}
        />
      )}

      {/* ══════════════════════════ COMPANIES ════════════════════════════════ */}
      {view === "companies" && (
        <div className="mx-auto w-full max-w-[1400px] animate-[rise_0.4s_ease_both] px-4 py-8 md:px-8 lg:px-12 lg:pb-20">
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

          <section className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4 lg:gap-4">
            <article className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md md:p-5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Total registered</span>
              <strong className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">
                {orgs.length}
              </strong>
            </article>
            <article className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md md:p-5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Active companies</span>
              <strong className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">
                {orgs.filter((o) => o.is_active).length}
              </strong>
            </article>
            <article className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md md:p-5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Archived</span>
              <strong className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">
                {orgs.filter((o) => !o.is_active).length}
              </strong>
            </article>
            <article className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md md:p-5">
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
      )}

      {/* ══════════════════════════ DATA ═════════════════════════════════════ */}
      {view === "data" && (
        <div className="mx-auto w-full max-w-[1400px] animate-[rise_0.4s_ease_both] px-4 py-8 md:px-8 lg:px-12 lg:pb-20">
          <div className="mb-10 flex flex-col items-start gap-3">
            <div>
              <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-[#d91f17]">Portable reporting data</p>
              <h1 className="text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">Import &amp; export</h1>
              <p className="mt-2 text-slate-500">Export responses to Excel, generate longitudinal pivot tables, or bulk-import historical responses.</p>
            </div>
          </div>

          <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Import */}
            <form className="flex flex-col gap-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8" onSubmit={importHistory}>
              <h3 className="text-xl font-bold text-slate-900">Historical Excel / CSV import</h3>
              <p className="text-sm text-slate-500">
                Required headers: <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-bold text-slate-600">company_name, company_slug, reporting_year, question_key, answer</code>
              </p>
              <div className="relative mt-2">
                <input
                  name="historyFile"
                  type="file"
                  accept=".xlsx,.csv"
                  required
                  onChange={(e) => setImportFileName(e.target.files?.[0]?.name ?? "")}
                  className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
                  id="file-upload"
                />
                <label htmlFor="file-upload" className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition-colors ${importFileName ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-slate-100'}`}>
                  <span className="text-3xl">📂</span>
                  <strong className={`text-sm font-bold ${importFileName ? 'text-emerald-700' : 'text-slate-700'}`}>
                    {importFileName ? importFileName : "Click to select .xlsx or .csv file"}
                  </strong>
                  <span className="text-xs font-semibold text-slate-500">Supports Excel workbooks and UTF-8 CSV</span>
                </label>
              </div>
              <div className="mt-auto pt-2 text-right">
                <Button disabled={busy || !importFileName}>
                  {busy ? "Importing data…" : "Import historical responses"}
                </Button>
              </div>
            </form>

            {/* Export */}
            <div className="flex flex-col gap-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
              <h3 className="text-xl font-bold text-slate-900">Flexible export</h3>
              
              <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-1">
                <button
                  type="button"
                  className={`flex-1 rounded-md px-3 py-2 text-[13px] font-bold transition-all ${exportFormat === "flat" ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200" : "text-slate-500 hover:text-slate-900"}`}
                  onClick={() => setExportFormat("flat")}
                >
                  Flat / long format
                </button>
                <button
                  type="button"
                  className={`flex-1 rounded-md px-3 py-2 text-[13px] font-bold transition-all ${exportFormat === "pivot" ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200" : "text-slate-500 hover:text-slate-900"}`}
                  onClick={() => setExportFormat("pivot")}
                >
                  Pivot / matrix format
                </button>
              </div>
              
              <p className="text-[13px] font-semibold text-slate-500">
                {exportFormat === "flat"
                  ? "One row per answer — ideal for data warehousing and statistical analysis."
                  : "One row per company per year, columns per question — ideal for comparisons and board reporting."}
              </p>
              
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <label className="flex flex-col gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
                  Year
                  <select 
                    value={year} 
                    onChange={(e) => setYear(e.target.value)}
                    className="w-full rounded-lg border-[1.5px] border-slate-200 bg-white px-4 py-3 text-[15px] font-normal normal-case tracking-normal text-slate-900 outline-none transition-all focus:border-[#d91f17] focus:ring-3 focus:ring-[#d91f17]/10"
                  >
                    <option value="">All reporting years</option>
                    {years.map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
                  Company
                  <select 
                    value={company} 
                    onChange={(e) => setCompany(e.target.value)}
                    className="w-full rounded-lg border-[1.5px] border-slate-200 bg-white px-4 py-3 text-[15px] font-normal normal-case tracking-normal text-slate-900 outline-none transition-all focus:border-[#d91f17] focus:ring-3 focus:ring-[#d91f17]/10"
                  >
                    <option value="">All companies</option>
                    {orgs.map((o) => <option key={o.id} value={o.slug}>{o.name}</option>)}
                  </select>
                </label>
              </div>
              
              <label className="flex flex-col gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
                Question ID filter
                <input 
                  value={question} 
                  onChange={(e) => setQuestion(e.target.value)} 
                  placeholder="e.g. GOV-001 (Optional)"
                  className="w-full rounded-lg border-[1.5px] border-slate-200 bg-white px-4 py-3 text-[15px] font-normal normal-case tracking-normal text-slate-900 outline-none transition-all focus:border-[#d91f17] focus:ring-3 focus:ring-[#d91f17]/10"
                />
              </label>
              
              <Button variant="secondary" onClick={() => void prepare()} disabled={busy}>
                {busy ? "Preparing preview…" : "Preview export data"}
              </Button>
              
              <div className="mt-2 flex flex-col justify-end gap-3 border-t border-slate-200 pt-6 sm:flex-row">
                <Button variant="secondary" onClick={() => print()}>
                  <Printer size={16} aria-hidden="true" className="mr-1.5" /> Print / PDF
                </Button>
                <Button onClick={() => void downloadExport()} disabled={busy}>
                  {busy ? "Generating file…" : `⬇️ Download Excel (${exportFormat})`}
                </Button>
              </div>
            </div>
          </section>

          {/* Export preview */}
          {exports.length > 0 && (
            <section className="admin-table export-preview">
              <div className="admin-table__head">
                <h3>{exports.length} response rows</h3>
                <div className="export-pager-controls">
                  <button
                    type="button"
                    disabled={exportPage === 0}
                    onClick={() => setExportPage((p) => p - 1)}
                  >
                    <ArrowLeft size={15} aria-hidden="true" /> Previous
                  </button>
                  <span>
                    {exportPage * EXPORT_PAGE_SIZE + 1}–{Math.min((exportPage + 1) * EXPORT_PAGE_SIZE, exports.length)} of {exports.length}
                  </span>
                  <button
                    type="button"
                    disabled={(exportPage + 1) * EXPORT_PAGE_SIZE >= exports.length}
                    onClick={() => setExportPage((p) => p + 1)}
                  >
                    Next <ArrowRight size={15} aria-hidden="true" />
                  </button>
                </div>
              </div>
              <div className="table-scroll">
                <table className="responsive-table responsive-table--export">
                  <thead>
                    <tr>
                      <th>Year</th>
                      <th>Company</th>
                      <th>Question ID</th>
                      <th>Question prompt</th>
                      <th>Answer</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleExports.map((r, i) => (
                      <tr key={i}>
                        <td data-label="Year"><strong>{r.reporting_year}</strong></td>
                        <td data-label="Company">{r.company_name}</td>
                        <td data-label="Question ID"><code>{r.question_key}</code></td>
                        <td data-label="Question">{r.question_prompt}</td>
                        <td data-label="Answer">{valueAsText(r.answer)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      )}

      {/* ══════════════════════════ ANALYTICS ════════════════════════════════ */}
      {view === "analytics" && (
        <div className="mx-auto w-full max-w-[1400px] animate-[rise_0.4s_ease_both] px-4 py-8 md:px-8 lg:px-12 lg:pb-20">
          <div className="page-intro">
            <div>
              <p className="eyebrow eyebrow--red">Lightweight analytics</p>
              <h1>Participation trends</h1>
              <p>Track annual submission progress, cohort completion rates, and company reporting trajectories.</p>
            </div>
          </div>
          <section className="analytics-grid">
            <article className="chart-card">
              <h3>Average completion by year</h3>
              <div className="bar-chart">
                {years.map((y) => {
                  const rr = rows.filter((r) => r.reporting_year === y);
                  const avg = rr.length ? Math.round(rr.reduce((s, r) => s + r.completion_percent, 0) / rr.length) : 0;
                  return (
                    <div key={y}>
                      <span>{y}</span>
                      <div><i style={{ width: `${avg}%` }} /></div>
                      <strong>{avg}%</strong>
                    </div>
                  );
                })}
              </div>
            </article>

            <article className="chart-card">
              <h3>Current status distribution</h3>
              <div className="donut-wrap">
                <div
                  className="analytics-donut"
                  style={{
                    "--submitted": `${currentRows.length ? (submitted / currentRows.length) * 360 : 0}deg`,
                    "--progress": `${currentRows.length ? ((submitted + inProgress) / currentRows.length) * 360 : 0}deg`,
                  } as React.CSSProperties}
                >
                  <span>
                    <strong>{currentRows.length}</strong>
                    companies
                  </span>
                </div>
                <ul className="status-legend">
                  <li><span>Submitted</span><strong>{submitted}</strong></li>
                  <li><span>In progress</span><strong>{inProgress}</strong></li>
                  <li><span>Not started</span><strong>{currentRows.length - submitted - inProgress}</strong></li>
                </ul>
              </div>
            </article>

            <article className="chart-card chart-card--wide">
              <div className="trajectory-heading">
                <div>
                  <h3>Company reporting trajectory</h3>
                  <p>Annual reporting completion timeline across participating brands</p>
                </div>
                <span>{orgs.filter((o) => o.is_active).length} active companies</span>
              </div>
              <div className="trajectory-table">
                {orgs.filter((o) => o.is_active).map((o) => (
                  <article className="trajectory-company" key={o.id}>
                    <div className="trajectory-company__name">
                      <strong>{o.name}</strong>
                      <span>Completion history</span>
                    </div>
                    <div className="trajectory-company__years">
                      {years.map((y) => {
                        const completion = rows.find((r) => r.organization_id === o.id && r.reporting_year === y)?.completion_percent ?? 0;
                        return (
                          <div key={y}>
                            <span>{y}</span>
                            <strong>{completion}%</strong>
                            <i aria-hidden="true"><b style={{ width: `${completion}%` }} /></i>
                          </div>
                        );
                      })}
                    </div>
                  </article>
                ))}
              </div>
            </article>
          </section>
        </div>
      )}

      {/* ══════════════════════════ AUDIT LOG ════════════════════════════════ */}
      {view === "audit" && <AuditLogView orgs={orgs} />}
    </Shell>
  );
}

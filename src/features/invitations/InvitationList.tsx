import { useCallback, useEffect, useState } from "react";
import { Clock3, MailCheck, RefreshCw, UserX } from "lucide-react";
import { Button, EmptyState } from "../../components/ui";
import { listInvitations, manageInvitation } from "./api";
import type { UserInvitation } from "./types";

const roleLabel = { viewer: "Viewer", member: "Contributor", company_admin: "Company admin" } as const;

function effectiveStatus(invitation: UserInvitation): UserInvitation["status"] {
  return invitation.status === "pending" && new Date(invitation.expires_at).getTime() <= Date.now()
    ? "expired"
    : invitation.status;
}

export function InvitationList({ organizationId, refreshKey = 0 }: { organizationId: number; refreshKey?: number }) {
  const [rows, setRows] = useState<UserInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try { setRows(await listInvitations(organizationId)); }
    catch (issue) { setError(issue instanceof Error ? issue.message : "Unable to load invitations"); }
    finally { setLoading(false); }
  }, [organizationId]);

  useEffect(() => { void load(); }, [load, refreshKey]);

  async function act(action: "resend" | "revoke", invitation: UserInvitation) {
    if (action === "revoke" && !window.confirm(`Revoke the invitation for ${invitation.email}?`)) return;
    setBusyId(invitation.id);
    setError("");
    try { await manageInvitation(action, invitation.id); await load(); }
    catch (issue) { setError(issue instanceof Error ? issue.message : "Invitation action failed"); }
    finally { setBusyId(null); }
  }

  if (loading) return <p className="py-5 text-sm text-slate-500">Loading invitations…</p>;
  if (!rows.length) return <EmptyState icon={MailCheck} title="No invitations yet" description="New invitations and their delivery status will appear here." />;

  return (
    <div className="grid gap-3">
      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p>}
      {rows.map((invitation) => {
        const status = effectiveStatus(invitation);
        const actionable = status === "pending" || status === "expired";
        return (
          <article key={invitation.id} className="grid gap-3 rounded-lg border border-slate-200 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <strong className="truncate text-sm text-slate-900" title={invitation.full_name}>{invitation.full_name}</strong>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-slate-600">{status}</span>
              </div>
              <p className="mt-1 truncate text-sm text-slate-500" title={invitation.email}>{invitation.email}</p>
              <p className="mt-1 text-xs text-slate-400">{roleLabel[invitation.role]} · sent {invitation.sent_count} time{invitation.sent_count === 1 ? "" : "s"}</p>
            </div>
            {actionable && (
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="small" icon={RefreshCw} disabled={busyId === invitation.id} onClick={() => void act("resend", invitation)}>Resend</Button>
                <Button variant="ghost" size="small" icon={UserX} disabled={busyId === invitation.id} onClick={() => void act("revoke", invitation)}>Revoke</Button>
              </div>
            )}
          </article>
        );
      })}
      <p className="flex items-center gap-2 text-xs text-slate-500"><Clock3 size={14} />Invitation links are one-time and expire automatically.</p>
    </div>
  );
}

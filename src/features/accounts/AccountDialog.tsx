import { useState, type FormEvent } from "react";
import { Dialog } from "../../components/common/Dialog";
import { Button } from "../../components/ui";
import { internalRoles, type ManagedAccount } from "../../../shared/account-management";
import { api, PortalApiError } from "../../lib/api-client";

const field =
  "mt-2 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal";
export function AccountDialog({
  account: initialAccount,
  actorId,
  close,
  saved,
}: {
  account: ManagedAccount | null;
  actorId: string;
  close: () => void;
  saved: () => void;
}) {
  const [account, setAccount] = useState(initialAccount);
  const [revision, setRevision] = useState(account?.revision);
  const [conflict, setConflict] = useState(false);
  const [name, setName] = useState(account?.name ?? "");
  const [email, setEmail] = useState(account?.email ?? "");
  const [role, setRole] = useState(
    account
      ? Object.hasOwn(internalRoles, account.role)
        ? account.role
        : "company"
      : "platform_analyst",
  );
  const [disabled, setDisabled] = useState(account?.disabled ?? false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const self = account?.id === actorId;
  const [sent, setSent] = useState(false);
  async function resend() {
    if (!account) return;
    setBusy(true);
    setError("");
    try {
      await api("/api/admin/accounts", {
        method: "POST",
        body: JSON.stringify({ operation: "resend", id: account.id }),
      });
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to resend invitation");
    } finally {
      setBusy(false);
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/admin/accounts", {
        method: "POST",
        body: JSON.stringify({
          operation: account ? "update" : "invite",
          id: account?.id,
          expectedRevision: revision,
          name,
          email,
          role,
          disabled,
        }),
      });
      saved();
    } catch (e) {
      setConflict(e instanceof PortalApiError && e.code === "account_conflict");
      setError(e instanceof Error ? e.message : "Unable to save account");
    } finally {
      setBusy(false);
    }
  }
  async function reloadDetails() {
    if (!account || busy) return;
    setBusy(true);
    try {
      const result = await api<{ users: ManagedAccount[] }>(`/api/admin/accounts?id=${account.id}`);
      const latest = result.users[0];
      if (!latest) throw new Error("This account is no longer available.");
      setAccount(latest);
      setName(latest.name);
      setDisabled(latest.disabled);
      setRole(Object.hasOwn(internalRoles, latest.role) ? latest.role : "company");
      setRevision(latest.revision);
      setConflict(false);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to reload account");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title={account ? "Manage account" : "Invite internal colleague"}
      close={close}
      dismissible={!busy}
    >
      <form onSubmit={submit} className="space-y-5">
        <fieldset disabled={busy} className="grid min-w-0 gap-5 sm:grid-cols-2">
          <label className="text-sm font-semibold">
            Full name
            <input
              className={field}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={160}
            />
          </label>
          <label className="text-sm font-semibold">
            Email
            <input
              className={field}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              maxLength={254}
              readOnly={!!account}
            />
          </label>
          <label className="text-sm font-semibold">
            Portal role
            <select
              className={field}
              value={role}
              onChange={(e) => setRole(e.target.value)}
              disabled={self || !!account?.companies.length}
            >
              {role === "company" && <option value="company">Company user</option>}
              {Object.entries(internalRoles).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {account && (
            <label className="text-sm font-semibold">
              Access status
              <select
                className={field}
                value={disabled ? "disabled" : "active"}
                onChange={(e) => setDisabled(e.target.value === "disabled")}
                disabled={self}
              >
                <option value="active">Active</option>
                <option value="disabled">Disabled</option>
              </select>
            </label>
          )}
        </fieldset>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm leading-6">
          {role === "platform_admin"
            ? "Admins can manage surveys, company data, internal accounts and AI settings."
            : role === "platform_analyst"
              ? "Analysts can compare answers across companies and years, and use AI. They cannot change surveys, manage accounts or approve question mappings."
              : "Company access is limited by its memberships. Manage contributor and viewer roles from Companies."}
          {self && (
            <p className="mt-2 font-medium">
              You cannot disable or remove your own administrator access.
            </p>
          )}
          {disabled && (
            <p className="mt-2 font-medium">
              Portal access will be revoked. Historical reports and audit records are retained.
            </p>
          )}
          {!account && (
            <p className="mt-2">
              A secure invitation email will be sent when you select Send invitation. Your colleague
              sets their own password.
            </p>
          )}
        </div>
        {account &&
          !account.confirmed &&
          !account.disabled &&
          Object.hasOwn(internalRoles, account.role) && (
            <div className="text-sm">
              {sent ? (
                <p role="status" className="text-emerald-700">
                  Invitation sent. The newest link replaces the previous invitation link.
                </p>
              ) : (
                <Button variant="secondary" disabled={busy} onClick={() => void resend()}>
                  Resend invitation email
                </Button>
              )}
            </div>
          )}
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        {conflict && (
          <Button variant="secondary" disabled={busy} onClick={() => void reloadDetails()}>
            Reload latest details (discard these edits)
          </Button>
        )}
        <footer className="flex justify-end gap-3">
          <Button variant="secondary" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy || conflict}>
            {busy ? "Saving…" : account ? "Save account" : "Send invitation"}
          </Button>
        </footer>
      </form>
    </Dialog>
  );
}

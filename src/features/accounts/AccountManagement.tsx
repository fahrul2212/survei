import { useEffect, useState } from "react";
import { MailPlus, Users } from "lucide-react";
import { Button, EmptyState, PageContainer, PageHeader } from "../../components/ui";
import { internalRoles, type ManagedAccount } from "../../../shared/account-management";
import { api } from "../../lib/api-client";
import { AccountDialog } from "./AccountDialog";

export function AccountManagement({ actorId }: { actorId: string }) {
  const [result, setResult] = useState<{ users: ManagedAccount[]; total: number }>({
    users: [],
    total: 0,
  });
  const [query, setQuery] = useState(""),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(0);
  const [refresh, setRefresh] = useState(0),
    [busy, setBusy] = useState(true),
    [error, setError] = useState("");
  const [editing, setEditing] = useState<ManagedAccount | null | undefined>();
  const [notice, setNotice] = useState("");
  useEffect(() => {
    let active = true;
    setBusy(true);
    setError("");
    api<{ users: ManagedAccount[]; total: number }>(
      `/api/admin/accounts?${new URLSearchParams({ search, page: String(page) })}`,
    )
      .then((data) => {
        if (active) {
          setResult(data);
          if (page > 0 && !data.users.length) setPage(page - 1);
        }
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : "Unable to load accounts");
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [search, page, refresh]);
  return (
    <PageContainer>
      <PageHeader
        eyebrow="Access management"
        title="Accounts"
        description="Manage internal colleagues and review company users in one directory. Internal accounts do not require a company membership."
        actions={
          <Button icon={MailPlus} onClick={() => setEditing(null)}>
            Invite internal user
          </Button>
        }
      />
      {notice && (
        <p
          role="status"
          className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
        >
          {notice}
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setPage(0);
          setSearch(query.trim());
        }}
        className="flex gap-3"
      >
        <input
          aria-label="Search accounts by name or email"
          placeholder="Search name or email"
          className="min-h-11 min-w-0 flex-1 rounded-lg border border-slate-300 px-3 text-sm"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          maxLength={160}
        />
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>
      <section
        className="overflow-hidden rounded-xl border border-slate-200 bg-white"
        aria-busy={busy}
      >
        <div className="border-b border-slate-200 p-5">
          <h2 className="font-bold">User directory</h2>
          <p className="mt-1 text-sm text-slate-500">
            {result.total} accounts · Company membership roles are managed under Companies.
          </p>
        </div>
        {error ? (
          <div role="alert" className="p-5">
            <p className="mb-3 text-sm text-red-700">{error}</p>
            <Button variant="secondary" onClick={() => setRefresh((v) => v + 1)}>
              Retry
            </Button>
          </div>
        ) : busy ? (
          <p role="status" className="p-6 text-sm">
            Loading accounts…
          </p>
        ) : !result.users.length ? (
          <EmptyState
            icon={Users}
            title="No matching accounts"
            description="Try another name or email, or invite an internal colleague."
          />
        ) : (
          <div className="divide-y divide-slate-200">
            {result.users.map((user) => (
              <article
                key={user.id}
                className="grid gap-4 p-5 md:grid-cols-[minmax(0,1fr)_11rem_auto] md:items-center"
              >
                <div className="min-w-0">
                  <strong className="block truncate" title={user.name}>
                    {user.name || "Unnamed account"}
                    {user.id === actorId ? " (you)" : ""}
                  </strong>
                  <span className="block truncate text-sm text-slate-600" title={user.email}>
                    {user.email}
                  </span>
                  <span
                    className="mt-1 block truncate text-xs text-slate-500"
                    title={user.companies.map((c) => c.name).join(", ")}
                  >
                    {user.companies.map((c) => c.name).join(", ") ||
                      (Object.hasOwn(internalRoles, user.role)
                        ? "Internal team"
                        : "No company membership")}
                  </span>
                </div>
                <div className="text-sm">
                  <span className="block font-semibold">
                    {internalRoles[user.role as keyof typeof internalRoles] ?? "Company user"}
                  </span>
                  <span className={user.disabled ? "text-red-700" : "text-slate-500"}>
                    {user.disabled ? "Disabled" : !user.confirmed ? "Invitation pending" : "Active"}
                  </span>
                </div>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setNotice("");
                    setEditing(user);
                  }}
                  aria-label={`Manage ${user.name || user.email}`}
                >
                  Manage
                </Button>
              </article>
            ))}
          </div>
        )}
        <footer className="flex items-center justify-between gap-3 border-t border-slate-200 p-4">
          <span className="text-sm text-slate-600">
            Page {page + 1} of {Math.max(1, Math.ceil(result.total / 25))}
          </span>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              disabled={busy || page === 0}
              onClick={() => setPage((v) => v - 1)}
            >
              Previous
            </Button>
            <Button
              variant="secondary"
              disabled={busy || (page + 1) * 25 >= result.total}
              onClick={() => setPage((v) => v + 1)}
            >
              Next
            </Button>
          </div>
        </footer>
      </section>
      {editing !== undefined && (
        <AccountDialog
          account={editing}
          actorId={actorId}
          close={() => setEditing(undefined)}
          saved={() => {
            setNotice(editing ? "Account updated." : "Internal invitation sent.");
            setEditing(undefined);
            setRefresh((v) => v + 1);
          }}
        />
      )}
    </PageContainer>
  );
}

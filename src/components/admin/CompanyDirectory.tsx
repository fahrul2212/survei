import { Archive, ArchiveRestore, Building2, Pencil, UsersRound } from "lucide-react";
import type { Organization } from "../../lib/portal";
import { Button, EmptyState, SearchField, TruncatedText } from "../ui";

export type CompanyStatusFilter = "all" | "active" | "inactive";

export function CompanyDirectory({
  organizations,
  totalOrganizations,
  totalActive,
  statusFilter,
  search,
  page,
  totalPages,
  filteredCount,
  onSearch,
  onStatusFilter,
  onPage,
  onEdit,
  onMembers,
  onToggleActive,
}: {
  organizations: Organization[];
  totalOrganizations: number;
  totalActive: number;
  statusFilter: CompanyStatusFilter;
  search: string;
  page: number;
  totalPages: number;
  filteredCount: number;
  onSearch: (value: string) => void;
  onStatusFilter: (value: CompanyStatusFilter) => void;
  onPage: (page: number) => void;
  onEdit: (organization: Organization) => void;
  onMembers: (organization: Organization) => void;
  onToggleActive: (organization: Organization) => void;
}) {
  const filters: Array<[CompanyStatusFilter, string]> = [
    ["all", `All (${totalOrganizations})`],
    ["active", `Active (${totalActive})`],
    ["inactive", `Archived (${totalOrganizations - totalActive})`],
  ];

  return (
    <section className="mb-8 overflow-hidden rounded-xl border border-slate-300 bg-white">
      <div className="flex flex-col gap-4 border-b border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between md:p-5">
        <div>
          <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">Directory</p>
          <h3 className="text-lg font-bold text-slate-900">Company directory</h3>
        </div>
        <SearchField
          aria-label="Search companies"
          placeholder="Search companies"
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          className="w-full sm:max-w-xs"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 p-4" aria-label="Filter companies by status">
        {filters.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => onStatusFilter(key)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
              statusFilter === key
                ? "bg-slate-800 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900"
            }`}
            aria-pressed={statusFilter === key}
          >
            {label}
          </button>
        ))}
      </div>

      {organizations.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No companies found"
          description="Try another search term or status filter."
        />
      ) : (
        <div className="text-sm text-slate-600" role="table" aria-label="Company directory">
          <div className="hidden grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_7rem_17rem] gap-4 border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 xl:grid" role="row">
            <span role="columnheader">Company</span>
            <span role="columnheader">Contact &amp; reference</span>
            <span role="columnheader">Status</span>
            <span role="columnheader">Actions</span>
          </div>
          <div className="divide-y divide-slate-100" role="rowgroup">
            {organizations.map((org) => (
              <article
                key={org.id}
                className="grid min-w-0 gap-5 p-4 transition-colors hover:bg-slate-50 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_7rem_17rem] xl:items-center xl:gap-4 xl:px-5 xl:py-4"
                role="row"
              >
                  <div className="min-w-0" role="cell">
                    <span className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-slate-400 xl:hidden">Company</span>
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-slate-200 bg-slate-50 text-xs font-bold text-slate-500">
                        {org.name.slice(0, 2).toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <TruncatedText className="font-bold text-slate-900" children={org.name} />
                        <TruncatedText className="mt-0.5 font-mono text-xs text-slate-500" children={org.slug} />
                      </div>
                    </div>
                  </div>
                  <div className="min-w-0" role="cell">
                    <span className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-slate-400 xl:hidden">Contact &amp; reference</span>
                    <div className="grid min-w-0 gap-0.5">
                      <TruncatedText className="font-medium text-slate-900" children={org.contact_email ?? "No contact email"} />
                      <TruncatedText className="text-xs text-slate-500" children={org.external_reference ? `Ref: ${org.external_reference}` : "No external reference"} />
                    </div>
                  </div>
                  <div className="min-w-0" role="cell">
                    <span className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-slate-400 xl:hidden">Status</span>
                    <span className={`inline-flex w-fit items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${
                      org.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"
                    }`}>
                      {org.is_active ? "Active" : "Archived"}
                    </span>
                  </div>
                  <div className="min-w-0 border-t border-slate-100 pt-4 sm:border-0 sm:pt-0" role="cell">
                    <span className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-slate-400 xl:hidden">Actions</span>
                    <div className="flex flex-wrap items-center gap-1.5 xl:flex-nowrap">
                      <Button icon={Pencil} size="small" variant="ghost" onClick={() => onEdit(org)} title="Edit company details">
                        Edit
                      </Button>
                      <Button icon={UsersRound} size="small" variant="ghost" onClick={() => onMembers(org)} title="Manage members">
                        Members
                      </Button>
                      <Button
                        icon={org.is_active ? Archive : ArchiveRestore}
                        size="small"
                        variant={org.is_active ? "danger" : "secondary"}
                        onClick={() => onToggleActive(org)}
                        title={org.is_active ? "Archive company" : "Reactivate company"}
                      >
                        {org.is_active ? "Archive" : "Reactivate"}
                      </Button>
                    </div>
                  </div>
              </article>
            ))}
          </div>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex flex-col items-center justify-between gap-4 border-t border-slate-200 p-4 sm:flex-row">
          <span className="text-xs font-medium text-slate-500">
            Page {page + 1} of {totalPages} · {filteredCount} companies
          </span>
          <div className="flex items-center gap-2">
            <Button size="small" variant="secondary" disabled={page === 0} onClick={() => onPage(Math.max(0, page - 1))}>
              Previous
            </Button>
            <Button size="small" variant="secondary" disabled={page >= totalPages - 1} onClick={() => onPage(page + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

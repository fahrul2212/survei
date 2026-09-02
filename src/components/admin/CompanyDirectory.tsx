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
    <section className="admin-table">
      <div className="admin-table__head">
        <div>
          <p className="eyebrow">Directory</p>
          <h3>Company directory</h3>
        </div>
        <SearchField
          aria-label="Search companies"
          placeholder="Search companies"
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          className="w-full max-w-xs"
        />
      </div>

      <div className="table-filters" aria-label="Filter companies by status">
        {filters.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => onStatusFilter(key)}
            className={statusFilter === key ? "filter-pill filter-pill--active" : "filter-pill"}
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
        <div className="table-scroll">
          <table className="responsive-table company-table-modern">
            <thead>
              <tr>
                <th>Company</th>
                <th>Contact &amp; reference</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {organizations.map((organization) => (
                <tr key={organization.id}>
                  <td data-label="Company">
                    <div className="company-cell min-w-0">
                      <span className="company-avatar company-avatar--small">
                        {organization.name.slice(0, 2).toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <TruncatedText className="font-semibold text-slate-950" children={organization.name} />
                        <TruncatedText className="mt-1 font-mono text-[0.7rem] text-slate-500" children={organization.slug} />
                      </div>
                    </div>
                  </td>
                  <td data-label="Contact & reference">
                    <div className="grid min-w-0 gap-1">
                      <TruncatedText
                        className="text-sm text-slate-600"
                        children={organization.contact_email ?? "No contact email"}
                      />
                      <TruncatedText
                        className="text-xs text-slate-500"
                        children={organization.external_reference ? `Ref: ${organization.external_reference}` : "No external reference"}
                      />
                    </div>
                  </td>
                  <td data-label="Status">
                    <span className={`table-status ${organization.is_active ? "table-status--submitted" : "table-status--not-started"}`}>
                      {organization.is_active ? "Active" : "Archived"}
                    </span>
                  </td>
                  <td data-label="Actions">
                    <div className="row-actions row-actions--compact">
                      <Button
                        icon={Pencil}
                        size="small"
                        variant="ghost"
                        onClick={() => onEdit(organization)}
                        title="Edit company details"
                      >
                        Edit
                      </Button>
                      <Button
                        icon={UsersRound}
                        size="small"
                        variant="ghost"
                        onClick={() => onMembers(organization)}
                        title="Manage members"
                      >
                        Members
                      </Button>
                      <Button
                        icon={organization.is_active ? Archive : ArchiveRestore}
                        size="small"
                        variant={organization.is_active ? "danger" : "secondary"}
                        onClick={() => onToggleActive(organization)}
                        title={organization.is_active ? "Archive company" : "Reactivate company"}
                      >
                        {organization.is_active ? "Archive" : "Reactivate"}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="catalog-pager">
          <Button size="small" disabled={page === 0} onClick={() => onPage(Math.max(0, page - 1))}>
            Previous
          </Button>
          <span>Page {page + 1} of {totalPages} · {filteredCount} companies</span>
          <Button size="small" disabled={page >= totalPages - 1} onClick={() => onPage(page + 1)}>
            Next
          </Button>
        </div>
      )}
    </section>
  );
}

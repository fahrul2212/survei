import { useCallback, useEffect, useMemo, useState } from "react";
import { FileClock, RefreshCw } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { formatDateTime, type AuditEventRow, type Organization } from "../../lib/portal";
import { Button, EmptyState, NoticeBar, PageHeader, TruncatedText, type Notice } from "../ui";

const PAGE_SIZE = 40;

const eventTypes = [
  "submission.submitted",
  "submission.initialized",
  "submission.reopened",
  "question.added",
  "question.updated",
  "question.removed",
  "survey.created",
  "survey.published",
  "survey.closed",
  "organization.updated",
  "member.removed",
  "member.role_updated",
  "historical.imported",
];

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) return String(error.message);
  return "The audit log could not be loaded. Please try again.";
}

function eventLabel(value: string) {
  return value.replaceAll(".", " · ").replaceAll("_", " ");
}

export function AuditLogView({ orgs }: { orgs: Organization[] }) {
  const [events, setEvents] = useState<AuditEventRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [filterOrg, setFilterOrg] = useState("");
  const [filterType, setFilterType] = useState("");
  const [notice, setNotice] = useState<Notice>(null);

  const activeFilters = useMemo(
    () => Number(Boolean(filterOrg)) + Number(Boolean(filterType)),
    [filterOrg, filterType],
  );

  const loadFromTables = useCallback(async (nextPage: number) => {
    if (!supabase) return [];

    const from = nextPage * PAGE_SIZE;
    let query = supabase
      .from("audit_events")
      .select("id,organization_id,actor_user_id,event_type,entity_type,entity_id,details,occurred_at")
      .order("occurred_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    if (filterOrg) query = query.eq("organization_id", Number(filterOrg));
    if (filterType) query = query.ilike("event_type", filterType);

    const result = await query;
    if (result.error) throw result.error;

    const actorIds = [...new Set((result.data ?? []).flatMap((row) => row.actor_user_id ? [row.actor_user_id] : []))];
    const profiles = actorIds.length
      ? await supabase.from("profiles").select("user_id,full_name").in("user_id", actorIds)
      : { data: [], error: null };
    if (profiles.error) throw profiles.error;

    const actorNames = new Map((profiles.data ?? []).map((profile) => [profile.user_id, profile.full_name]));
    const organizationNames = new Map(orgs.map((organization) => [organization.id, organization.name]));

    return (result.data ?? []).map((row) => ({
      ...row,
      organization_name: row.organization_id ? organizationNames.get(row.organization_id) ?? null : null,
      actor_email: row.actor_user_id ? actorNames.get(row.actor_user_id) ?? "Unknown user" : "System",
    })) as AuditEventRow[];
  }, [filterOrg, filterType, orgs]);

  const load = useCallback(async (nextPage = 0, reset = false) => {
    if (!supabase) return;
    setLoading(true);
    setNotice(null);

    try {
      const rows = await loadFromTables(nextPage);
      setEvents(reset ? rows : (current) => [...current, ...rows]);
      setHasMore(rows.length === PAGE_SIZE);
      setPage(nextPage);
    } catch (error) {
      setHasMore(false);
      setNotice({ kind: "error", message: errorMessage(error) });
    } finally {
      setLoading(false);
    }
  }, [filterOrg, filterType, loadFromTables]);

  useEffect(() => {
    void load(0, true);
  }, [load]);

  return (
    <div className="page">
      <PageHeader
        eyebrow="Activity trail"
        title="Audit log"
        description="Review administrative and company activity with its actor and timestamp."
        actions={(
          <Button
            icon={RefreshCw}
            size="small"
            onClick={() => void load(0, true)}
            disabled={loading}
          >
            Refresh
          </Button>
        )}
      />

      <NoticeBar notice={notice} clear={() => setNotice(null)} />

      <section className="audit-filters panel-form" aria-label="Audit log filters">
        <div className="form-grid">
          <label>
            Company
            <select value={filterOrg} onChange={(event) => setFilterOrg(event.target.value)}>
              <option value="">All companies</option>
              {orgs.map((organization) => (
                <option key={organization.id} value={organization.id}>{organization.name}</option>
              ))}
            </select>
          </label>
          <label>
            Event type
            <select value={filterType} onChange={(event) => setFilterType(event.target.value)}>
              <option value="">All events</option>
              {eventTypes.map((eventType) => (
                <option key={eventType} value={eventType}>{eventLabel(eventType)}</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="admin-table">
        <div className="admin-table__head">
          <div>
            <p className="eyebrow">Recent activity</p>
            <h3>{activeFilters ? `Filtered events (${activeFilters})` : "All events"}</h3>
          </div>
          {loading && <span className="loading-inline" role="status">Loading…</span>}
        </div>

        {events.length === 0 && !loading ? (
          <EmptyState
            icon={FileClock}
            title={notice ? "Audit log unavailable" : "No events found"}
            description={notice ? "Refresh after the database issue has been resolved." : "Try changing the filters or check back after new activity."}
          />
        ) : (
          <div className="table-scroll">
            <table className="responsive-table responsive-table--audit">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Actor</th>
                  <th>Event</th>
                  <th>Entity</th>
                  <th>Company</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => {
                  const details = Object.keys(event.details).length > 0 ? JSON.stringify(event.details) : "No details";
                  return (
                    <tr key={event.id}>
                      <td data-label="Time" className="audit-time">{formatDateTime(event.occurred_at)}</td>
                      <td data-label="Actor"><TruncatedText className="audit-actor" children={event.actor_email} /></td>
                      <td data-label="Event">
                        <span className={`audit-badge audit-badge--${event.event_type.split(".")[0]}`}>
                          {eventLabel(event.event_type)}
                        </span>
                      </td>
                      <td data-label="Entity" className="audit-entity">
                        <code>{event.entity_type}</code>
                        <small>#{event.entity_id}</small>
                      </td>
                      <td data-label="Company">
                        <TruncatedText children={event.organization_name ?? "System"} />
                      </td>
                      <td data-label="Details" className="audit-details">
                        <TruncatedText className="font-mono text-xs" children={details} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {hasMore && events.length > 0 && (
          <div className="catalog-pager">
            <Button disabled={loading} onClick={() => void load(page + 1)}>
              {loading ? "Loading…" : "Load more"}
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}

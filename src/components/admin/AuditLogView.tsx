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
  "survey.reopened",
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
    <div className="mx-auto w-full max-w-[1400px] px-4 py-8 md:px-8 lg:px-12 lg:pb-20">
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

      <section className="mb-8 rounded-xl border border-slate-200 bg-white p-4 md:p-5" aria-label="Audit log filters">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
            Company
            <select className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900 outline-none transition focus:border-[#d91f17] focus:ring-2 focus:ring-red-100" value={filterOrg} onChange={(event) => setFilterOrg(event.target.value)}>
              <option value="">All companies</option>
              {orgs.map((organization) => (
                <option key={organization.id} value={organization.id}>{organization.name}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
            Event type
            <select className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900 outline-none transition focus:border-[#d91f17] focus:ring-2 focus:ring-red-100" value={filterType} onChange={(event) => setFilterType(event.target.value)}>
              <option value="">All events</option>
              {eventTypes.map((eventType) => (
                <option key={eventType} value={eventType}>{eventLabel(eventType)}</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="mb-8 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-col gap-4 border-b border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between md:p-5">
          <div>
            <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">Recent activity</p>
            <h3 className="text-lg font-bold text-slate-900">{activeFilters ? `Filtered events (${activeFilters})` : "All events"}</h3>
          </div>
          {loading && <span className="text-sm font-medium text-slate-500" role="status">Loading…</span>}
        </div>

        {events.length === 0 && !loading ? (
          <EmptyState
            icon={FileClock}
            title={notice ? "Audit log unavailable" : "No events found"}
            description={notice ? "Refresh after the database issue has been resolved." : "Try changing the filters or check back after new activity."}
          />
        ) : (
          <div className="text-sm text-slate-600" role="table" aria-label="Audit events">
            <div className="hidden grid-cols-[9rem_minmax(0,0.8fr)_minmax(8rem,1fr)_7rem_minmax(0,0.8fr)_minmax(0,1fr)] gap-4 border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 xl:grid" role="row">
              <span role="columnheader">Time</span>
              <span role="columnheader">Actor</span>
              <span role="columnheader">Event</span>
              <span role="columnheader">Entity</span>
              <span role="columnheader">Company</span>
              <span role="columnheader">Details</span>
            </div>
            <div className="divide-y divide-slate-100" role="rowgroup">
                {events.map((event) => {
                  const details = Object.keys(event.details).length > 0 ? JSON.stringify(event.details) : "No details";
                  return (
                    <article key={event.id} className="grid min-w-0 gap-5 p-4 transition-colors hover:bg-slate-50 sm:grid-cols-2 xl:grid-cols-[9rem_minmax(0,0.8fr)_minmax(8rem,1fr)_7rem_minmax(0,0.8fr)_minmax(0,1fr)] xl:items-center xl:gap-4 xl:px-5 xl:py-4" role="row">
                      <div className="min-w-0" role="cell">
                        <span className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-slate-400 xl:hidden">Time</span>
                        <span className="font-mono text-[11px] font-medium text-slate-500">{formatDateTime(event.occurred_at)}</span>
                      </div>
                      <div className="min-w-0" role="cell">
                        <span className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-slate-400 xl:hidden">Actor</span>
                        <TruncatedText className="font-medium text-slate-900" children={event.actor_email} />
                      </div>
                      <div className="min-w-0" role="cell">
                        <span className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-slate-400 xl:hidden">Event</span>
                        <span className="inline-flex w-fit rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                          {eventLabel(event.event_type)}
                        </span>
                      </div>
                      <div className="min-w-0" role="cell">
                        <span className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-slate-400 xl:hidden">Entity</span>
                        <div className="flex flex-col gap-0.5">
                          <code className="text-xs text-slate-700">{event.entity_type}</code>
                          <small className="font-mono text-[10px] text-slate-400">#{event.entity_id}</small>
                        </div>
                      </div>
                      <div className="min-w-0" role="cell">
                        <span className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-slate-400 xl:hidden">Company</span>
                        <TruncatedText className="font-medium text-slate-700" children={event.organization_name ?? "System"} />
                      </div>
                      <div className="min-w-0 border-t border-slate-100 pt-4 sm:border-0 sm:pt-0" role="cell">
                        <span className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-slate-400 xl:hidden">Details</span>
                        <TruncatedText className="font-mono text-[10px] text-slate-500" children={details} />
                      </div>
                    </article>
                  );
                })}
            </div>
          </div>
        )}

        {hasMore && events.length > 0 && (
          <div className="flex items-center justify-center border-t border-slate-200 bg-slate-50 p-4">
            <Button disabled={loading} variant="secondary" onClick={() => void load(page + 1)}>
              {loading ? "Loading…" : "Load more"}
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}

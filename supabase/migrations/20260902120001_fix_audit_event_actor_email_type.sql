-- auth.users.email is varchar while the public RPC contract returns text.
-- Cast explicitly so PostgreSQL can validate the RETURNS TABLE structure.
create or replace function app_private.get_audit_events(
  page_limit        integer default 50,
  page_offset       integer default 0,
  filter_org_id     bigint  default null,
  filter_event_type text    default null
)
returns table (
  id                bigint,
  organization_id   bigint,
  organization_name text,
  actor_user_id     uuid,
  actor_email       text,
  event_type        text,
  entity_type       text,
  entity_id         text,
  details           jsonb,
  occurred_at       timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app_private.is_platform_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  return query
  select
    ae.id,
    ae.organization_id,
    o.name as organization_name,
    ae.actor_user_id,
    coalesce(u.email::text, 'system') as actor_email,
    ae.event_type,
    ae.entity_type,
    ae.entity_id,
    ae.details,
    ae.occurred_at
  from public.audit_events ae
  left join public.organizations o on o.id = ae.organization_id
  left join auth.users u on u.id = ae.actor_user_id
  where (filter_org_id is null or ae.organization_id = filter_org_id)
    and (filter_event_type is null or ae.event_type ilike filter_event_type)
  order by ae.occurred_at desc
  limit page_limit
  offset page_offset;
end;
$$;

revoke all on function app_private.get_audit_events(integer, integer, bigint, text)
from public, anon, authenticated;

grant execute on function app_private.get_audit_events(integer, integer, bigint, text)
to authenticated;

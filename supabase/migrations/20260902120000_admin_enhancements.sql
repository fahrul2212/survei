-- =============================================================================
-- Admin Enhancements Migration
-- Adds: organization editing, member management, year closing,
--       question reordering, audit log viewer, and pivot export support.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. get_organization_members — returns members with auth email (admin only)
-- ---------------------------------------------------------------------------
create or replace function app_private.get_organization_members(target_organization_id bigint)
returns table (
  user_id     uuid,
  role        text,
  full_name   text,
  email       text,
  created_at  timestamptz
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
    om.user_id,
    om.role,
    p.full_name,
    coalesce(u.email, '') as email,
    om.created_at
  from public.organization_members om
  join public.profiles p on p.user_id = om.user_id
  join auth.users u on u.id = om.user_id
  where om.organization_id = target_organization_id
  order by om.created_at;
end;
$$;

revoke all on function app_private.get_organization_members(bigint) from public, anon, authenticated;
grant execute on function app_private.get_organization_members(bigint) to authenticated;

create or replace function public.get_organization_members(target_organization_id bigint)
returns table (
  user_id     uuid,
  role        text,
  full_name   text,
  email       text,
  created_at  timestamptz
)
language sql
security invoker
set search_path = ''
as $$ select * from app_private.get_organization_members($1); $$;

revoke all on function public.get_organization_members(bigint) from public, anon;
grant execute on function public.get_organization_members(bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. update_organization — edit org name, email, external reference (admin only)
-- ---------------------------------------------------------------------------
create or replace function app_private.update_organization(
  target_organization_id  bigint,
  new_name                text,
  new_contact_email       text default null,
  new_external_reference  text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
begin
  if caller_id is null or not app_private.is_platform_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  if btrim(coalesce(new_name, '')) = '' then
    raise exception 'Organization name cannot be blank';
  end if;

  update public.organizations
  set
    name               = btrim(new_name),
    contact_email      = nullif(lower(btrim(coalesce(new_contact_email, ''))), ''),
    external_reference = nullif(btrim(coalesce(new_external_reference, '')), '')
  where id = target_organization_id;

  if not found then
    raise exception 'Organization not found';
  end if;

  insert into public.audit_events (
    organization_id, actor_user_id, event_type, entity_type, entity_id, details
  ) values (
    target_organization_id,
    caller_id,
    'organization.updated',
    'organization',
    target_organization_id::text,
    jsonb_build_object('name', new_name)
  );
end;
$$;

revoke all on function app_private.update_organization(bigint, text, text, text) from public, anon, authenticated;
grant execute on function app_private.update_organization(bigint, text, text, text) to authenticated;

create or replace function public.update_organization(
  target_organization_id  bigint,
  new_name                text,
  new_contact_email       text default null,
  new_external_reference  text default null
)
returns void
language sql
security invoker
set search_path = ''
as $$ select app_private.update_organization($1, $2, $3, $4); $$;

revoke all on function public.update_organization(bigint, text, text, text) from public, anon;
grant execute on function public.update_organization(bigint, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. remove_organization_member — unlink a user from an org (admin only)
-- ---------------------------------------------------------------------------
create or replace function app_private.remove_organization_member(
  target_organization_id bigint,
  target_user_id         uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
begin
  if caller_id is null or not app_private.is_platform_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  delete from public.organization_members
  where organization_id = target_organization_id
    and user_id = target_user_id;

  if not found then
    raise exception 'Member not found';
  end if;

  insert into public.audit_events (
    organization_id, actor_user_id, event_type, entity_type, entity_id, details
  ) values (
    target_organization_id,
    caller_id,
    'member.removed',
    'organization_member',
    target_user_id::text,
    jsonb_build_object('organization_id', target_organization_id)
  );
end;
$$;

revoke all on function app_private.remove_organization_member(bigint, uuid) from public, anon, authenticated;
grant execute on function app_private.remove_organization_member(bigint, uuid) to authenticated;

create or replace function public.remove_organization_member(
  target_organization_id bigint,
  target_user_id         uuid
)
returns void
language sql
security invoker
set search_path = ''
as $$ select app_private.remove_organization_member($1, $2); $$;

revoke all on function public.remove_organization_member(bigint, uuid) from public, anon;
grant execute on function public.remove_organization_member(bigint, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. update_member_role — change member role (admin only)
-- ---------------------------------------------------------------------------
create or replace function app_private.update_member_role(
  target_organization_id bigint,
  target_user_id         uuid,
  new_role               text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
begin
  if caller_id is null or not app_private.is_platform_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  if new_role not in ('member', 'company_admin') then
    raise exception 'Invalid role: must be member or company_admin';
  end if;

  update public.organization_members
  set role = new_role
  where organization_id = target_organization_id
    and user_id = target_user_id;

  if not found then
    raise exception 'Member not found';
  end if;

  insert into public.audit_events (
    organization_id, actor_user_id, event_type, entity_type, entity_id, details
  ) values (
    target_organization_id,
    caller_id,
    'member.role_updated',
    'organization_member',
    target_user_id::text,
    jsonb_build_object('new_role', new_role)
  );
end;
$$;

revoke all on function app_private.update_member_role(bigint, uuid, text) from public, anon, authenticated;
grant execute on function app_private.update_member_role(bigint, uuid, text) to authenticated;

create or replace function public.update_member_role(
  target_organization_id bigint,
  target_user_id         uuid,
  new_role               text
)
returns void
language sql
security invoker
set search_path = ''
as $$ select app_private.update_member_role($1, $2, $3); $$;

revoke all on function public.update_member_role(bigint, uuid, text) from public, anon;
grant execute on function public.update_member_role(bigint, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. close_survey_year — move a published survey to closed state (admin only)
-- ---------------------------------------------------------------------------
create or replace function app_private.close_survey_year(target_survey_version_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
begin
  if caller_id is null or not app_private.is_platform_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  update public.survey_versions
  set status = 'closed'
  where id = target_survey_version_id and status = 'published';

  if not found then
    raise exception 'Published survey version not found';
  end if;

  insert into public.audit_events (
    actor_user_id, event_type, entity_type, entity_id, details
  ) values (
    caller_id,
    'survey.closed',
    'survey_version',
    target_survey_version_id::text,
    '{}'::jsonb
  );
end;
$$;

revoke all on function app_private.close_survey_year(bigint) from public, anon, authenticated;
grant execute on function app_private.close_survey_year(bigint) to authenticated;

create or replace function public.close_survey_year(target_survey_version_id bigint)
returns void
language sql
security invoker
set search_path = ''
as $$ select app_private.close_survey_year($1); $$;

revoke all on function public.close_survey_year(bigint) from public, anon;
grant execute on function public.close_survey_year(bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. reorder_survey_question — swap display_order with adjacent question (admin only)
--    direction: 'up' (lower order) or 'down' (higher order)
-- ---------------------------------------------------------------------------
create or replace function app_private.reorder_survey_question(
  target_survey_question_id bigint,
  direction                 text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id     uuid := (select auth.uid());
  current_order smallint;
  version_id    bigint;
  swap_order    smallint;
  swap_id       bigint;
  temp_order    smallint;
begin
  if caller_id is null or not app_private.is_platform_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  select sq.display_order, sq.survey_version_id
  into current_order, version_id
  from public.survey_questions sq
  join public.survey_versions sv on sv.id = sq.survey_version_id
  where sq.id = target_survey_question_id
    and sv.status = 'draft'
  for update;

  if not found then
    raise exception 'Question not found in a draft survey';
  end if;

  if direction = 'up' then
    select id, display_order into swap_id, swap_order
    from public.survey_questions
    where survey_version_id = version_id
      and display_order < current_order
    order by display_order desc
    limit 1;
  else
    select id, display_order into swap_id, swap_order
    from public.survey_questions
    where survey_version_id = version_id
      and display_order > current_order
    order by display_order asc
    limit 1;
  end if;

  if swap_id is null then
    return;
  end if;

  -- Use a high temporary value to avoid unique-constraint collision during swap
  select max(display_order) + 1000 into temp_order
  from public.survey_questions
  where survey_version_id = version_id;

  update public.survey_questions set display_order = temp_order    where id = target_survey_question_id;
  update public.survey_questions set display_order = current_order where id = swap_id;
  update public.survey_questions set display_order = swap_order    where id = target_survey_question_id;
end;
$$;

revoke all on function app_private.reorder_survey_question(bigint, text) from public, anon, authenticated;
grant execute on function app_private.reorder_survey_question(bigint, text) to authenticated;

create or replace function public.reorder_survey_question(
  target_survey_question_id bigint,
  direction                 text
)
returns void
language sql
security invoker
set search_path = ''
as $$ select app_private.reorder_survey_question($1, $2); $$;

revoke all on function public.reorder_survey_question(bigint, text) from public, anon;
grant execute on function public.reorder_survey_question(bigint, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. get_audit_events — paginated audit log with org name and actor email
-- ---------------------------------------------------------------------------
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
    o.name    as organization_name,
    ae.actor_user_id,
    coalesce(u.email, 'system') as actor_email,
    ae.event_type,
    ae.entity_type,
    ae.entity_id,
    ae.details,
    ae.occurred_at
  from public.audit_events ae
  left join public.organizations o on o.id = ae.organization_id
  left join auth.users u on u.id = ae.actor_user_id
  where (filter_org_id     is null or ae.organization_id = filter_org_id)
    and (filter_event_type is null or ae.event_type ilike filter_event_type)
  order by ae.occurred_at desc
  limit  page_limit
  offset page_offset;
end;
$$;

revoke all on function app_private.get_audit_events(integer, integer, bigint, text) from public, anon, authenticated;
grant execute on function app_private.get_audit_events(integer, integer, bigint, text) to authenticated;

create or replace function public.get_audit_events(
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
language sql
security invoker
set search_path = ''
as $$ select * from app_private.get_audit_events($1, $2, $3, $4); $$;

revoke all on function public.get_audit_events(integer, integer, bigint, text) from public, anon;
grant execute on function public.get_audit_events(integer, integer, bigint, text) to authenticated;

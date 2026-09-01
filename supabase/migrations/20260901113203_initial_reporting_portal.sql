create schema if not exists app_private;

revoke all on schema app_private from public, anon, authenticated;
grant usage on schema app_private to authenticated;

create table public.organizations (
  id bigint generated always as identity primary key,
  name text not null,
  slug text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint organizations_name_not_blank check (btrim(name) <> ''),
  constraint organizations_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_full_name_not_blank check (btrim(full_name) <> '')
);

create table public.organization_members (
  organization_id bigint not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member',
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id),
  constraint organization_members_role_valid check (role in ('member', 'company_admin'))
);

create index organization_members_user_id_idx on public.organization_members (user_id);

create table public.survey_versions (
  id bigint generated always as identity primary key,
  reporting_year smallint not null unique,
  name text not null,
  status text not null default 'draft',
  opens_at timestamptz,
  closes_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint survey_versions_year_valid check (reporting_year between 2020 and 2200),
  constraint survey_versions_status_valid check (status in ('draft', 'published', 'closed')),
  constraint survey_versions_dates_valid check (closes_at is null or opens_at is null or closes_at > opens_at)
);

create table public.question_definitions (
  id bigint generated always as identity primary key,
  stable_key text not null unique,
  category text not null,
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  constraint question_definitions_key_format check (stable_key ~ '^[A-Z][A-Z0-9]*-[0-9]{3,}$'),
  constraint question_definitions_category_not_blank check (btrim(category) <> '')
);

create table public.question_revisions (
  id bigint generated always as identity primary key,
  question_id bigint not null references public.question_definitions(id) on delete restrict,
  revision_number smallint not null,
  prompt text not null,
  help_text text,
  question_type text not null,
  options jsonb not null default '[]'::jsonb,
  validation jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (question_id, revision_number),
  constraint question_revisions_revision_positive check (revision_number > 0),
  constraint question_revisions_prompt_not_blank check (btrim(prompt) <> ''),
  constraint question_revisions_type_valid check (question_type in ('text', 'textarea', 'number', 'yes_no', 'single_choice', 'multiple_choice', 'date')),
  constraint question_revisions_options_array check (jsonb_typeof(options) = 'array'),
  constraint question_revisions_validation_object check (jsonb_typeof(validation) = 'object')
);

create index question_revisions_question_id_idx on public.question_revisions (question_id);

create table public.survey_questions (
  id bigint generated always as identity primary key,
  survey_version_id bigint not null references public.survey_versions(id) on delete cascade,
  question_revision_id bigint not null references public.question_revisions(id) on delete restrict,
  display_order smallint not null,
  is_required boolean not null default false,
  carry_forward_enabled boolean not null default true,
  visibility_rule jsonb not null default '{}'::jsonb,
  unique (survey_version_id, question_revision_id),
  unique (survey_version_id, display_order),
  constraint survey_questions_order_positive check (display_order > 0),
  constraint survey_questions_visibility_object check (jsonb_typeof(visibility_rule) = 'object')
);

create index survey_questions_revision_id_idx on public.survey_questions (question_revision_id);

create table public.question_carry_forward_rules (
  target_survey_question_id bigint primary key references public.survey_questions(id) on delete cascade,
  source_question_id bigint not null references public.question_definitions(id) on delete restrict,
  mapping_type text not null,
  approved_by uuid references auth.users(id) on delete set null,
  approval_note text,
  created_at timestamptz not null default now(),
  constraint question_carry_forward_mapping_type_valid check (mapping_type in ('same_identity', 'manual'))
);

create index question_carry_forward_rules_source_question_id_idx on public.question_carry_forward_rules (source_question_id);
create index question_carry_forward_rules_approved_by_idx on public.question_carry_forward_rules (approved_by);

create table public.company_submissions (
  id bigint generated always as identity primary key,
  organization_id bigint not null references public.organizations(id) on delete restrict,
  survey_version_id bigint not null references public.survey_versions(id) on delete restrict,
  status text not null default 'draft',
  current_section text,
  submitted_at timestamptz,
  submitted_by uuid references auth.users(id) on delete set null,
  reopened_at timestamptz,
  revision_number smallint not null default 0,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, survey_version_id),
  constraint company_submissions_status_valid check (status in ('draft', 'submitted', 'reopened')),
  constraint company_submissions_revision_nonnegative check (revision_number >= 0)
);

create index company_submissions_organization_id_idx on public.company_submissions (organization_id);
create index company_submissions_survey_version_id_idx on public.company_submissions (survey_version_id);
create index company_submissions_created_by_idx on public.company_submissions (created_by);
create index company_submissions_status_idx on public.company_submissions (status);

create table public.answers (
  id bigint generated always as identity primary key,
  submission_id bigint not null references public.company_submissions(id) on delete cascade,
  survey_question_id bigint not null references public.survey_questions(id) on delete restrict,
  value jsonb not null,
  provenance text not null default 'manual',
  source_answer_id bigint references public.answers(id) on delete set null,
  updated_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (submission_id, survey_question_id),
  constraint answers_provenance_valid check (provenance in ('manual', 'prefilled', 'historical_import'))
);

create index answers_submission_id_idx on public.answers (submission_id);
create index answers_survey_question_id_idx on public.answers (survey_question_id);
create index answers_source_answer_id_idx on public.answers (source_answer_id);
create index answers_updated_by_idx on public.answers (updated_by);

create table public.submission_snapshots (
  id bigint generated always as identity primary key,
  submission_id bigint not null references public.company_submissions(id) on delete restrict,
  revision_number smallint not null,
  payload jsonb not null,
  submitted_by uuid not null references auth.users(id) on delete restrict,
  submitted_at timestamptz not null default now(),
  unique (submission_id, revision_number),
  constraint submission_snapshots_payload_array check (jsonb_typeof(payload) = 'array'),
  constraint submission_snapshots_revision_positive check (revision_number > 0)
);

create index submission_snapshots_submission_id_idx on public.submission_snapshots (submission_id);
create index submission_snapshots_submitted_by_idx on public.submission_snapshots (submitted_by);

create table public.audit_events (
  id bigint generated always as identity primary key,
  organization_id bigint references public.organizations(id) on delete restrict,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  entity_type text not null,
  entity_id text not null,
  details jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  constraint audit_events_event_type_not_blank check (btrim(event_type) <> ''),
  constraint audit_events_entity_type_not_blank check (btrim(entity_type) <> ''),
  constraint audit_events_details_object check (jsonb_typeof(details) = 'object')
);

create index audit_events_organization_id_idx on public.audit_events (organization_id);
create index audit_events_actor_user_id_idx on public.audit_events (actor_user_id);
create index audit_events_occurred_at_idx on public.audit_events (occurred_at desc);

create or replace function app_private.is_platform_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'platform_admin', false);
$$;

create or replace function app_private.is_organization_member(target_organization_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.organization_members member
      where member.organization_id = target_organization_id
        and member.user_id = (select auth.uid())
    );
$$;

revoke all on function app_private.is_platform_admin() from public, anon;
revoke all on function app_private.is_organization_member(bigint) from public, anon;
grant execute on function app_private.is_platform_admin() to authenticated;
grant execute on function app_private.is_organization_member(bigint) to authenticated;

create or replace function app_private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles for each row execute function app_private.set_updated_at();
create trigger survey_versions_set_updated_at before update on public.survey_versions for each row execute function app_private.set_updated_at();
create trigger company_submissions_set_updated_at before update on public.company_submissions for each row execute function app_private.set_updated_at();
create trigger answers_set_updated_at before update on public.answers for each row execute function app_private.set_updated_at();

create or replace function app_private.submit_submission(target_submission_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  submission_row public.company_submissions%rowtype;
  next_revision smallint;
  snapshot_payload jsonb;
begin
  if caller_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select * into submission_row
  from public.company_submissions
  where id = target_submission_id
  for update;

  if not found or not app_private.is_organization_member(submission_row.organization_id) then
    raise exception 'Submission not found' using errcode = '42501';
  end if;

  if submission_row.status not in ('draft', 'reopened') then
    raise exception 'Only draft or reopened submissions can be submitted';
  end if;

  if exists (
    select 1
    from public.survey_questions survey_question
    where survey_question.survey_version_id = submission_row.survey_version_id
      and survey_question.is_required
      and not exists (
        select 1 from public.answers answer
        where answer.submission_id = submission_row.id
          and answer.survey_question_id = survey_question.id
          and answer.value not in ('null'::jsonb, '""'::jsonb)
      )
  ) then
    raise exception 'Required answers are missing';
  end if;

  next_revision := submission_row.revision_number + 1;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'survey_question_id', answer.survey_question_id,
        'value', answer.value,
        'provenance', answer.provenance
      ) order by survey_question.display_order
    ),
    '[]'::jsonb
  ) into snapshot_payload
  from public.answers answer
  join public.survey_questions survey_question on survey_question.id = answer.survey_question_id
  where answer.submission_id = submission_row.id;

  insert into public.submission_snapshots (submission_id, revision_number, payload, submitted_by)
  values (submission_row.id, next_revision, snapshot_payload, caller_id);

  update public.company_submissions
  set status = 'submitted', submitted_at = now(), submitted_by = caller_id, revision_number = next_revision
  where id = submission_row.id;

  insert into public.audit_events (organization_id, actor_user_id, event_type, entity_type, entity_id, details)
  values (submission_row.organization_id, caller_id, 'submission.submitted', 'company_submission', submission_row.id::text, jsonb_build_object('revision_number', next_revision));
end;
$$;

create or replace function app_private.reopen_submission(target_submission_id bigint, reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  submission_row public.company_submissions%rowtype;
begin
  if caller_id is null or not app_private.is_platform_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  if btrim(coalesce(reason, '')) = '' then
    raise exception 'A reopen reason is required';
  end if;

  select * into submission_row from public.company_submissions where id = target_submission_id for update;
  if not found or submission_row.status <> 'submitted' then
    raise exception 'A submitted report is required';
  end if;

  update public.company_submissions set status = 'reopened', reopened_at = now() where id = submission_row.id;

  insert into public.audit_events (organization_id, actor_user_id, event_type, entity_type, entity_id, details)
  values (submission_row.organization_id, caller_id, 'submission.reopened', 'company_submission', submission_row.id::text, jsonb_build_object('reason', reason));
end;
$$;

revoke all on function app_private.submit_submission(bigint) from public, anon;
revoke all on function app_private.reopen_submission(bigint, text) from public, anon;
grant execute on function app_private.submit_submission(bigint) to authenticated;
grant execute on function app_private.reopen_submission(bigint, text) to authenticated;

create or replace function public.submit_submission(target_submission_id bigint)
returns void
language sql
security invoker
set search_path = ''
as $$
  select app_private.submit_submission($1);
$$;

create or replace function public.reopen_submission(target_submission_id bigint, reason text)
returns void
language sql
security invoker
set search_path = ''
as $$
  select app_private.reopen_submission($1, $2);
$$;

revoke all on function public.submit_submission(bigint) from public, anon;
revoke all on function public.reopen_submission(bigint, text) from public, anon;
grant execute on function public.submit_submission(bigint) to authenticated;
grant execute on function public.reopen_submission(bigint, text) to authenticated;

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.organization_members enable row level security;
alter table public.survey_versions enable row level security;
alter table public.question_definitions enable row level security;
alter table public.question_revisions enable row level security;
alter table public.survey_questions enable row level security;
alter table public.question_carry_forward_rules enable row level security;
alter table public.company_submissions enable row level security;
alter table public.answers enable row level security;
alter table public.submission_snapshots enable row level security;
alter table public.audit_events enable row level security;

revoke all on all tables in schema public from anon, authenticated;

grant select on public.organizations, public.profiles, public.organization_members, public.survey_versions, public.question_definitions, public.question_revisions, public.survey_questions, public.question_carry_forward_rules, public.company_submissions, public.answers, public.submission_snapshots, public.audit_events to authenticated;
grant insert, update, delete on public.organizations, public.survey_versions, public.question_definitions, public.question_revisions, public.survey_questions, public.question_carry_forward_rules to authenticated;
grant insert, update, delete on public.organization_members to authenticated;
grant insert on public.company_submissions to authenticated;
grant update (current_section, updated_at) on public.company_submissions to authenticated;
grant insert, update on public.answers to authenticated;
grant update (full_name, updated_at) on public.profiles to authenticated;
grant usage, select on all sequences in schema public to authenticated;

create policy organizations_select on public.organizations for select to authenticated
using ((select app_private.is_platform_admin()) or (select app_private.is_organization_member(id)));
create policy organizations_admin_all on public.organizations for all to authenticated
using ((select app_private.is_platform_admin())) with check ((select app_private.is_platform_admin()));

create policy profiles_select on public.profiles for select to authenticated
using (user_id = (select auth.uid()) or (select app_private.is_platform_admin()));
create policy profiles_update_self on public.profiles for update to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy organization_members_select on public.organization_members for select to authenticated
using (user_id = (select auth.uid()) or (select app_private.is_platform_admin()));
create policy organization_members_admin_all on public.organization_members for all to authenticated
using ((select app_private.is_platform_admin())) with check ((select app_private.is_platform_admin()));

create policy survey_versions_select on public.survey_versions for select to authenticated
using (status in ('published', 'closed') or (select app_private.is_platform_admin()));
create policy survey_versions_admin_all on public.survey_versions for all to authenticated
using ((select app_private.is_platform_admin())) with check ((select app_private.is_platform_admin()));

create policy question_definitions_select on public.question_definitions for select to authenticated using (true);
create policy question_definitions_admin_all on public.question_definitions for all to authenticated using ((select app_private.is_platform_admin())) with check ((select app_private.is_platform_admin()));
create policy question_revisions_select on public.question_revisions for select to authenticated using (true);
create policy question_revisions_admin_all on public.question_revisions for all to authenticated using ((select app_private.is_platform_admin())) with check ((select app_private.is_platform_admin()));
create policy survey_questions_select on public.survey_questions for select to authenticated
using (exists (select 1 from public.survey_versions version where version.id = survey_version_id and (version.status in ('published', 'closed') or (select app_private.is_platform_admin()))));
create policy survey_questions_admin_all on public.survey_questions for all to authenticated using ((select app_private.is_platform_admin())) with check ((select app_private.is_platform_admin()));
create policy carry_forward_rules_select on public.question_carry_forward_rules for select to authenticated using (true);
create policy carry_forward_rules_admin_all on public.question_carry_forward_rules for all to authenticated using ((select app_private.is_platform_admin())) with check ((select app_private.is_platform_admin()));

create policy company_submissions_select on public.company_submissions for select to authenticated
using ((select app_private.is_platform_admin()) or (select app_private.is_organization_member(organization_id)));
create policy company_submissions_insert on public.company_submissions for insert to authenticated
with check ((select app_private.is_organization_member(organization_id)) and created_by = (select auth.uid()) and status = 'draft');
create policy company_submissions_update on public.company_submissions for update to authenticated
using ((select app_private.is_organization_member(organization_id)) and status in ('draft', 'reopened'))
with check ((select app_private.is_organization_member(organization_id)) and status in ('draft', 'reopened'));

create policy answers_select on public.answers for select to authenticated
using ((select app_private.is_platform_admin()) or exists (select 1 from public.company_submissions submission where submission.id = submission_id and (select app_private.is_organization_member(submission.organization_id))));
create policy answers_insert on public.answers for insert to authenticated
with check (updated_by = (select auth.uid()) and exists (select 1 from public.company_submissions submission where submission.id = submission_id and submission.status in ('draft', 'reopened') and (select app_private.is_organization_member(submission.organization_id))));
create policy answers_update on public.answers for update to authenticated
using (exists (select 1 from public.company_submissions submission where submission.id = submission_id and submission.status in ('draft', 'reopened') and (select app_private.is_organization_member(submission.organization_id))))
with check (updated_by = (select auth.uid()) and exists (select 1 from public.company_submissions submission where submission.id = submission_id and submission.status in ('draft', 'reopened') and (select app_private.is_organization_member(submission.organization_id))));

create policy submission_snapshots_select on public.submission_snapshots for select to authenticated
using ((select app_private.is_platform_admin()) or exists (select 1 from public.company_submissions submission where submission.id = submission_id and (select app_private.is_organization_member(submission.organization_id))));
create policy audit_events_select on public.audit_events for select to authenticated
using ((select app_private.is_platform_admin()) or (organization_id is not null and (select app_private.is_organization_member(organization_id))));

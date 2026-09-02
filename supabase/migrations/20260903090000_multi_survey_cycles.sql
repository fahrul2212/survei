begin;

-- A reporting year can contain multiple independently managed surveys. Exact
-- duplicates are still rejected so accidental double submissions stay safe.
alter table public.survey_versions
  drop constraint if exists survey_versions_reporting_year_key;

alter table public.survey_versions
  add constraint survey_versions_year_name_key unique (reporting_year, name);

create index if not exists survey_versions_year_status_idx
  on public.survey_versions (reporting_year desc, status, id desc);

-- Use unambiguous variable names and allow a later survey in the same year to
-- carry forward from an earlier submitted survey in that year.
create or replace function app_private.initialize_submission(
  target_survey_version_id bigint,
  target_organization_id bigint default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  member_organization_id bigint;
  created_submission_id bigint;
  source_submission_id bigint;
  target_year smallint;
begin
  if caller_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select version.reporting_year into target_year
  from public.survey_versions version
  where version.id = target_survey_version_id and version.status = 'published';

  if target_year is null then
    raise exception 'Published survey version not found';
  end if;

  if target_organization_id is not null and app_private.is_platform_admin() then
    member_organization_id := target_organization_id;
  else
    select member.organization_id into member_organization_id
    from public.organization_members member
    join public.organizations organization on organization.id = member.organization_id
    where member.user_id = caller_id and organization.is_active
    order by member.organization_id
    limit 1;
  end if;

  if member_organization_id is null then
    raise exception 'No active company membership found' using errcode = '42501';
  end if;

  insert into public.company_submissions (
    organization_id, survey_version_id, status, created_by
  )
  values (member_organization_id, target_survey_version_id, 'draft', caller_id)
  on conflict (organization_id, survey_version_id)
  do update set updated_at = public.company_submissions.updated_at
  returning id into created_submission_id;

  if exists (
    select 1 from public.company_submissions submission
    where submission.id = created_submission_id and submission.status = 'submitted'
  ) then
    return created_submission_id;
  end if;

  select submission.id into source_submission_id
  from public.company_submissions submission
  join public.survey_versions version on version.id = submission.survey_version_id
  where submission.organization_id = member_organization_id
    and submission.status = 'submitted'
    and version.id <> target_survey_version_id
    and (
      version.reporting_year < target_year
      or (version.reporting_year = target_year and version.id < target_survey_version_id)
    )
  order by version.reporting_year desc, version.id desc, submission.submitted_at desc nulls last
  limit 1;

  if source_submission_id is not null then
    insert into public.answers (
      submission_id,
      survey_question_id,
      value,
      provenance,
      source_answer_id,
      updated_by
    )
    select
      created_submission_id,
      target_question.id,
      source_answer.value,
      'prefilled',
      source_answer.id,
      caller_id
    from public.survey_questions target_question
    join public.question_carry_forward_rules carry_rule
      on carry_rule.target_survey_question_id = target_question.id
    join public.answers source_answer
      on source_answer.submission_id = source_submission_id
    join public.survey_questions source_question
      on source_question.id = source_answer.survey_question_id
    join public.question_revisions source_revision
      on source_revision.id = source_question.question_revision_id
      and source_revision.question_id = carry_rule.source_question_id
    where target_question.survey_version_id = target_survey_version_id
      and target_question.carry_forward_enabled
    on conflict (submission_id, survey_question_id) do nothing;
  end if;

  insert into public.audit_events (
    organization_id, actor_user_id, event_type, entity_type, entity_id, details
  ) values (
    member_organization_id,
    caller_id,
    'submission.initialized',
    'company_submission',
    created_submission_id::text,
    jsonb_build_object('survey_version_id', target_survey_version_id, 'source_submission_id', source_submission_id)
  );

  return created_submission_id;
end;
$$;

-- Historical imports use one named archive per year now that reporting_year is
-- no longer globally unique.
create or replace function app_private.import_historical_responses(import_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  item jsonb;
  target_organization_id bigint;
  target_version_id bigint;
  target_definition_id bigint;
  target_revision_id bigint;
  target_question_id bigint;
  target_submission_id bigint;
  next_display_order smallint;
  imported_count integer := 0;
  imported_submission_ids bigint[] := '{}'::bigint[];
  snapshot_submission_id bigint;
  normalized_answer jsonb;
begin
  if caller_id is null or not app_private.is_platform_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  if jsonb_typeof(import_rows) <> 'array' then
    raise exception 'Historical import payload must be an array';
  end if;

  for item in select value from jsonb_array_elements(import_rows)
  loop
    if coalesce(item ->> 'company_slug', '') = ''
      or coalesce(item ->> 'company_name', '') = ''
      or coalesce(item ->> 'reporting_year', '') = ''
      or coalesce(item ->> 'question_key', '') = '' then
      raise exception 'Each row requires company_name, company_slug, reporting_year, and question_key';
    end if;

    insert into public.organizations (name, slug, contact_email, external_reference)
    values (
      btrim(item ->> 'company_name'),
      lower(btrim(item ->> 'company_slug')),
      nullif(lower(btrim(item ->> 'contact_email')), ''),
      nullif(btrim(item ->> 'external_reference'), '')
    )
    on conflict (slug) do update
    set name = excluded.name,
        contact_email = coalesce(excluded.contact_email, public.organizations.contact_email),
        external_reference = coalesce(excluded.external_reference, public.organizations.external_reference)
    returning id into target_organization_id;

    insert into public.survey_versions (reporting_year, name, status, published_at)
    values (
      (item ->> 'reporting_year')::smallint,
      'Climate Transition Plan Annual Report ' || (item ->> 'reporting_year'),
      'closed',
      now()
    )
    on conflict (reporting_year, name) do update
    set name = public.survey_versions.name
    returning id into target_version_id;

    if exists (
      select 1 from public.survey_versions
      where id = target_version_id and status = 'published'
    ) then
      raise exception 'Historical import cannot modify a published survey';
    end if;

    insert into public.question_definitions (stable_key, category)
    values (
      upper(btrim(item ->> 'question_key')),
      coalesce(nullif(btrim(item ->> 'category'), ''), 'Historical import')
    )
    on conflict (stable_key) do update set category = public.question_definitions.category
    returning id into target_definition_id;

    select id into target_revision_id
    from public.question_revisions
    where question_id = target_definition_id
    order by revision_number desc
    limit 1;

    if target_revision_id is null then
      insert into public.question_revisions (
        question_id, revision_number, prompt, question_type, options
      ) values (
        target_definition_id,
        1,
        coalesce(nullif(btrim(item ->> 'question_prompt'), ''), upper(btrim(item ->> 'question_key'))),
        coalesce(nullif(item ->> 'question_type', ''), 'text'),
        '[]'::jsonb
      ) returning id into target_revision_id;
    end if;

    select survey_question.id into target_question_id
    from public.survey_questions survey_question
    join public.question_revisions revision on revision.id = survey_question.question_revision_id
    where survey_question.survey_version_id = target_version_id
      and revision.question_id = target_definition_id;

    if target_question_id is null then
      select coalesce(max(survey_question.display_order), 0) + 1 into next_display_order
      from public.survey_questions survey_question
      where survey_question.survey_version_id = target_version_id;

      insert into public.survey_questions (
        survey_version_id,
        question_revision_id,
        display_order,
        section_key,
        section_title,
        carry_forward_enabled
      ) values (
        target_version_id,
        target_revision_id,
        next_display_order,
        coalesce(nullif(lower(btrim(item ->> 'section_key')), ''), 'historical'),
        coalesce(nullif(btrim(item ->> 'section_title'), ''), 'Historical import'),
        true
      ) returning id into target_question_id;
    end if;

    insert into public.company_submissions (
      organization_id,
      survey_version_id,
      status,
      submitted_at,
      submitted_by,
      revision_number,
      created_by
    ) values (
      target_organization_id,
      target_version_id,
      'submitted',
      coalesce((item ->> 'submitted_at')::timestamptz, now()),
      caller_id,
      1,
      caller_id
    )
    on conflict (organization_id, survey_version_id) do update
    set updated_at = now()
    returning id into target_submission_id;

    normalized_answer := case
      when item ? 'answer' then item -> 'answer'
      else 'null'::jsonb
    end;

    insert into public.answers (
      submission_id,
      survey_question_id,
      value,
      provenance,
      updated_by
    ) values (
      target_submission_id,
      target_question_id,
      normalized_answer,
      'historical_import',
      caller_id
    )
    on conflict (submission_id, survey_question_id) do update
    set value = excluded.value,
        provenance = 'historical_import',
        updated_by = caller_id,
        updated_at = now();

    if not target_submission_id = any(imported_submission_ids) then
      imported_submission_ids := array_append(imported_submission_ids, target_submission_id);
    end if;

    imported_count := imported_count + 1;
  end loop;

  foreach snapshot_submission_id in array imported_submission_ids
  loop
    insert into public.submission_snapshots (
      submission_id, revision_number, payload, submitted_by
    )
    select
      snapshot_submission_id,
      1,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'survey_question_id', answer.survey_question_id,
            'value', answer.value,
            'provenance', answer.provenance
          ) order by survey_question.display_order
        ),
        '[]'::jsonb
      ),
      caller_id
    from public.answers answer
    join public.survey_questions survey_question on survey_question.id = answer.survey_question_id
    where answer.submission_id = snapshot_submission_id
    on conflict (submission_id, revision_number) do update
    set payload = excluded.payload,
        submitted_by = excluded.submitted_by,
        submitted_at = now();
  end loop;

  insert into public.audit_events (
    actor_user_id, event_type, entity_type, entity_id, details
  ) values (
    caller_id,
    'historical.imported',
    'historical_import',
    gen_random_uuid()::text,
    jsonb_build_object('rows', imported_count, 'submissions', cardinality(imported_submission_ids))
  );

  return imported_count;
end;
$$;

-- Reopening changes only the survey lifecycle state. Existing submissions,
-- snapshots, answers, and publication metadata remain untouched.
create or replace function app_private.reopen_survey_version(target_survey_version_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  target_year smallint;
  target_name text;
  deadline_cleared boolean;
begin
  if caller_id is null or not app_private.is_platform_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  select reporting_year, name, closes_at is not null and closes_at <= now()
  into target_year, target_name, deadline_cleared
  from public.survey_versions
  where id = target_survey_version_id and status = 'closed'
  for update;

  if not found then
    raise exception 'Closed survey not found';
  end if;

  update public.survey_versions
  set status = 'published',
      closes_at = case when deadline_cleared then null else closes_at end
  where id = target_survey_version_id;

  insert into public.audit_events (
    actor_user_id, event_type, entity_type, entity_id, details
  ) values (
    caller_id,
    'survey.reopened',
    'survey_version',
    target_survey_version_id::text,
    jsonb_build_object(
      'reporting_year', target_year,
      'survey_name', target_name,
      'expired_deadline_cleared', deadline_cleared
    )
  );
end;
$$;

revoke all on function app_private.reopen_survey_version(bigint) from public, anon, authenticated;
grant execute on function app_private.reopen_survey_version(bigint) to authenticated;

create or replace function public.reopen_survey_version(target_survey_version_id bigint)
returns void
language sql
security invoker
set search_path = ''
as $$ select app_private.reopen_survey_version($1); $$;

revoke all on function public.reopen_survey_version(bigint) from public, anon;
grant execute on function public.reopen_survey_version(bigint) to authenticated;

-- Keep exports unambiguous when two surveys share a reporting year. New
-- columns are appended to preserve the existing view column contract.
create or replace view public.reporting_export
with (security_invoker = true)
as
select
  version.reporting_year,
  organization.name as company_name,
  organization.slug as company_slug,
  organization.external_reference,
  submission.status,
  submission.submitted_at,
  survey_question.section_title,
  survey_question.display_order,
  definition.stable_key as question_key,
  definition.category,
  revision.prompt as question_prompt,
  revision.question_type,
  answer.value as answer,
  answer.provenance,
  answer.updated_at,
  version.id as survey_version_id,
  version.name as survey_name
from public.answers answer
join public.company_submissions submission on submission.id = answer.submission_id
join public.organizations organization on organization.id = submission.organization_id
join public.survey_versions version on version.id = submission.survey_version_id
join public.survey_questions survey_question on survey_question.id = answer.survey_question_id
join public.question_revisions revision on revision.id = survey_question.question_revision_id
join public.question_definitions definition on definition.id = revision.question_id;

commit;

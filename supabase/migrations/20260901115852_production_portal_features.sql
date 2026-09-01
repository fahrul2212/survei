alter table public.organizations
  add column contact_email text,
  add column external_reference text;

create unique index organizations_contact_email_lower_idx
on public.organizations (lower(contact_email))
where contact_email is not null;

alter table public.survey_questions
  add column section_key text not null default 'general',
  add column section_title text not null default 'General';

alter table public.survey_questions
  add constraint survey_questions_section_key_format
  check (section_key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  add constraint survey_questions_section_title_not_blank
  check (btrim(section_title) <> '');

create index survey_questions_version_section_order_idx
on public.survey_questions (survey_version_id, section_key, display_order);

create or replace function app_private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, full_name)
  values (
    new.id,
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'STICA user'
    )
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke all on function app_private.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function app_private.handle_new_user();

create or replace function app_private.question_is_visible(
  target_submission_id bigint,
  visibility_rule jsonb
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  dependency_key text;
  comparison_operator text;
  expected_value jsonb;
  actual_value jsonb;
begin
  if visibility_rule is null or visibility_rule = '{}'::jsonb then
    return true;
  end if;

  dependency_key := visibility_rule ->> 'questionKey';
  comparison_operator := coalesce(visibility_rule ->> 'operator', 'equals');
  expected_value := visibility_rule -> 'value';

  if dependency_key is null then
    return true;
  end if;

  select answer.value into actual_value
  from public.answers answer
  join public.survey_questions survey_question on survey_question.id = answer.survey_question_id
  join public.question_revisions revision on revision.id = survey_question.question_revision_id
  join public.question_definitions definition on definition.id = revision.question_id
  where answer.submission_id = target_submission_id
    and definition.stable_key = dependency_key
  limit 1;

  return case comparison_operator
    when 'equals' then actual_value = expected_value
    when 'not_equals' then actual_value is distinct from expected_value
    when 'is_answered' then actual_value is not null and actual_value not in ('null'::jsonb, '""'::jsonb, '[]'::jsonb)
    when 'contains' then
      case
        when jsonb_typeof(actual_value) = 'array' then actual_value @> jsonb_build_array(expected_value)
        else position(lower(coalesce(expected_value #>> '{}', '')) in lower(coalesce(actual_value #>> '{}', ''))) > 0
      end
    else false
  end;
end;
$$;

revoke all on function app_private.question_is_visible(bigint, jsonb) from public, anon, authenticated;

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
  organization_id bigint;
  submission_id bigint;
  source_submission_id bigint;
  target_year smallint;
begin
  if caller_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select reporting_year into target_year
  from public.survey_versions
  where id = target_survey_version_id and status = 'published';

  if target_year is null then
    raise exception 'Published survey version not found';
  end if;

  if target_organization_id is not null and app_private.is_platform_admin() then
    organization_id := target_organization_id;
  else
    select member.organization_id into organization_id
    from public.organization_members member
    join public.organizations organization on organization.id = member.organization_id
    where member.user_id = caller_id and organization.is_active
    order by member.organization_id
    limit 1;
  end if;

  if organization_id is null then
    raise exception 'No active company membership found' using errcode = '42501';
  end if;

  insert into public.company_submissions (
    organization_id, survey_version_id, status, created_by
  )
  values (organization_id, target_survey_version_id, 'draft', caller_id)
  on conflict (organization_id, survey_version_id)
  do update set updated_at = public.company_submissions.updated_at
  returning id into submission_id;

  if exists (
    select 1 from public.company_submissions where id = submission_id and status = 'submitted'
  ) then
    return submission_id;
  end if;

  select submission.id into source_submission_id
  from public.company_submissions submission
  join public.survey_versions version on version.id = submission.survey_version_id
  where submission.organization_id = organization_id
    and submission.status = 'submitted'
    and version.reporting_year < target_year
  order by version.reporting_year desc
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
      submission_id,
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
    organization_id,
    caller_id,
    'submission.initialized',
    'company_submission',
    submission_id::text,
    jsonb_build_object('survey_version_id', target_survey_version_id, 'source_submission_id', source_submission_id)
  );

  return submission_id;
end;
$$;

create or replace function app_private.create_survey_year(
  new_reporting_year smallint,
  survey_name text,
  open_at timestamptz default null,
  close_at timestamptz default null,
  clone_from_survey_version_id bigint default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  new_survey_version_id bigint;
begin
  if caller_id is null or not app_private.is_platform_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  if btrim(coalesce(survey_name, '')) = '' then
    raise exception 'Survey name is required';
  end if;

  insert into public.survey_versions (
    reporting_year, name, status, opens_at, closes_at
  ) values (
    new_reporting_year, btrim(survey_name), 'draft', open_at, close_at
  ) returning id into new_survey_version_id;

  if clone_from_survey_version_id is not null then
    insert into public.survey_questions (
      survey_version_id,
      question_revision_id,
      display_order,
      is_required,
      carry_forward_enabled,
      visibility_rule,
      section_key,
      section_title
    )
    select
      new_survey_version_id,
      source.question_revision_id,
      source.display_order,
      source.is_required,
      source.carry_forward_enabled,
      source.visibility_rule,
      source.section_key,
      source.section_title
    from public.survey_questions source
    where source.survey_version_id = clone_from_survey_version_id
    order by source.display_order;

    insert into public.question_carry_forward_rules (
      target_survey_question_id,
      source_question_id,
      mapping_type,
      approved_by,
      approval_note
    )
    select
      target_question.id,
      revision.question_id,
      'same_identity',
      caller_id,
      'Cloned unchanged from the prior reporting year'
    from public.survey_questions target_question
    join public.question_revisions revision on revision.id = target_question.question_revision_id
    where target_question.survey_version_id = new_survey_version_id
      and target_question.carry_forward_enabled;
  end if;

  insert into public.audit_events (
    actor_user_id, event_type, entity_type, entity_id, details
  ) values (
    caller_id,
    'survey.created',
    'survey_version',
    new_survey_version_id::text,
    jsonb_build_object('reporting_year', new_reporting_year, 'clone_from', clone_from_survey_version_id)
  );

  return new_survey_version_id;
end;
$$;

create or replace function app_private.save_survey_question(
  target_survey_version_id bigint,
  target_survey_question_id bigint,
  stable_question_key text,
  question_category text,
  question_prompt text,
  question_help_text text,
  response_type text,
  response_options jsonb,
  response_validation jsonb,
  required_response boolean,
  target_section_key text,
  target_section_title text,
  target_visibility_rule jsonb,
  carry_source_question_key text default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  definition_id bigint;
  revision_id bigint;
  next_revision smallint;
  next_order smallint;
  saved_survey_question_id bigint;
  source_definition_id bigint;
begin
  if caller_id is null or not app_private.is_platform_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.survey_versions
    where id = target_survey_version_id and status = 'draft'
  ) then
    raise exception 'Questions can only be edited in a draft survey';
  end if;

  if jsonb_typeof(coalesce(response_options, '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(response_validation, '{}'::jsonb)) <> 'object'
    or jsonb_typeof(coalesce(target_visibility_rule, '{}'::jsonb)) <> 'object' then
    raise exception 'Options must be an array; validation and visibility must be objects';
  end if;

  if target_survey_question_id is null then
    insert into public.question_definitions (stable_key, category)
    values (upper(btrim(stable_question_key)), btrim(question_category))
    on conflict (stable_key) do update set category = excluded.category
    returning id into definition_id;

    if exists (
      select 1
      from public.survey_questions survey_question
      join public.question_revisions revision on revision.id = survey_question.question_revision_id
      where survey_question.survey_version_id = target_survey_version_id
        and revision.question_id = definition_id
    ) then
      raise exception 'This persistent question ID already exists in the selected survey';
    end if;
  else
    select revision.question_id into definition_id
    from public.survey_questions survey_question
    join public.question_revisions revision on revision.id = survey_question.question_revision_id
    where survey_question.id = target_survey_question_id
      and survey_question.survey_version_id = target_survey_version_id;

    if definition_id is null then
      raise exception 'Survey question not found';
    end if;

    update public.question_definitions
    set category = btrim(question_category)
    where id = definition_id;
  end if;

  select coalesce(max(revision_number), 0) + 1 into next_revision
  from public.question_revisions where question_id = definition_id;

  insert into public.question_revisions (
    question_id,
    revision_number,
    prompt,
    help_text,
    question_type,
    options,
    validation
  ) values (
    definition_id,
    next_revision,
    btrim(question_prompt),
    nullif(btrim(coalesce(question_help_text, '')), ''),
    response_type,
    coalesce(response_options, '[]'::jsonb),
    coalesce(response_validation, '{}'::jsonb)
  ) returning id into revision_id;

  if target_survey_question_id is null then
    select coalesce(max(display_order), 0) + 1 into next_order
    from public.survey_questions where survey_version_id = target_survey_version_id;

    insert into public.survey_questions (
      survey_version_id,
      question_revision_id,
      display_order,
      is_required,
      carry_forward_enabled,
      visibility_rule,
      section_key,
      section_title
    ) values (
      target_survey_version_id,
      revision_id,
      next_order,
      required_response,
      carry_source_question_key is not null,
      coalesce(target_visibility_rule, '{}'::jsonb),
      lower(btrim(target_section_key)),
      btrim(target_section_title)
    ) returning id into saved_survey_question_id;
  else
    update public.survey_questions
    set question_revision_id = revision_id,
        is_required = required_response,
        carry_forward_enabled = carry_source_question_key is not null,
        visibility_rule = coalesce(target_visibility_rule, '{}'::jsonb),
        section_key = lower(btrim(target_section_key)),
        section_title = btrim(target_section_title)
    where id = target_survey_question_id
    returning id into saved_survey_question_id;
  end if;

  delete from public.question_carry_forward_rules
  where target_survey_question_id = saved_survey_question_id;

  if carry_source_question_key is not null then
    select id into source_definition_id
    from public.question_definitions
    where stable_key = upper(btrim(carry_source_question_key));

    if source_definition_id is null then
      raise exception 'Carry-forward source question ID not found';
    end if;

    insert into public.question_carry_forward_rules (
      target_survey_question_id,
      source_question_id,
      mapping_type,
      approved_by,
      approval_note
    ) values (
      saved_survey_question_id,
      source_definition_id,
      case when source_definition_id = definition_id then 'same_identity' else 'manual' end,
      caller_id,
      'Approved in the survey builder'
    );
  end if;

  insert into public.audit_events (
    actor_user_id, event_type, entity_type, entity_id, details
  ) values (
    caller_id,
    case when target_survey_question_id is null then 'question.added' else 'question.updated' end,
    'survey_question',
    saved_survey_question_id::text,
    jsonb_build_object('stable_key', stable_question_key, 'survey_version_id', target_survey_version_id)
  );

  return saved_survey_question_id;
end;
$$;

create or replace function app_private.delete_survey_question(target_survey_question_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  survey_version_id bigint;
begin
  if caller_id is null or not app_private.is_platform_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  select survey_question.survey_version_id into survey_version_id
  from public.survey_questions survey_question
  join public.survey_versions version on version.id = survey_question.survey_version_id
  where survey_question.id = target_survey_question_id and version.status = 'draft';

  if survey_version_id is null then
    raise exception 'Only questions in draft surveys can be removed';
  end if;

  delete from public.survey_questions where id = target_survey_question_id;

  insert into public.audit_events (
    actor_user_id, event_type, entity_type, entity_id, details
  ) values (
    caller_id,
    'question.removed',
    'survey_question',
    target_survey_question_id::text,
    jsonb_build_object('survey_version_id', survey_version_id)
  );
end;
$$;

create or replace function app_private.publish_survey_version(target_survey_version_id bigint)
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

  if not exists (
    select 1 from public.survey_questions where survey_version_id = target_survey_version_id
  ) then
    raise exception 'A survey must contain at least one question before publishing';
  end if;

  update public.survey_versions
  set status = 'published', published_at = now()
  where id = target_survey_version_id and status = 'draft';

  if not found then
    raise exception 'Draft survey version not found';
  end if;

  insert into public.audit_events (
    actor_user_id, event_type, entity_type, entity_id, details
  ) values (
    caller_id, 'survey.published', 'survey_version', target_survey_version_id::text, '{}'::jsonb
  );
end;
$$;

create or replace function app_private.import_historical_responses(import_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  item jsonb;
  organization_id bigint;
  survey_version_id bigint;
  definition_id bigint;
  revision_id bigint;
  survey_question_id bigint;
  submission_id bigint;
  display_order smallint;
  imported_count integer := 0;
  imported_submission_ids bigint[] := '{}'::bigint[];
  imported_submission_id bigint;
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
    returning id into organization_id;

    insert into public.survey_versions (reporting_year, name, status, published_at)
    values (
      (item ->> 'reporting_year')::smallint,
      'Climate Transition Plan Annual Report ' || (item ->> 'reporting_year'),
      'closed',
      now()
    )
    on conflict (reporting_year) do update set name = public.survey_versions.name
    returning id into survey_version_id;

    if exists (
      select 1 from public.survey_versions
      where id = survey_version_id and status = 'published'
    ) then
      raise exception 'Historical import cannot modify a published reporting year';
    end if;

    insert into public.question_definitions (stable_key, category)
    values (
      upper(btrim(item ->> 'question_key')),
      coalesce(nullif(btrim(item ->> 'category'), ''), 'Historical import')
    )
    on conflict (stable_key) do update set category = public.question_definitions.category
    returning id into definition_id;

    select id into revision_id
    from public.question_revisions
    where question_id = definition_id
    order by revision_number desc
    limit 1;

    if revision_id is null then
      insert into public.question_revisions (
        question_id, revision_number, prompt, question_type, options
      ) values (
        definition_id,
        1,
        coalesce(nullif(btrim(item ->> 'question_prompt'), ''), upper(btrim(item ->> 'question_key'))),
        coalesce(nullif(item ->> 'question_type', ''), 'text'),
        '[]'::jsonb
      ) returning id into revision_id;
    end if;

    select survey_question.id into survey_question_id
    from public.survey_questions survey_question
    join public.question_revisions revision on revision.id = survey_question.question_revision_id
    where survey_question.survey_version_id = survey_version_id
      and revision.question_id = definition_id;

    if survey_question_id is null then
      select coalesce(max(survey_question.display_order), 0) + 1 into display_order
      from public.survey_questions survey_question
      where survey_question.survey_version_id = survey_version_id;

      insert into public.survey_questions (
        survey_version_id,
        question_revision_id,
        display_order,
        section_key,
        section_title,
        carry_forward_enabled
      ) values (
        survey_version_id,
        revision_id,
        display_order,
        coalesce(nullif(lower(btrim(item ->> 'section_key')), ''), 'historical'),
        coalesce(nullif(btrim(item ->> 'section_title'), ''), 'Historical import'),
        true
      ) returning id into survey_question_id;
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
      organization_id,
      survey_version_id,
      'submitted',
      coalesce((item ->> 'submitted_at')::timestamptz, now()),
      caller_id,
      1,
      caller_id
    )
    on conflict (organization_id, survey_version_id) do update
    set updated_at = now()
    returning id into submission_id;

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
      submission_id,
      survey_question_id,
      normalized_answer,
      'historical_import',
      caller_id
    )
    on conflict (submission_id, survey_question_id) do update
    set value = excluded.value,
        provenance = 'historical_import',
        updated_by = caller_id,
        updated_at = now();

    if not submission_id = any(imported_submission_ids) then
      imported_submission_ids := array_append(imported_submission_ids, submission_id);
    end if;

    imported_count := imported_count + 1;
  end loop;

  foreach imported_submission_id in array imported_submission_ids
  loop
    insert into public.submission_snapshots (
      submission_id, revision_number, payload, submitted_by
    )
    select
      imported_submission_id,
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
    where answer.submission_id = imported_submission_id
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
      and app_private.question_is_visible(submission_row.id, survey_question.visibility_rule)
      and not exists (
        select 1 from public.answers answer
        where answer.submission_id = submission_row.id
          and answer.survey_question_id = survey_question.id
          and answer.value not in ('null'::jsonb, '""'::jsonb, '[]'::jsonb)
      )
  ) then
    raise exception 'Required visible answers are missing';
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

  insert into public.submission_snapshots (
    submission_id, revision_number, payload, submitted_by
  ) values (
    submission_row.id, next_revision, snapshot_payload, caller_id
  );

  update public.company_submissions
  set status = 'submitted',
      submitted_at = now(),
      submitted_by = caller_id,
      revision_number = next_revision
  where id = submission_row.id;

  insert into public.audit_events (
    organization_id, actor_user_id, event_type, entity_type, entity_id, details
  ) values (
    submission_row.organization_id,
    caller_id,
    'submission.submitted',
    'company_submission',
    submission_row.id::text,
    jsonb_build_object('revision_number', next_revision)
  );
end;
$$;

create or replace view public.admin_submission_progress
with (security_invoker = true)
as
select
  organization.id as organization_id,
  organization.name as organization_name,
  organization.slug as organization_slug,
  organization.contact_email,
  version.id as survey_version_id,
  version.reporting_year,
  version.name as survey_name,
  submission.id as submission_id,
  coalesce(submission.status, 'not_started') as status,
  submission.submitted_at,
  submission.updated_at,
  count(survey_question.id)::integer as total_questions,
  count(survey_question.id) filter (where survey_question.is_required)::integer as required_questions,
  count(answer.id) filter (
    where answer.value not in ('null'::jsonb, '""'::jsonb, '[]'::jsonb)
  )::integer as answered_questions,
  case
    when count(survey_question.id) = 0 then 0
    else round(
      100.0 * count(answer.id) filter (
        where answer.value not in ('null'::jsonb, '""'::jsonb, '[]'::jsonb)
      ) / count(survey_question.id)
    )::integer
  end as completion_percent
from public.organizations organization
cross join public.survey_versions version
left join public.company_submissions submission
  on submission.organization_id = organization.id
  and submission.survey_version_id = version.id
left join public.survey_questions survey_question
  on survey_question.survey_version_id = version.id
left join public.answers answer
  on answer.submission_id = submission.id
  and answer.survey_question_id = survey_question.id
where organization.is_active
group by organization.id, version.id, submission.id;

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
  answer.updated_at
from public.answers answer
join public.company_submissions submission on submission.id = answer.submission_id
join public.organizations organization on organization.id = submission.organization_id
join public.survey_versions version on version.id = submission.survey_version_id
join public.survey_questions survey_question on survey_question.id = answer.survey_question_id
join public.question_revisions revision on revision.id = survey_question.question_revision_id
join public.question_definitions definition on definition.id = revision.question_id;

revoke all on function app_private.initialize_submission(bigint, bigint) from public, anon;
revoke all on function app_private.create_survey_year(smallint, text, timestamptz, timestamptz, bigint) from public, anon;
revoke all on function app_private.save_survey_question(bigint, bigint, text, text, text, text, text, jsonb, jsonb, boolean, text, text, jsonb, text) from public, anon;
revoke all on function app_private.delete_survey_question(bigint) from public, anon;
revoke all on function app_private.publish_survey_version(bigint) from public, anon;
revoke all on function app_private.import_historical_responses(jsonb) from public, anon;

grant execute on function app_private.initialize_submission(bigint, bigint) to authenticated;
grant execute on function app_private.create_survey_year(smallint, text, timestamptz, timestamptz, bigint) to authenticated;
grant execute on function app_private.save_survey_question(bigint, bigint, text, text, text, text, text, jsonb, jsonb, boolean, text, text, jsonb, text) to authenticated;
grant execute on function app_private.delete_survey_question(bigint) to authenticated;
grant execute on function app_private.publish_survey_version(bigint) to authenticated;
grant execute on function app_private.import_historical_responses(jsonb) to authenticated;

create or replace function public.initialize_submission(
  target_survey_version_id bigint,
  target_organization_id bigint default null
)
returns bigint
language sql
security invoker
set search_path = ''
as $$ select app_private.initialize_submission($1, $2); $$;

create or replace function public.create_survey_year(
  new_reporting_year smallint,
  survey_name text,
  open_at timestamptz default null,
  close_at timestamptz default null,
  clone_from_survey_version_id bigint default null
)
returns bigint
language sql
security invoker
set search_path = ''
as $$ select app_private.create_survey_year($1, $2, $3, $4, $5); $$;

create or replace function public.save_survey_question(
  target_survey_version_id bigint,
  target_survey_question_id bigint,
  stable_question_key text,
  question_category text,
  question_prompt text,
  question_help_text text,
  response_type text,
  response_options jsonb,
  response_validation jsonb,
  required_response boolean,
  target_section_key text,
  target_section_title text,
  target_visibility_rule jsonb,
  carry_source_question_key text default null
)
returns bigint
language sql
security invoker
set search_path = ''
as $$ select app_private.save_survey_question($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14); $$;

create or replace function public.delete_survey_question(target_survey_question_id bigint)
returns void
language sql
security invoker
set search_path = ''
as $$ select app_private.delete_survey_question($1); $$;

create or replace function public.publish_survey_version(target_survey_version_id bigint)
returns void
language sql
security invoker
set search_path = ''
as $$ select app_private.publish_survey_version($1); $$;

create or replace function public.import_historical_responses(import_rows jsonb)
returns integer
language sql
security invoker
set search_path = ''
as $$ select app_private.import_historical_responses($1); $$;

revoke all on function public.initialize_submission(bigint, bigint) from public, anon;
revoke all on function public.create_survey_year(smallint, text, timestamptz, timestamptz, bigint) from public, anon;
revoke all on function public.save_survey_question(bigint, bigint, text, text, text, text, text, jsonb, jsonb, boolean, text, text, jsonb, text) from public, anon;
revoke all on function public.delete_survey_question(bigint) from public, anon;
revoke all on function public.publish_survey_version(bigint) from public, anon;
revoke all on function public.import_historical_responses(jsonb) from public, anon;

grant execute on function public.initialize_submission(bigint, bigint) to authenticated;
grant execute on function public.create_survey_year(smallint, text, timestamptz, timestamptz, bigint) to authenticated;
grant execute on function public.save_survey_question(bigint, bigint, text, text, text, text, text, jsonb, jsonb, boolean, text, text, jsonb, text) to authenticated;
grant execute on function public.delete_survey_question(bigint) to authenticated;
grant execute on function public.publish_survey_version(bigint) to authenticated;
grant execute on function public.import_historical_responses(jsonb) to authenticated;

grant select on public.admin_submission_progress, public.reporting_export to authenticated;

do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end $$;

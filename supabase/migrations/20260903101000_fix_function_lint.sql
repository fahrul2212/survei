begin;

create or replace function app_private.get_organization_members(target_organization_id bigint)
returns table (user_id uuid, role text, full_name text, email text, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app_private.is_platform_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  return query
  select member.user_id, member.role, profile.full_name,
         coalesce(account.email, '')::text, member.created_at
  from public.organization_members member
  join public.profiles profile on profile.user_id = member.user_id
  join auth.users account on account.id = member.user_id
  where member.organization_id = target_organization_id
  order by member.created_at;
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
  if not exists (select 1 from public.survey_versions version
                 where version.id = target_survey_version_id and version.status = 'draft') then
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
      select 1 from public.survey_questions survey_question
      join public.question_revisions revision on revision.id = survey_question.question_revision_id
      where survey_question.survey_version_id = target_survey_version_id and revision.question_id = definition_id
    ) then raise exception 'This persistent question ID already exists in the selected survey'; end if;
  else
    select revision.question_id into definition_id
    from public.survey_questions survey_question
    join public.question_revisions revision on revision.id = survey_question.question_revision_id
    where survey_question.id = target_survey_question_id
      and survey_question.survey_version_id = target_survey_version_id;
    if definition_id is null then raise exception 'Survey question not found'; end if;
    update public.question_definitions set category = btrim(question_category) where id = definition_id;
  end if;

  select coalesce(max(revision.revision_number), 0) + 1 into next_revision
  from public.question_revisions revision where revision.question_id = definition_id;
  insert into public.question_revisions (
    question_id, revision_number, prompt, help_text, question_type, options, validation
  ) values (
    definition_id, next_revision, btrim(question_prompt), nullif(btrim(coalesce(question_help_text, '')), ''),
    response_type, coalesce(response_options, '[]'::jsonb), coalesce(response_validation, '{}'::jsonb)
  ) returning id into revision_id;

  if target_survey_question_id is null then
    select coalesce(max(survey_question.display_order), 0) + 1 into next_order
    from public.survey_questions survey_question where survey_question.survey_version_id = target_survey_version_id;
    insert into public.survey_questions (
      survey_version_id, question_revision_id, display_order, is_required,
      carry_forward_enabled, visibility_rule, section_key, section_title
    ) values (
      target_survey_version_id, revision_id, next_order, required_response,
      carry_source_question_key is not null, coalesce(target_visibility_rule, '{}'::jsonb),
      lower(btrim(target_section_key)), btrim(target_section_title)
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

  delete from public.question_carry_forward_rules carry_rule
  where carry_rule.target_survey_question_id = saved_survey_question_id;

  if carry_source_question_key is not null then
    select definition.id into source_definition_id
    from public.question_definitions definition
    where definition.stable_key = upper(btrim(carry_source_question_key));
    if source_definition_id is null then raise exception 'Carry-forward source question ID not found'; end if;
    insert into public.question_carry_forward_rules (
      target_survey_question_id, source_question_id, mapping_type, approved_by, approval_note
    ) values (
      saved_survey_question_id, source_definition_id,
      case when source_definition_id = definition_id then 'same_identity' else 'manual' end,
      caller_id, 'Approved in the survey builder'
    );
  end if;

  insert into public.audit_events (actor_user_id, event_type, entity_type, entity_id, details)
  values (caller_id,
    case when target_survey_question_id is null then 'question.added' else 'question.updated' end,
    'survey_question', saved_survey_question_id::text,
    jsonb_build_object('stable_key', stable_question_key, 'survey_version_id', target_survey_version_id));
  return saved_survey_question_id;
end;
$$;

commit;

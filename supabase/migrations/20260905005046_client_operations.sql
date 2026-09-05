-- Client-facing email templates are plain text and use a fixed placeholder set.
-- Rendering and HTML escaping happen in Edge Functions.
create table public.email_templates (
  template_key text primary key,
  subject_template text not null,
  body_template text not null,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint email_templates_key_valid check (template_key in ('invitation', 'reminder')),
  constraint email_templates_subject_not_blank check (btrim(subject_template) <> '' and char_length(subject_template) <= 200),
  constraint email_templates_body_not_blank check (btrim(body_template) <> '' and char_length(body_template) <= 5000)
);

create index email_templates_updated_by_idx on public.email_templates (updated_by) where updated_by is not null;

insert into public.email_templates (template_key, subject_template, body_template)
values
  (
    'invitation',
    'Your STICA reporting portal invitation',
    E'Hello {{full_name}},\n\nYou have been invited to the STICA reporting portal for {{company_name}}.\n\nReview and accept your invitation: {{action_url}}\n\nThis one-time invitation expires at {{expires_at}}. If you did not expect this invitation, you can ignore this email.'
  ),
  (
    'reminder',
    'STICA report reminder: {{days_remaining}} day(s) remaining',
    E'Hello,\n\n{{company_name}} has {{days_remaining}} day(s) remaining to complete {{survey_name}}.\n\nCurrent status: {{status}}.\n\nOpen the STICA reporting portal: {{portal_url}}'
  );

create trigger email_templates_set_updated_at
before update on public.email_templates
for each row execute function app_private.set_updated_at();

alter table public.email_templates enable row level security;
revoke all on public.email_templates from public, anon, authenticated;
grant select, update on public.email_templates to authenticated;
grant select, insert, update, delete on public.email_templates to service_role;

create policy email_templates_select_admin on public.email_templates
for select to authenticated
using ((select app_private.is_platform_admin()));

create policy email_templates_update_admin on public.email_templates
for update to authenticated
using ((select app_private.is_platform_admin()))
with check ((select app_private.is_platform_admin()));

-- Import a native SurveyMonkey workbook into an explicitly selected, existing
-- survey. Existing company submissions are skipped rather than overwritten.
create or replace function app_private.import_surveymonkey_responses(
  target_survey_version_id bigint,
  import_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  survey_status text;
  item jsonb;
  answer_item record;
  target_organization_id bigint;
  target_submission_id bigint;
  target_question_id bigint;
  submitted_time timestamptz;
  imported_companies integer := 0;
  imported_answers integer := 0;
  skipped_existing integer := 0;
  unknown_answers integer := 0;
begin
  if caller_id is null or not app_private.is_platform_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if jsonb_typeof(import_rows) <> 'array' then
    raise exception 'SurveyMonkey import payload must be an array';
  end if;
  if jsonb_array_length(import_rows) < 1 or jsonb_array_length(import_rows) > 500 then
    raise exception 'SurveyMonkey import must contain between 1 and 500 company rows';
  end if;

  select status into survey_status
  from public.survey_versions
  where id = target_survey_version_id;
  if survey_status is null then raise exception 'Target survey not found'; end if;
  if survey_status = 'published' then raise exception 'Import into a published survey is not allowed'; end if;

  for item in select value from jsonb_array_elements(import_rows)
  loop
    if jsonb_typeof(item -> 'answers') <> 'object'
      or coalesce(btrim(item ->> 'company_name'), '') = ''
      or coalesce(btrim(item ->> 'company_slug'), '') = '' then
      raise exception 'Every imported row requires company_name, company_slug, and an answers object';
    end if;

    insert into public.organizations (name, slug, contact_email, external_reference)
    values (
      left(btrim(item ->> 'company_name'), 300),
      lower(left(btrim(item ->> 'company_slug'), 160)),
      nullif(lower(left(btrim(item ->> 'contact_email'), 320)), ''),
      nullif(left(btrim(item ->> 'external_reference'), 300), '')
    )
    on conflict (slug) do update
    set contact_email = coalesce(public.organizations.contact_email, excluded.contact_email),
        external_reference = coalesce(public.organizations.external_reference, excluded.external_reference)
    returning id into target_organization_id;

    select id into target_submission_id
    from public.company_submissions
    where organization_id = target_organization_id
      and survey_version_id = target_survey_version_id;
    if target_submission_id is not null then
      skipped_existing := skipped_existing + 1;
      continue;
    end if;

    begin
      submitted_time := coalesce(nullif(item ->> 'submitted_at', '')::timestamptz, now());
    exception when others then
      raise exception 'Invalid submitted_at value for company %', item ->> 'company_name';
    end;

    insert into public.company_submissions (
      organization_id, survey_version_id, status, submitted_at, submitted_by,
      revision_number, created_by, current_section
    ) values (
      target_organization_id, target_survey_version_id, 'submitted', submitted_time,
      caller_id, 1, caller_id, 'historical-import'
    ) returning id into target_submission_id;

    for answer_item in select key, value from jsonb_each(item -> 'answers')
    loop
      select survey_question.id into target_question_id
      from public.survey_questions survey_question
      join public.question_revisions revision on revision.id = survey_question.question_revision_id
      join public.question_definitions definition on definition.id = revision.question_id
      where survey_question.survey_version_id = target_survey_version_id
        and definition.stable_key = upper(answer_item.key)
      limit 1;

      if target_question_id is null then
        unknown_answers := unknown_answers + 1;
        continue;
      end if;
      insert into public.answers (
        submission_id, survey_question_id, value, provenance, updated_by, updated_at
      ) values (
        target_submission_id, target_question_id, answer_item.value,
        'historical_import', caller_id, submitted_time
      );
      imported_answers := imported_answers + 1;
    end loop;

    insert into public.submission_snapshots (submission_id, revision_number, payload, submitted_by, submitted_at)
    select
      target_submission_id,
      1,
      coalesce(jsonb_agg(jsonb_build_object(
        'survey_question_id', answer.survey_question_id,
        'value', answer.value,
        'provenance', answer.provenance
      ) order by survey_question.display_order), '[]'::jsonb),
      caller_id,
      submitted_time
    from public.answers answer
    join public.survey_questions survey_question on survey_question.id = answer.survey_question_id
    where answer.submission_id = target_submission_id;
    imported_companies := imported_companies + 1;
  end loop;

  insert into public.audit_events (
    actor_user_id, event_type, entity_type, entity_id, details
  ) values (
    caller_id,
    'surveymonkey.imported',
    'survey_version',
    target_survey_version_id::text,
    jsonb_build_object(
      'companies', imported_companies,
      'answers', imported_answers,
      'skipped_existing', skipped_existing,
      'unknown_answers', unknown_answers
    )
  );

  return jsonb_build_object(
    'companies', imported_companies,
    'answers', imported_answers,
    'skippedExisting', skipped_existing,
    'unknownAnswers', unknown_answers
  );
end;
$$;

create or replace function public.import_surveymonkey_responses(
  target_survey_version_id bigint,
  import_rows jsonb
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select app_private.import_surveymonkey_responses($1, $2);
$$;

revoke all on function app_private.import_surveymonkey_responses(bigint, jsonb) from public, anon;
revoke all on function public.import_surveymonkey_responses(bigint, jsonb) from public, anon;
grant execute on function app_private.import_surveymonkey_responses(bigint, jsonb) to authenticated;
grant execute on function public.import_surveymonkey_responses(bigint, jsonb) to authenticated;

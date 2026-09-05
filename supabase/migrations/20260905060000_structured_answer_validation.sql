begin;

create or replace function app_private.answer_has_value(value jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
begin
  if value is null or value = 'null'::jsonb then return false; end if;
  case jsonb_typeof(value)
    when 'string' then return btrim(value #>> '{}') <> '';
    when 'array' then return exists (select 1 from jsonb_array_elements(value) item where app_private.answer_has_value(item));
    when 'object' then
      if value ? 'selection' then return app_private.answer_has_value(value -> 'selection'); end if;
      return exists (select 1 from jsonb_each(value) item where item.key <> '_previous' and app_private.answer_has_value(item.value));
    else return true;
  end case;
end;
$$;

create or replace function app_private.answer_matches_schema(value jsonb, required boolean, response_type text, options jsonb, validation jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare
  selected jsonb := case when jsonb_typeof(value) = 'object' then value -> 'selection' else value end;
  field jsonb;
  field_value text;
  valid_options jsonb := case when response_type = 'yes_no' then '["Yes","No"]'::jsonb else options end;
begin
  if not app_private.answer_has_value(value) then return not required; end if;
  if jsonb_typeof(validation -> 'fields') = 'array' and jsonb_array_length(validation -> 'fields') > 0 then
    if jsonb_typeof(value) <> 'object' then return false; end if;
    for field in select * from jsonb_array_elements(validation -> 'fields') loop
      field_value := btrim(coalesce(value ->> (field ->> 'key'), ''));
      if field_value = '' then
        if field -> 'required' = 'true'::jsonb then return false; end if;
        continue;
      end if;
      if field ->> 'type' = 'email' and field_value !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then return false; end if;
      if field ->> 'type' = 'number' and field_value !~ '^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)([eE][+-]?[0-9]+)?$' then return false; end if;
      if field ->> 'type' = 'select' and not coalesce((field -> 'options') @> jsonb_build_array(field_value), false) then return false; end if;
    end loop;
    return true;
  end if;
  if response_type = 'number' then
    return jsonb_typeof(selected) in ('number', 'string') and (selected #>> '{}') ~ '^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)([eE][+-]?[0-9]+)?$';
  end if;
  if response_type in ('yes_no', 'single_choice', 'multiple_choice') then
    if response_type = 'multiple_choice' then
      if jsonb_typeof(selected) <> 'array' then return false; end if;
      if exists (select 1 from jsonb_array_elements(selected) item where not coalesce(valid_options @> jsonb_build_array(item), false)) then return false; end if;
    elsif jsonb_typeof(selected) <> 'string' or not coalesce(valid_options @> jsonb_build_array(selected), false) then return false;
    end if;
    if validation #> '{comment,required}' = 'true'::jsonb
      and (validation #>> '{comment,option}' is null or selected = validation #> '{comment,option}' or selected @> jsonb_build_array(validation #> '{comment,option}'))
      and not app_private.answer_has_value(value -> 'comment') then return false; end if;
    return true;
  end if;
  return jsonb_typeof(value) in ('string', 'number', 'boolean');
end;
$$;

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

  if jsonb_typeof(actual_value) = 'object' and actual_value ? 'selection' then
    actual_value := actual_value -> 'selection';
  end if;

  return case comparison_operator
    when 'equals' then actual_value = expected_value
    when 'not_equals' then actual_value is distinct from expected_value
    when 'is_answered' then app_private.answer_has_value(actual_value)
    when 'contains' then
      case
        when jsonb_typeof(actual_value) = 'array' then actual_value @> jsonb_build_array(expected_value)
        else position(lower(coalesce(expected_value #>> '{}', '')) in lower(coalesce(actual_value #>> '{}', ''))) > 0
      end
    else false
  end;
end;
$$;


create or replace function app_private.validate_submission_answers()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status <> 'submitted' or old.status = 'submitted' then return new; end if;
  if not app_private.is_platform_admin() and not exists (
    select 1 from public.survey_versions where id = new.survey_version_id and status = 'published'
  ) then raise exception 'This survey is not open for submission'; end if;
  if exists (
    select 1 from public.survey_questions question
    join public.question_revisions revision on revision.id = question.question_revision_id
    left join public.answers answer on answer.survey_question_id = question.id and answer.submission_id = new.id
    where question.survey_version_id = new.survey_version_id
      and app_private.question_is_visible(new.id, question.visibility_rule)
      and not coalesce(app_private.answer_matches_schema(answer.value, question.is_required,
        revision.question_type, revision.options, revision.validation), false)
  ) then raise exception 'Review missing or invalid answers before submitting'; end if;
  return new;
end;
$$;

create trigger submission_validate_answers before update of status on public.company_submissions
for each row execute function app_private.validate_submission_answers();

revoke all on function app_private.answer_has_value(jsonb) from public, anon, authenticated;
revoke all on function app_private.answer_matches_schema(jsonb, boolean, text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function app_private.validate_submission_answers() from public, anon, authenticated;

commit;

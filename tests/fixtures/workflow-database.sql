-- Extends the loopback-only account fixture with the answer storage contract.
alter table public.company_submissions add current_section text;
alter table public.survey_questions add section_key text default 'contact';
create table public.answers (
  id bigint generated always as identity primary key, submission_id bigint, survey_question_id bigint,
  value jsonb, provenance text, updated_by uuid, reviewed_at timestamptz,
  edit_version bigint default 1, unique(submission_id,survey_question_id)
);
create function app_private.can_edit_organization(company_id bigint) returns boolean
language sql stable as $$ select app_private.organization_role(company_id) in ('owner','member'); $$;
create function app_private.advance_answer_version() returns trigger language plpgsql as $$
begin new.edit_version=old.edit_version+1; return new; end; $$;
create trigger answers_advance_version before update on public.answers
for each row execute function app_private.advance_answer_version();

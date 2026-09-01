insert into public.organizations (name, slug)
values ('North Thread AB', 'north-thread-ab');

insert into public.survey_versions (reporting_year, name, status, opens_at, closes_at, published_at)
values (2026, 'Climate Transition Plan Annual Report 2026', 'published', '2026-09-01T00:00:00Z', '2026-10-30T23:59:59Z', now());

insert into public.question_definitions (stable_key, category)
values
  ('GOV-001', 'Governance & targets'),
  ('GOV-004', 'Governance & targets'),
  ('TGT-002', 'Governance & targets'),
  ('EMI-011', 'GHG emissions'),
  ('ACT-007', 'Transition actions'),
  ('ACT-014', 'Transition actions');

insert into public.question_revisions (question_id, revision_number, prompt, help_text, question_type, options)
select id, 1, 'Does your company have a board-approved climate transition plan?', 'Select the current status as of the end of the reporting period.', 'yes_no', '["Yes", "No"]'::jsonb from public.question_definitions where stable_key = 'GOV-001'
union all
select id, 1, 'Which governance body has primary oversight of the transition plan?', null, 'single_choice', '["Board of directors", "Executive management", "Sustainability committee", "Other"]'::jsonb from public.question_definitions where stable_key = 'GOV-004'
union all
select id, 1, 'What is the target year for achieving net-zero greenhouse gas emissions?', null, 'number', '[]'::jsonb from public.question_definitions where stable_key = 'TGT-002'
union all
select id, 1, 'Report total Scope 1 emissions for the reporting year.', 'Enter metric tonnes of CO2e.', 'number', '[]'::jsonb from public.question_definitions where stable_key = 'EMI-011'
union all
select id, 1, 'Describe the most material transition action completed this year.', null, 'textarea', '[]'::jsonb from public.question_definitions where stable_key = 'ACT-007'
union all
select id, 1, 'Provide any additional context on delays, dependencies, or corrective actions.', null, 'textarea', '[]'::jsonb from public.question_definitions where stable_key = 'ACT-014';

insert into public.survey_questions (survey_version_id, question_revision_id, display_order, is_required)
select version.id, revision.id, row_number() over (order by definition.stable_key), definition.stable_key <> 'ACT-014'
from public.survey_versions version
cross join public.question_revisions revision
join public.question_definitions definition on definition.id = revision.question_id
where version.reporting_year = 2026;

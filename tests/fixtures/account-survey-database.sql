-- Extends the isolated analysis fixture; never uses production credentials.
create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
alter table auth.users add email text, add raw_user_meta_data jsonb default '{}', add banned_until timestamptz,
  add email_confirmed_at timestamptz, add created_at timestamptz default now(), add updated_at timestamptz default now(), add last_sign_in_at timestamptz;
update auth.users set email=id::text||'@example.test',email_confirmed_at=now();
create table profiles(user_id uuid primary key,full_name text,updated_at timestamptz);
create table audit_events(id bigint generated always as identity,actor_user_id uuid,event_type text,entity_type text,entity_id text,details jsonb,created_at timestamptz default now());
alter table survey_versions add status text default 'draft',add opens_at timestamptz,add closes_at timestamptz,
 add published_at timestamptz,add updated_at timestamptz default now();
alter table survey_versions add check(closes_at is null or opens_at is null or closes_at>opens_at);
alter table survey_questions add foreign key(survey_version_id) references survey_versions(id) on delete cascade;
alter table company_submissions add foreign key(survey_version_id) references survey_versions(id) on delete restrict;
alter table survey_questions enable row level security;
alter table question_definitions enable row level security;
alter table question_revisions enable row level security;
grant select on survey_questions,question_definitions,question_revisions to authenticated;
grant usage on schema app_private to authenticated;

begin;

alter function public.get_my_organization_members(bigint) set schema app_private;
alter function public.update_my_organization_member_role(bigint, uuid, text) set schema app_private;
alter function public.remove_my_organization_member(bigint, uuid) set schema app_private;
alter function public.get_company_benchmark(bigint) set schema app_private;

create function public.get_my_organization_members(target_organization_id bigint)
returns table (user_id uuid, role text, full_name text, email text, created_at timestamptz)
language sql
stable
security invoker
set search_path = ''
as $$ select * from app_private.get_my_organization_members($1); $$;

create function public.update_my_organization_member_role(
  target_organization_id bigint, target_user_id uuid, new_role text
)
returns void
language sql
security invoker
set search_path = ''
as $$ select app_private.update_my_organization_member_role($1, $2, $3); $$;

create function public.remove_my_organization_member(
  target_organization_id bigint, target_user_id uuid
)
returns void
language sql
security invoker
set search_path = ''
as $$ select app_private.remove_my_organization_member($1, $2); $$;

create function public.get_company_benchmark(target_survey_version_id bigint)
returns table (
  own_completion integer,
  cohort_average numeric,
  cohort_median numeric,
  percentile_rank numeric,
  cohort_size integer,
  submitted_count integer,
  suppressed boolean
)
language sql
stable
security invoker
set search_path = ''
as $$ select * from app_private.get_company_benchmark($1); $$;

revoke all on function public.get_my_organization_members(bigint) from public, anon;
revoke all on function public.update_my_organization_member_role(bigint, uuid, text) from public, anon;
revoke all on function public.remove_my_organization_member(bigint, uuid) from public, anon;
revoke all on function public.get_company_benchmark(bigint) from public, anon;
grant execute on function public.get_my_organization_members(bigint) to authenticated;
grant execute on function public.update_my_organization_member_role(bigint, uuid, text) to authenticated;
grant execute on function public.remove_my_organization_member(bigint, uuid) to authenticated;
grant execute on function public.get_company_benchmark(bigint) to authenticated;

commit;

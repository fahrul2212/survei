begin;
create function app_private.enforce_reporting_window()
returns trigger language plpgsql security definer set search_path='' as $$
declare version public.survey_versions%rowtype;
begin
  if app_private.is_platform_admin() or auth.jwt()->>'role'='service_role' then return new; end if;
  select * into version from public.survey_versions where id=new.survey_version_id for share;
  if not found or version.status<>'published'
    then raise exception 'This reporting cycle is closed' using errcode='42501'; end if;
  if version.opens_at is not null and version.opens_at>statement_timestamp()
    then raise exception 'Reporting has not opened yet' using errcode='42501'; end if;
  if version.closes_at is not null and version.closes_at<=statement_timestamp()
    then raise exception 'The submission deadline has passed. Contact STICA for an extension.' using errcode='42501'; end if;
  return new;
end;
$$;
create trigger submission_enforce_window before insert or update on public.company_submissions
for each row execute function app_private.enforce_reporting_window();
revoke all on function app_private.enforce_reporting_window() from public,anon,authenticated;
commit;

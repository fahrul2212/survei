begin;
select set_config('request.jwt.claims','{"role":"service_role","sub":"10000000-0000-4000-8000-000000000001"}',true);
do $$
declare a uuid:='10000000-0000-4000-8000-000000000001'; b uuid:='10000000-0000-4000-8000-000000000002';
  c uuid:='10000000-0000-4000-8000-000000000003'; pending uuid:='10000000-0000-4000-8000-000000000004';
  revision text; details jsonb; signature text; result jsonb;
begin
  revision:=app_private.account_revision(b);
  details:=jsonb_build_object('name','First admin edit','role','platform_analyst','disabled',false,'expectedRevision',revision);
  perform public.manage_portal_accounts(a,'update',b,details);
  begin perform public.manage_portal_accounts(a,'update',b,details||'{"name":"Stale admin edit"}');
    raise exception 'Stale account edit accepted'; exception when sqlstate 'PT409' then null; end;
  assert (select full_name from profiles where user_id=b)='First admin edit','Stale name overwrote current';
  begin perform public.manage_portal_accounts(a,'update',b,details-'expectedRevision');
    raise exception 'Missing revision accepted'; exception when sqlstate 'PT409' then null; end;
  revision:=app_private.account_revision(b);
  update auth.users set last_sign_in_at=now(),updated_at=now() where id=b;
  assert app_private.account_revision(b)=revision,'Signing in changed editable revision';
  result:=public.manage_portal_accounts(a,'list',b);
  assert jsonb_array_length(result->'users')=1 and result->'users'->0->>'id'=b::text,'Target lookup returned other accounts';
  assert result->'users'->0->>'revision'=revision,'Directory revision mismatch';
  insert into auth.users(id,email,raw_app_meta_data) values(pending,'pending@example.test','{}');
  perform public.manage_portal_accounts(a,'initialize',pending,'{"name":"Pending analyst","role":"platform_analyst","disabled":false}');
  begin perform public.manage_portal_accounts(a,'initialize',pending,'{"name":"Retry","role":"platform_admin","disabled":false}');
    raise exception 'Initialization overwrote existing role'; exception when sqlstate 'PT409' then null; end;
  assert app_private.portal_role(pending)='platform_analyst','Initialization changed assigned role';
  foreach signature in array array[
    'app_private.save_report_answer(bigint,bigint,jsonb,bigint,boolean)',
    'app_private.analysis_v2_run(uuid,text,uuid,jsonb,uuid)',
    'app_private.analysis_mapping(uuid,text,uuid,jsonb)',
    'app_private.analysis_narrative(uuid,text,uuid,jsonb)'
  ] loop
    assert position(chr(39)||'40001'||chr(39) in pg_get_functiondef(signature::regprocedure))=0,'Retryable application conflict retained';
  end loop;
  perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',c)::text,true);
  update survey_versions set status='published' where id=26;
  insert into company_submissions(id,organization_id,survey_version_id,status) values(9001,1,26,'draft');
  result:=app_private.save_report_answer(9001,1,'"First"',null,false);
  assert result->>'edit_version'='1','First answer version';
  result:=app_private.save_report_answer(9001,1,'"Second"',1,false);
  begin perform app_private.save_report_answer(9001,1,'"Stale"',1,false);
    raise exception 'Stale answer accepted'; exception when sqlstate 'PT409' then null; end;
  assert (select value from answers where submission_id=9001)='"Second"'::jsonb,'Stale answer overwrote saved';
  raise notice 'PASS: account revisions, initialization race, answer conflicts and application conflict codes';
end; $$;
rollback;

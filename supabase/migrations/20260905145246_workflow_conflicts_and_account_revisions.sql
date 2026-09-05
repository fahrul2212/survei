begin;

-- These are application conflicts, not transaction failures that a gateway can retry.
-- Rewrite only the named routines; keep their signatures, permissions and logic intact.
do $$
declare signature text; definition text;
begin
  foreach signature in array array[
    'app_private.save_report_answer(bigint,bigint,jsonb,bigint,boolean)',
    'app_private.analysis_v2_run(uuid,text,uuid,jsonb,uuid)',
    'app_private.analysis_mapping(uuid,text,uuid,jsonb)',
    'app_private.analysis_narrative(uuid,text,uuid,jsonb)'
  ] loop
    select pg_get_functiondef(signature::regprocedure) into definition;
    if position(chr(39)||'40001'||chr(39) in definition)=0 then
      raise exception 'Expected conflict handler missing in %', signature;
    end if;
    execute replace(definition,chr(39)||'40001'||chr(39),chr(39)||'PT409'||chr(39));
  end loop;
end; $$;
commit;

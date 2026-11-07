begin;
insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data) values
('00000000-0000-4000-8000-000000000201','audit-reviewer@example.invalid',now(),'{"hack_muc_access":true,"hack_muc_role":"reviewer"}'),
('00000000-0000-4000-8000-000000000202','audit-handler@example.invalid',now(),'{"hack_muc_access":true,"hack_muc_role":"claims_handler"}');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000202',true);
insert into public.claims(claimant_name,claimant_email,claim_summary) values('Audit Test','audit-handler@example.invalid','Test submission audited atomically');
do $$ begin
 if not exists(select 1 from public.audit_log where actor_id=auth.uid() and entity_type='claim' and action='insert') then raise exception 'Missing claim audit'; end if;
 begin
  perform public.record_review('{}'); raise exception 'Handler reviewed';
 exception when raise_exception then if SQLERRM <> 'Reviewer or Admin role required' then raise; end if; end;
 begin
  insert into public.audit_log(actor_label,action,entity_type,entity_id) values('forged','insert','claim','forged');
  raise exception 'Direct audit insertion allowed';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000201',true);
do $$ declare row public.audit_log; snapshot jsonb; begin
 snapshot := '{"datasetId":"development","caseId":"AUDIT-TEST","policyVersion":"v2","ruleId":"rule1","action":"overridden","automated":"human_review","previous":"human_review","next":"request_information","reason":"More documentation is needed","reviewer":"forged","at":"1900-01-01"}';
 row := public.record_review(snapshot);
 if row.actor_id <> auth.uid() or row.actor_label <> 'audit-reviewer@example.invalid' or row.occurred_at < now()-interval '1 minute' then raise exception 'Untrusted actor or time'; end if;
 begin
  perform public.record_review(snapshot); raise exception 'Stale review accepted';
 exception when raise_exception then if SQLERRM <> 'Review changed; refresh the queue and retry' then raise; end if; end;
 begin
  perform public.record_review(snapshot || '{"datasetId":"upload:other-user:file.csv"}'); raise exception 'Foreign upload accepted';
 exception when raise_exception then if SQLERRM <> 'Invalid dataset scope' then raise; end if; end;
 begin
  update public.audit_log set actor_label='forged' where id=row.id; raise exception 'Update allowed';
 exception when insufficient_privilege then null; end;
 begin
  delete from public.audit_log where id=row.id; raise exception 'Delete allowed';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000202',true);
do $$ begin
 if exists(select 1 from public.audit_log where entity_type='review') then raise exception 'Handler can read review history'; end if;
end $$;
reset role;
insert into public.policy_versions(version_label,rules,status,source,created_by)
select 'audit-test-policy',rules,'draft','edit','audit-test' from public.policy_versions where status='active';
do $$ begin
 if not exists(select 1 from public.audit_log where entity_type='policy' and details->>'version'='audit-test-policy') then raise exception 'Missing policy audit'; end if;
 begin
  update public.audit_log set actor_label='tamper' where details->>'version'='audit-test-policy'; raise exception 'Append-only trigger failed';
 exception when raise_exception then if SQLERRM <> 'Audit records cannot be changed or deleted' then raise; end if; end;
end $$;
rollback;

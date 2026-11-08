begin;
insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data) values
('00000000-0000-4000-8000-000000000301','engine-admin@example.invalid',now(),'{"hack_muc_access":true,"hack_muc_role":"admin"}'),
('00000000-0000-4000-8000-000000000302','engine-handler@example.invalid',now(),'{"hack_muc_access":true,"hack_muc_role":"claims_handler"}'),
('00000000-0000-4000-8000-000000000303','engine-other@example.invalid',now(),'{"hack_muc_access":true,"hack_muc_role":"claims_handler"}');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);
insert into public.claims(id,submitted_by,claimant_name,claimant_email,claim_summary,quote_eur) values('00000000-0000-4000-8000-000000000310','00000000-0000-4000-8000-000000000302','Engine Test','test@example.invalid','Live engine integration test',1300);
-- Save twice: idempotent decision and audit event.
do $$ declare c public.claims; p public.policy_versions; d public.claim_decisions; again public.claim_decisions; begin
 select * into c from public.claims where id='00000000-0000-4000-8000-000000000310';
 select * into p from public.policy_versions where status='active';
 d:=public.save_claim_decision(c.id,p.id,to_jsonb(c),jsonb_build_object('caseId',c.case_id,'policyVersion',p.version_label,'recommendation','human_review','ruleId',p.version_label||'.rule1'));
 again:=public.save_claim_decision(c.id,p.id,to_jsonb(c),d.decision);
 if d.id<>again.id then raise exception 'Duplicate evaluation'; end if;
 if (select count(*) from public.audit_log where entity_type='decision' and entity_id=d.id::text)<>1 then raise exception 'Duplicate/missing evaluation audit'; end if;
 begin perform public.save_claim_decision(c.id,p.id,to_jsonb(c)||'{"quote_eur":1}',d.decision);raise exception 'Tampered facts accepted'; exception when raise_exception then if SQLERRM<>'Claim changed; refresh' then raise;end if;end;
end $$;
set local role authenticated;
do $$ begin
 if not exists(select 1 from public.claim_decisions where claim_id='00000000-0000-4000-8000-000000000310') then raise exception 'Owner cannot read';end if;
 begin perform public.save_claim_decision(null,null,null,null);raise exception 'Client can save verdict';exception when insufficient_privilege then null;end;
 begin perform public.write_policy_as(null,'activate','{}');raise exception 'Client can spoof policy actor';exception when insufficient_privilege then null;end;
 begin perform public.write_policy('activate','{}');raise exception 'Client bypasses validation';exception when insufficient_privilege then null;end;
 begin perform public.record_review('{}');raise exception 'Handler can review';exception when raise_exception then if SQLERRM<>'Reviewer or Admin role required' then raise;end if;end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000303',true);
do $$ begin if exists(select 1 from public.claim_decisions where claim_id='00000000-0000-4000-8000-000000000310') then raise exception 'Foreign decision visible';end if;end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000301',true);
do $$ declare d public.claim_decisions; a public.audit_log; payload jsonb; begin
 select * into d from public.claim_decisions where claim_id='00000000-0000-4000-8000-000000000310';
 payload:=jsonb_build_object('decisionId',d.id,'action','overridden','next','request_information','reason','Need evidence before proceeding','automated','routine_processing','policyVersion','forged','reviewer','forged');
 a:=public.record_review(payload);
 if a.actor_id<>auth.uid() or a.actor_label<>'engine-admin@example.invalid' or a.details->>'automated'<>'human_review' or a.details->>'policyVersion'='forged' then raise exception 'Forged audit fields accepted';end if;
 begin perform public.record_review(payload);raise exception 'Stale review accepted';exception when raise_exception then if SQLERRM<>'Review changed; refresh the queue' then raise;end if;end;
 a:=public.record_review(payload||jsonb_build_object('expectedReviewId',a.id,'action','reverted'));
 if a.details->>'next'<>'human_review' then raise exception 'Wrong revert';end if;
 begin perform public.record_review('{"datasetId":"development","action":"confirmed"}');raise exception 'Demo review accepted';exception when raise_exception then if SQLERRM<>'Saved decision required' then raise;end if;end;
 begin update public.claim_decisions set decision='{}' where id=d.id;raise exception 'Decision editable';exception when insufficient_privilege then null;end;
end $$;
reset role;
-- Policy changes identify human actor, invalidate old open decisions and retain closed decisions.
do $$ declare p public.policy_versions; draft jsonb; d public.claim_decisions; c public.claims; begin
 select * into p from public.policy_versions where status='active';
 draft:=public.write_policy_as('00000000-0000-4000-8000-000000000301','create',jsonb_build_object('version_label','engine-test-policy','rules',p.rules,'source','edit'));
 if not exists(select 1 from public.audit_log where entity_id=draft->>'id' and actor_id='00000000-0000-4000-8000-000000000301') then raise exception 'Policy actor missing';end if;
 perform public.write_policy_as('00000000-0000-4000-8000-000000000301','activate',jsonb_build_object('id',draft->>'id','expected_active_id',p.id,'expected_revision',0));
 select * into d from public.claim_decisions where claim_id='00000000-0000-4000-8000-000000000310';
 begin perform public.record_review(jsonb_build_object('decisionId',d.id,'action','confirmed'));raise exception 'Old policy accepted';exception when raise_exception then if SQLERRM<>'Decision stale; refresh the queue' then raise;end if;end;
 begin perform public.write_policy_as('00000000-0000-4000-8000-000000000301','activate',jsonb_build_object('id',p.id,'expected_active_id',p.id,'expected_revision',0));raise exception 'Concurrent activation accepted';exception when raise_exception then if SQLERRM<>'Active policy changed; refresh impact' then raise;end if;end;
 select * into c from public.claims where id=d.claim_id;
 d:=public.save_claim_decision(c.id,(draft->>'id')::uuid,to_jsonb(c),d.decision||jsonb_build_object('policyVersion','engine-test-policy'));
 update public.claims set case_status='closed' where id=c.id;
 begin perform public.record_review(jsonb_build_object('decisionId',d.id,'action','confirmed'));raise exception 'Closed review accepted';exception when raise_exception then if SQLERRM<>'Closed claims cannot be reviewed' then raise;end if;end;
 begin update public.claims set quote_eur=1 where id=c.id;raise exception 'Closed facts mutable';exception when raise_exception then if SQLERRM<>'Closed claims are immutable' then raise;end if;end;
 begin update public.claim_decisions set decision='{}' where id=d.id;raise exception 'Saved decision mutable';exception when raise_exception then if SQLERRM<>'Audit records cannot be changed or deleted' then raise;end if;end;
 perform public.set_team_role('00000000-0000-4000-8000-000000000301','00000000-0000-4000-8000-000000000302','reviewer');
 if not exists(select 1 from public.audit_log where action='role_changed' and actor_id='00000000-0000-4000-8000-000000000301' and entity_id='00000000-0000-4000-8000-000000000302') then raise exception 'Role audit missing';end if;
end $$;
rollback;

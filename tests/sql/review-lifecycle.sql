-- Run after all migrations. Uses a rollback so fixtures never persist.
begin;
insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data) values
 ('00000000-0000-4000-8000-000000000401','lifecycle-admin@example.invalid',now(),'{"hack_muc_access":true,"hack_muc_role":"admin"}'),
 ('00000000-0000-4000-8000-000000000402','lifecycle-handler@example.invalid',now(),'{"hack_muc_access":true,"hack_muc_role":"claims_handler"}');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000402',true);
insert into public.claims(id,submitted_by,claimant_name,claimant_email,claim_summary,quote_eur,attachments) values
 ('00000000-0000-4000-8000-000000000410',auth.uid(),'Test','test@example.invalid','Lifecycle test',1000,'[{"path":"00000000-0000-4000-8000-000000000402/report","name":"report.pdf","size":10,"type":"application/pdf"}]');
-- An owner can supplement facts, but cannot manufacture revisions or terminal pointers.
set local role authenticated;
do $$ begin
 begin update public.claims set revision=99; raise exception 'Revision spoof accepted'; exception when insufficient_privilege then null; end;
 begin update public.claims set closed_decision_id=null; raise exception 'Terminal pointer spoof accepted'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000401',true);
do $$
declare c public.claims; p public.policy_versions; a public.claim_decisions; b public.claim_decisions; again public.claim_decisions; terminal public.claim_decisions; draft jsonb; revised jsonb; result jsonb;
begin
 select * into c from public.claims where id='00000000-0000-4000-8000-000000000410';
 select * into p from public.policy_versions where status='active';
 a:=public.save_claim_decision(c.id,p.id,to_jsonb(c),jsonb_build_object('caseId',c.case_id,'policyVersion',p.version_label,'recommendation','request_information'));
 perform public.record_review(jsonb_build_object('decisionId',a.id,'action','confirmed'));
 again:=public.save_claim_decision(c.id,p.id,to_jsonb(c),a.decision);
 if again.id<>a.id then raise exception 'Unchanged evaluation lost idempotency'; end if;
 update public.claims set quote_eur=2000 where id=c.id returning * into c;
 if c.revision<>1 then raise exception 'Revision not incremented'; end if;
 b:=public.save_claim_decision(c.id,p.id,to_jsonb(c),a.decision||'{"recommendation":"human_review"}');
 update public.claims set quote_eur=1000 where id=c.id returning * into c;
 if c.revision<>2 then raise exception 'Return to original facts did not create new revision'; end if;
 terminal:=public.save_claim_decision(c.id,p.id,to_jsonb(c),a.decision);
 if terminal.id=a.id or terminal.id=b.id then raise exception 'Historical review resurrected'; end if;
 if exists(select 1 from public.audit_log where entity_type='review' and details->>'decisionId'=terminal.id::text) then raise exception 'Old review applied to new revision'; end if;
 begin perform public.record_review(jsonb_build_object('decisionId',a.id,'action','confirmed')); raise exception 'Old revision review accepted'; exception when raise_exception then if SQLERRM<>'Decision stale; refresh the queue' then raise; end if; end;
 -- A reviewer can reject another user's claim even when it has private attachments.
 perform public.record_review(jsonb_build_object('decisionId',terminal.id,'action','rejected','reason','Rejected with a clear explanation'));
 select * into c from public.claims where id=c.id;
 if c.case_status<>'closed' or c.closed_decision_id<>terminal.id then raise exception 'Rejection did not preserve the terminal decision'; end if;
 begin update public.claims set quote_eur=3000 where id=c.id; raise exception 'Rejected claim editable'; exception when raise_exception then if SQLERRM<>'Closed claims are immutable' then raise; end if; end;
 begin perform public.record_review(jsonb_build_object('decisionId',terminal.id,'action','confirmed')); raise exception 'Rejected claim reviewed again'; exception when raise_exception then if SQLERRM<>'Closed claims cannot be reviewed' then raise; end if; end;
 draft:=public.write_policy_as(auth.uid(),'create',jsonb_build_object('version_label','lifecycle-draft','rules',p.rules,'source','edit'));
 revised:=public.write_policy_as(auth.uid(),'update',jsonb_build_object('id',draft->>'id','rules',jsonb_set(p.rules,'{default,description}','"Changed after preview"')));
 if (revised->>'revision')::bigint<>1 then raise exception 'Draft revision not incremented'; end if;
 -- This is the database-side race check, even if a server read passed before the edit.
 begin perform public.write_policy_as(auth.uid(),'activate',jsonb_build_object('id',draft->>'id','expected_active_id',p.id,'expected_revision',0)); raise exception 'Stale preview activated'; exception when raise_exception then if SQLERRM<>'Draft changed; refresh impact' then raise; end if; end;
 begin perform public.write_policy_as(auth.uid(),'activate',jsonb_build_object('id',draft->>'id','expected_active_id',p.id)); raise exception 'Missing preview activated'; exception when raise_exception then if SQLERRM<>'Draft changed; refresh impact' then raise; end if; end;
 result:=public.write_policy_as(auth.uid(),'activate',jsonb_build_object('id',draft->>'id','expected_active_id',p.id,'expected_revision',1));
 if result->>'status'<>'active' then raise exception 'Fresh preview activation failed'; end if;
 begin perform public.save_claim_decision(c.id,(draft->>'id')::uuid,to_jsonb(c),terminal.decision||jsonb_build_object('policyVersion','lifecycle-draft')); raise exception 'Rejected claim evaluated under new policy'; exception when raise_exception then if SQLERRM<>'Claim missing or closed' then raise; end if; end;
end $$;
-- Closed/rejected claims disappear from the owner's editable follow-up query.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000402',true);
set local role authenticated;
do $$ begin
 update public.claims set claim_summary='Owner tries to reopen follow-up' where id='00000000-0000-4000-8000-000000000410';
 if found then raise exception 'Owner could supplement a rejected claim'; end if;
end $$;
reset role;
-- Only the service role can enter the actor wrapper; no compatibility RPC remains.
do $$ begin
 if has_function_privilege('authenticated','public.write_policy_as(uuid,text,jsonb)','EXECUTE')
 or has_function_privilege('anon','public.write_policy_as(uuid,text,jsonb)','EXECUTE') then
   raise exception 'Policy RPC exposed to browser roles';
 end if;
 if to_regprocedure('public.write_policy_revision_as(uuid,text,jsonb)') is not null then
   raise exception 'Redundant policy RPC remains';
 end if;
end $$;
rollback;

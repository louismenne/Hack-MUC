-- Run after all migrations; fixtures and activations roll back.
begin;
insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data) values
('00000000-0000-4000-8000-000000000501','quality-owner@example.invalid',now(),'{"hack_muc_access":true,"hack_muc_role":"policy_manager"}'),
('00000000-0000-4000-8000-000000000502','quality-reviewer@example.invalid',now(),'{"hack_muc_access":true,"hack_muc_role":"reviewer"}'),
('00000000-0000-4000-8000-000000000503','quality-handler@example.invalid',now(),'{"hack_muc_access":true,"hack_muc_role":"claims_handler"}');
insert into public.audit_log(id,actor_label,action,entity_type,entity_id,details) values
('00000000-0000-4000-8000-000000000511','reviewer','overridden','review','quality-test','{"datasetId":"stored","decisionSource":"server_engine","decisionId":"00000000-0000-4000-8000-000000000521","caseId":"quality-test","policyVersion":"v2","ruleId":"v2.rule1","automated":"human_review","next":"routine_processing","reason":"Documents checked"}'),
('00000000-0000-4000-8000-000000000512','legacy','overridden','review','quality-test','{"datasetId":"stored","decisionSource":"client_snapshot"}');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000502',true);
set local role authenticated;
do $$ declare i public.quality_investigations; begin
 begin perform public.open_quality_investigation('Invalid evidence',array['00000000-0000-4000-8000-000000000512'::uuid]); raise exception 'Legacy accepted'; exception when raise_exception then if SQLERRM<>'Invalid or duplicate evidence' then raise; end if; end;
 i:=public.open_quality_investigation('Review the quote threshold',array['00000000-0000-4000-8000-000000000511'::uuid]);
 if i.created_by<>auth.uid() or i.evidence->0->>'reason'<>'Documents checked' then raise exception 'Evidence or identity wrong'; end if;
 i:=public.update_quality_investigation(i.id,i.revision,'Check threshold against documented repair evidence','open');
 begin perform public.update_quality_investigation(i.id,0,'Stale overwrite','closed'); raise exception 'Stale write accepted'; exception when raise_exception then if SQLERRM<>'Investigation changed; reload before saving' then raise; end if; end;
 begin update public.quality_investigations set evidence='[]'; raise exception 'Direct write accepted'; exception when insufficient_privilege then null; end;
end $$;
reset role;
-- Reviewer can investigate, but cannot create policy versions even through privileged wrapper.
do $$ declare i public.quality_investigations; begin
 select * into i from public.quality_investigations where title='Review the quote threshold';
 begin perform public.write_policy_as('00000000-0000-4000-8000-000000000502','create',jsonb_build_object('investigation_id',i.id)); raise exception 'Reviewer drafted'; exception when raise_exception then if SQLERRM<>'Policy Manager or Admin required' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000503',true);
set local role authenticated;
do $$ begin
 if exists(select 1 from public.quality_investigations) then raise exception 'Handler read investigations'; end if;
 begin perform public.open_quality_investigation('Handler attempt',array['00000000-0000-4000-8000-000000000511'::uuid]); raise exception 'Handler investigated'; exception when raise_exception then if SQLERRM<>'Staff role required' then raise; end if; end;
end $$;
reset role;
do $$ declare i public.quality_investigations; active public.policy_versions; payload jsonb; draft jsonb; duplicate jsonb; begin
 select * into i from public.quality_investigations where title='Review the quote threshold';
 select * into active from public.policy_versions where status='active';
 payload:=jsonb_build_object('investigation_id',i.id,'investigation_revision',i.revision,'version_label','quality-draft','source','edit','rules',active.rules,'parent_version_id',active.id);
 begin perform public.write_policy_as('00000000-0000-4000-8000-000000000501','create',payload||'{"investigation_revision":0}'); raise exception 'Stale investigation drafted'; exception when raise_exception then if SQLERRM<>'Investigation changed; reload before drafting' then raise; end if; end;
 draft:=public.write_policy_as('00000000-0000-4000-8000-000000000501','create',payload);
 if draft->>'investigation_id'<>i.id::text or draft->>'status'<>'draft' then raise exception 'Draft not linked'; end if;
 if (select id from public.policy_versions where status='active')<>active.id then raise exception 'Draft autoactivated'; end if;
 duplicate:=public.write_policy_as('00000000-0000-4000-8000-000000000501','create',payload||'{"version_label":"quality-retry"}');
 if duplicate->>'id'<>draft->>'id' then raise exception 'Duplicate draft created'; end if;
 if not exists(select 1 from public.audit_log where entity_type='quality_investigation' and action='draft_linked' and entity_id=i.id::text) then raise exception 'Draft link not audited'; end if;
 begin perform public.write_policy_as('00000000-0000-4000-8000-000000000501','activate',jsonb_build_object('id',draft->>'id','expected_active_id',active.id,'expected_revision',-1)); raise exception 'Stale preview activated'; exception when raise_exception then if SQLERRM<>'Draft changed; refresh impact' then raise; end if; end;
 duplicate:=public.write_policy_as('00000000-0000-4000-8000-000000000501','activate',jsonb_build_object('id',draft->>'id','expected_active_id',active.id,'expected_revision',draft->>'revision'));
 if duplicate->>'status'<>'active' or duplicate->>'investigation_id'<>i.id::text then raise exception 'Owner activation lost link'; end if;
end $$;
rollback;

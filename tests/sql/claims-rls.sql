-- Integration test for a migrated Supabase database. All fixtures roll back.
begin;
insert into auth.users(id, email, email_confirmed_at, raw_app_meta_data) values
('00000000-0000-4000-8000-000000000101', 'claims-test-a@example.invalid', now(), '{"hack_muc_access":true,"hack_muc_role":"claims_handler"}'),
('00000000-0000-4000-8000-000000000102', 'claims-test-b@example.invalid', now(), '{"hack_muc_access":true,"hack_muc_role":"claims_handler"}'),
('00000000-0000-4000-8000-000000000103', 'claims-test-c@example.invalid', now(), '{"hack_muc_access":true,"hack_muc_role":"policy_manager"}');
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000101', true);
insert into public.claims(claimant_name, claimant_email, incident_date, claim_summary) values ('Test Claimant', 'claimant@example.invalid', current_date, 'Integration test: unknown values remain null');
do $$ begin
 if (select count(*) from public.claims where submitted_by = auth.uid()) <> 1 then raise exception 'Owner cannot read claim'; end if;
 if exists (select 1 from public.claims where submitted_by = auth.uid() and (case_status <> 'open' or quote_eur is not null or duplicate_flag is not null)) then raise exception 'Invalid defaults'; end if;
 begin
  insert into public.claims(claimant_name, claimant_email, incident_date, claim_summary, submitted_by) values ('Test Claimant', 'claimant@example.invalid', current_date, 'Forged owner must fail', '00000000-0000-4000-8000-000000000102');
  raise exception 'Owner spoof unexpectedly succeeded';
 exception when insufficient_privilege then null; end;
 begin
  insert into public.claims(claimant_name, claimant_email, incident_date, claim_summary, duplicate_flag) values ('Test Claimant', 'claimant@example.invalid', current_date, 'Forged flag must fail', false);
  raise exception 'Internal flag spoof unexpectedly succeeded';
 exception when insufficient_privilege then null; end;
 begin
  insert into public.claims(claimant_name, claimant_email, incident_date, claim_summary) values ('Test Claimant', 'claimant@example.invalid', current_date + 1, 'Future incident must fail');
  raise exception 'Future incident unexpectedly succeeded';
 exception when insufficient_privilege then null; end;
 begin
  update public.claims set case_status = 'closed';
  raise exception 'Update unexpectedly succeeded';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000102', true);
do $$ begin
 if exists (select 1 from public.claims where submitted_by = '00000000-0000-4000-8000-000000000101') then raise exception 'Cross-owner leak'; end if;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000103', true);
do $$ begin
 if not exists (select 1 from public.claims where submitted_by = '00000000-0000-4000-8000-000000000101') then raise exception 'Manager cannot read inbox'; end if;
 begin
  insert into public.claims(claimant_name, claimant_email, incident_date, claim_summary) values ('Test Claimant', 'claimant@example.invalid', current_date, 'Policy manager cannot submit');
  raise exception 'Manager insertion unexpectedly succeeded';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
-- A stale JWT role must not override a current demotion.
update auth.users set raw_app_meta_data = '{"hack_muc_access":true}' where id = '00000000-0000-4000-8000-000000000101';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000101', true);
do $$ begin
 if exists (select 1 from public.claims) then raise exception 'Demoted user can still read'; end if;
 begin
  insert into public.claims(claimant_name, claimant_email, incident_date, claim_summary) values ('Test Claimant', 'claimant@example.invalid', current_date, 'Demoted user cannot submit');
  raise exception 'Demoted insertion unexpectedly succeeded';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role anon;
do $$ begin
 begin
  perform * from public.claims;
  raise exception 'Anonymous access unexpectedly succeeded';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;

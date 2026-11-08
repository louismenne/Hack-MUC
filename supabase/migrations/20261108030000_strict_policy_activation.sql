begin;
-- Redeployed servers use one service-only interface; activation always requires
-- the exact draft revision shown in the impact preview.
create or replace function public.write_policy_as(p_actor uuid,p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform set_config('request.jwt.claim.sub',p_actor::text,true);
 return public.write_policy(p_action,p_data);
end; $$;
revoke all on function public.write_policy_as(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.write_policy_as(uuid,text,jsonb) to service_role;
drop function public.write_policy_revision_as(uuid,text,jsonb);
notify pgrst, 'reload schema';
commit;

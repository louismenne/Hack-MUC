begin;
alter table public.claims add column attachments jsonb not null default '[]'::jsonb;
create function public.valid_claim_attachments(items jsonb) returns boolean
language sql stable set search_path = '' as $$
select case when jsonb_typeof(items) <> 'array' then false else
 jsonb_array_length(items) <= 10 and not exists (
 select 1 from jsonb_array_elements(items) item where
 jsonb_typeof(item) <> 'object'
 or coalesce(item->>'path', '') not like (auth.uid()::text || '/%')
 or length(coalesce(item->>'name', '')) not between 1 and 255
 or coalesce(item->>'size', '') !~ '^[0-9]+$'
 ) end;
$$;
revoke all on function public.valid_claim_attachments(jsonb) from public, anon;
grant execute on function public.valid_claim_attachments(jsonb) to authenticated;
alter table public.claims add constraint claims_attachments_valid check (public.valid_claim_attachments(attachments));
grant insert(attachments) on public.claims to authenticated;
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('claim-documents', 'claim-documents', false, 10485760,
 array['application/pdf','image/jpeg','image/png','image/gif','image/webp','image/heic','image/heif','image/bmp','image/tiff']);
create policy claim_documents_upload on storage.objects for insert to authenticated with check (
 bucket_id = 'claim-documents' and (storage.foldername(name))[1] = auth.uid()::text
 and public.claims_role() in ('claims_handler','reviewer','admin')
);
create policy claim_documents_read on storage.objects for select to authenticated using (
 bucket_id = 'claim-documents' and (
 ((storage.foldername(name))[1] = auth.uid()::text and public.claims_role() in ('claims_handler','reviewer','admin'))
 or (public.claims_role() in ('reviewer','policy_manager','admin') and exists (
 select 1 from public.claims c where c.attachments @> jsonb_build_array(jsonb_build_object('path', name))
 ))
 )
);
-- Only uncommitted uploads can be cleaned up by the uploader.
create policy claim_documents_cleanup on storage.objects for delete to authenticated using (
 bucket_id = 'claim-documents' and (storage.foldername(name))[1] = auth.uid()::text
 and public.claims_role() in ('claims_handler','reviewer','admin')
 and not exists (select 1 from public.claims c where c.attachments @> jsonb_build_array(jsonb_build_object('path', name)))
);
commit;

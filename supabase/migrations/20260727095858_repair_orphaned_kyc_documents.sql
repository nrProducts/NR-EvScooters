-- =========================================================================
-- 20260727095858_repair_orphaned_kyc_documents.sql
--
-- BACKFILLED (see 20260727095623 for why this file exists after the fact).
-- Recreated verbatim from supabase_migrations.schema_migrations. One-time
-- data repair, not a schema change: clears user_documents/users rows that
-- point at storage objects which no longer exist (e.g. an upload that failed
-- partway), so signed-URL lookups stop 404ing.
-- =========================================================================

update public.user_documents d
   set back_storage_path = null
 where d.back_storage_path is not null
   and not exists (
       select 1 from storage.objects o
        where o.bucket_id = 'kyc-documents'
          and o.name = d.back_storage_path
   );

delete from public.user_documents d
 where not exists (
     select 1 from storage.objects o
      where o.bucket_id = 'kyc-documents'
        and o.name = d.storage_path
 );

update public.users u
   set profile_photo_url = null
 where u.profile_photo_url is not null
   and not exists (
       select 1 from storage.objects o
        where o.bucket_id = 'profile-photos'
          and o.name = u.profile_photo_url
   );

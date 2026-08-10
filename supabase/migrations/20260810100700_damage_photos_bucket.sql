-- =========================================================================
-- 20260810100700_damage_photos_bucket.sql
--
-- Private storage bucket backing public.damages.photo_urls. Same pattern as
-- vehicle-photos/kyc-documents: no `authenticated` storage policies — bytes
-- only ever leave through a backend-minted signed URL.
-- =========================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('damage-photos', 'damage-photos', false, 10485760,
        array['image/jpeg', 'image/png'])
on conflict (id) do nothing;

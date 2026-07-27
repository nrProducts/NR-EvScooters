-- =========================================================================
-- 20260727190000_vehicle_photos_bucket.sql
--
-- Private storage bucket backing public.vehicle_photos
-- (20260727181629_fleet_expansion_and_scrap.sql). Same pattern as
-- kyc-documents/profile-photos: no `authenticated` storage policies — bytes
-- only ever leave through a backend-minted signed URL.
-- =========================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vehicle-photos', 'vehicle-photos', false, 10485760,
        array['image/jpeg', 'image/png'])
on conflict (id) do nothing;

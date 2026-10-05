-- =========================================================================
-- 39 — Storage buckets
--
-- Listed as a manual step in supabase/v2/README.md and therefore never
-- created on the new project, which meant KYC upload — the first thing a
-- rider does after signing in — failed with `NoSuchBucket` on a database that
-- was otherwise complete.
--
-- Made a migration rather than six clicks: a bucket is not just a name, it
-- carries `public`, `file_size_limit` and `allowed_mime_types`, and all three
-- are enforced server-side. A bucket created by hand with the wrong MIME list
-- still fails, just with a more confusing error than "not found".
--
-- ── Buckets are not auto-created; FOLDERS are ────────────────────────────
--
-- Worth writing down, because the two behave differently and the difference
-- is not obvious.
--
-- Supabase Storage has no directories. A path is a prefix on the object key,
-- so uploading to `kyc-documents/<user-id>/front.jpg` needs no folder to
-- exist first — verified against a bucket with no objects at all:
--
--     POST /object/kyc-documents/probe/deep/nested/x.txt
--       before this migration → 404 NoSuchBucket
--       after  this migration → 415 InvalidMimeType
--
-- The second response is the proof: the request got past the bucket check and
-- past the three non-existent path segments, and failed only on the MIME
-- type. Nothing needs seeding inside these buckets.
--
-- ── Why no storage.objects policies ──────────────────────────────────────
--
-- The five private buckets are reached only by the backend with the
-- service-role key, which bypasses RLS, and bytes leave exclusively through
-- short-lived signed URLs (`kyc.storage.ts` mints them per request with a
-- 300s TTL). No client ever holds a token that reads them directly, so a
-- policy would have nothing to grant.
--
-- `vehicle-model-images` is public because `vehicle_model_media.storage_path`
-- is returned to the clients raw and used as a URL — see
-- vehicle-catalog.service.ts. It holds marketing photography, not personal
-- data.
--
-- Settings mirror the old project (`jeerugpvchfjlgssfoeb`) exactly. Its
-- `MobileApp-img` bucket is deliberately NOT carried across: public, no size
-- limit, no MIME restriction, and referenced nowhere in the codebase.
-- =========================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
    ('kyc-documents',        'kyc-documents',        false, 10485760, array['image/jpeg','image/png','application/pdf']),
    ('profile-photos',       'profile-photos',       false, 10485760, array['image/jpeg','image/png']),
    ('vehicle-photos',       'vehicle-photos',       false, 10485760, array['image/jpeg','image/png']),
    ('damage-photos',        'damage-photos',        false, 10485760, array['image/jpeg','image/png']),
    ('data-exports',         'data-exports',         false, 26214400, array['application/json']),
    ('vehicle-model-images', 'vehicle-model-images', true,  10485760, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

-- =========================================================================
-- Vehicle document files (RC / insurance / PUC / ...) get their own private
-- bucket, same pattern as kyc-documents: reached only by the backend with
-- the service-role key, bytes leave exclusively through short-lived signed
-- URLs. `public.vehicle_documents` already existed (20260819100800) with a
-- `storage_path` column, but nothing ever wrote to it — no upload endpoint,
-- no bucket. This is that bucket; the write path is added in application
-- code, not here.
-- =========================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
    ('vehicle-documents', 'vehicle-documents', false, 10485760, array['image/jpeg','image/png','application/pdf'])
on conflict (id) do nothing;

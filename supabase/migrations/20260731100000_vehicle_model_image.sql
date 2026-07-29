-- =========================================================================
-- 20260731100000_vehicle_model_image.sql
--
-- Collapses public.vehicle_images (20260721090000_vehicle_catalog.sql) into
-- a single public.vehicle_models.image column. The rider app only ever
-- rendered the hero shot on the home/list cards; the detail gallery was
-- never worth a whole table, an RLS pair and a join on every catalog read.
--
-- `image` holds a plain, directly-fetchable URL. Unlike kyc-documents /
-- profile-photos / vehicle-photos, this is public marketing artwork shown
-- to every rider browsing the catalog — there is nothing to protect, so no
-- private bucket and no signed URLs. The bucket below is public, and the
-- column happily holds an external URL instead (which is what the
-- placeholder seed values backfilled below are).
--
-- public.vehicle_photos (20260727181629_fleet_expansion_and_scrap.sql) is
-- deliberately untouched — that is per-physical-unit admin inspection
-- photography, a different table for a different layer.
-- =========================================================================

alter table public.vehicle_models
    add column if not exists image text;

-- Backfill: the hero image if one is flagged, else the first by sort_order.
update public.vehicle_models m
set image = (
    select i.url
    from public.vehicle_images i
    where i.vehicle_model_id = m.id
    order by i.is_hero desc, i.sort_order, i.created_at
    limit 1
)
where m.image is null;

-- Drops the table's trigger, index and RLS policies with it.
drop table if exists public.vehicle_images;

-- Public bucket for hosting catalog artwork. Reads need no policy (public
-- buckets are world-readable by design); writes stay service-role only, so
-- no `authenticated` storage policies are created here either.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vehicle-model-images', 'vehicle-model-images', true, 10485760,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

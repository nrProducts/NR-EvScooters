-- =========================================================================
-- 20260721090100_vehicle_catalog_rls.sql
--
-- RLS for the new catalog tables, following the same "public read for
-- authenticated, admin-only write" pattern already used for
-- stations/vehicles/plans in 20260720100500_rls.sql. Riders browse the
-- catalog; only admins (via is_admin()) manage it.
-- =========================================================================

alter table public.vendors enable row level security;

create policy vendors_select on public.vendors
    for select using (auth.uid() is not null);

create policy vendors_admin_write on public.vendors
    for all using (public.is_admin()) with check (public.is_admin());

alter table public.vehicle_models enable row level security;

create policy vehicle_models_select on public.vehicle_models
    for select using (auth.uid() is not null);

create policy vehicle_models_admin_write on public.vehicle_models
    for all using (public.is_admin()) with check (public.is_admin());

alter table public.vehicle_images enable row level security;

create policy vehicle_images_select on public.vehicle_images
    for select using (auth.uid() is not null);

create policy vehicle_images_admin_write on public.vehicle_images
    for all using (public.is_admin()) with check (public.is_admin());

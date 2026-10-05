-- =========================================================================
-- Manufacturing batch number, per vehicle unit. Nullable — existing units
-- have none — but unique the moment one is set, same as registration_number,
-- vin, qr_code and imei.
-- =========================================================================

alter table public.vehicles add column batch_number text unique;

comment on column public.vehicles.batch_number is
    'Manufacturing batch/lot number for this unit. Optional; unique when present.';

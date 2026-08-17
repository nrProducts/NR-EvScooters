-- Admin "Cancel" action on a pending/applied rider_discounts row — mirrors
-- rider_charges' waived_reason/waived_by/waived_at, which the row keeps on
-- record rather than deleting.
alter table public.rider_discounts add column cancel_reason text;
alter table public.rider_discounts add column cancelled_by uuid references public.users(id);
alter table public.rider_discounts add column cancelled_at timestamptz;

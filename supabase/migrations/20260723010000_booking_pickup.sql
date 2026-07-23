-- =========================================================================
-- 20260723010000_booking_pickup.sql
--
-- Adds the "pickup/check-in phase" the bookings migration's own comment
-- anticipated but never built: a 'fulfilled' terminal status for a booking
-- once staff assign a physical vehicle and it becomes an active rental, and
-- a traceability link from that rental back to the booking it fulfilled.
--
-- 'fulfilled' is deliberately left out of any "active booking" grouping —
-- once fulfilled, the rider's active state is the rental, not the booking.
--
-- Additive only, per the standing rule in supabase/SETUP.md.
-- =========================================================================

alter type public.booking_status add value if not exists 'fulfilled';

alter table public.rentals
    add column if not exists booking_id uuid references public.bookings(id) on delete set null;

create index if not exists idx_rentals_booking_id on public.rentals (booking_id);

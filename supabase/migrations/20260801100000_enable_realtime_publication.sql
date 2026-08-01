-- Enables Supabase Realtime (Postgres Changes) for the admin web app's
-- global realtime notifications feature. None of these tables were in the
-- publication before this migration — client-side .on('postgres_changes')
-- subscriptions silently receive nothing until a table is added here.
alter publication supabase_realtime add table public.bookings, public.vehicles, public.invoices, public.notifications_log;

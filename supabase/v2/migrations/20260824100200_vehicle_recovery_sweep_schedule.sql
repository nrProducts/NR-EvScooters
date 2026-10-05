-- Scheduled after payment-overdue-sweep (03:10, which may promote a
-- subscription period and thereby advance due_back_at via
-- sync_rental_due_on_period_current) so this always sees the day's settled
-- period state before deciding who's overdue for physical return.
select cron.schedule('vehicle-recovery-sweep-daily', '22 3 * * *',
    $$select public.invoke_edge_function('vehicle-recovery-sweep')$$);

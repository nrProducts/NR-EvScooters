-- =========================================================================
-- A batch is a GROUP of vehicles (e.g. the first 20 units are batch "1"),
-- not a per-unit identifier. 20260823110000 made batch_number unique, so a
-- second vehicle could never join a batch. Drop the unique constraint and
-- keep a plain index so the fleet can still be filtered by batch.
-- =========================================================================

do $$
declare
    con text;
begin
    for con in
        select c.conname
        from pg_constraint c
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
        where c.conrelid = 'public.vehicles'::regclass
          and c.contype = 'u'
          and a.attname = 'batch_number'
          and array_length(c.conkey, 1) = 1
    loop
        execute format('alter table public.vehicles drop constraint %I', con);
    end loop;
end $$;

create index if not exists idx_vehicles_batch_number
    on public.vehicles (batch_number)
    where batch_number is not null;

comment on column public.vehicles.batch_number is
    'Manufacturing/procurement batch this unit belongs to (e.g. "1" for the first 20 units). Optional; shared by every vehicle in the batch.';

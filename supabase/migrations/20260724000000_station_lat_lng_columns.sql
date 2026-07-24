-- =========================================================================
-- 20260724000000_station_lat_lng_columns.sql
--
-- public.stations.location is a PostGIS geography(Point,4326) with no plain
-- lat/lng columns (see nearest_station_fn.sql). Bookings need to embed a
-- station's coordinates (for the rider's "get directions to pickup" button)
-- through the normal Supabase `stations(id, name, code, lat, lng)` embed,
-- which can't express ST_X/ST_Y inline. PostgREST computed columns — a
-- function taking the table's row type as its single argument — are
-- selectable as plain columns through that embed, so this exposes lat/lng
-- without any backend code touching PostGIS.
-- =========================================================================

create or replace function public.lat(s public.stations) returns double precision
language sql
stable
set search_path = public
as $$
    select ST_Y(s.location::geometry);
$$;

create or replace function public.lng(s public.stations) returns double precision
language sql
stable
set search_path = public
as $$
    select ST_X(s.location::geometry);
$$;

grant execute on function public.lat(public.stations) to authenticated;
grant execute on function public.lng(public.stations) to authenticated;

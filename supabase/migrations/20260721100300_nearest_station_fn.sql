-- =========================================================================
-- 20260721100300_nearest_station_fn.sql
--
-- public.stations.location is a PostGIS geography(Point,4326) — there are
-- no plain lat/lng columns, and the Supabase JS query builder can't express
-- ST_Distance/KNN ordering directly. This function does the PostGIS work
-- server-side and returns plain lat/lng (via ST_Y/ST_X) plus a computed
-- distance, so the backend never has to parse WKB/GeoJSON and the mobile
-- client never touches PostGIS at all.
--
-- No SECURITY DEFINER: runs with the caller's own privileges, so it still
-- respects the existing stations_select RLS policy (auth.uid() is not
-- null) rather than silently bypassing it.
-- =========================================================================

create or replace function public.nearest_station(p_lat double precision, p_lng double precision)
returns table (
    id           uuid,
    name         text,
    code         text,
    lat          double precision,
    lng          double precision,
    distance_km  double precision
)
language sql
stable
set search_path = public
as $$
    select
        s.id,
        s.name,
        s.code,
        ST_Y(s.location::geometry) as lat,
        ST_X(s.location::geometry) as lng,
        ST_Distance(s.location, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography) / 1000.0 as distance_km
    from public.stations s
    where s.active
    order by s.location <-> ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
    limit 1;
$$;

grant execute on function public.nearest_station(double precision, double precision) to authenticated;

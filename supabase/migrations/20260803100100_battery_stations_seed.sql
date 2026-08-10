-- =========================================================================
-- 20260803100100_battery_stations_seed.sql
--
-- The 37 stations of the initial Chennai battery-swap network, as supplied
-- by operations.
--
-- Idempotent on serial_number, and deliberately keyed on ALL rows rather
-- than live ones: re-running the migration set (or `supabase db reset`
-- against a database that already has data) must not duplicate a station,
-- must not overwrite an admin's later edits, and must not resurrect a
-- station an admin has soft-deleted.
--
-- Names are stored verbatim, underscores and all (see the column comment in
-- 20260803100000_battery_stations.sql). Coordinates are (latitude,
-- longitude) in that order — Chennai is ~13°N 80°E, so latitude is the ~12-13
-- value and longitude the ~80 value. Reversing them lands the map in Somalia.
-- =========================================================================

with seed (serial_number, qis_ids, name, latitude, longitude, status, battery_count) as (
values
    (1, array['WMQISXM1V1-00774', 'WMQISXM1V1-00776'], 'KAVYA AGENCIES', 13.0648, 80.197765, 'WORKING', 28),
    (2, array['WMQISXM1V1-00977', 'WMQISXM1V1-00980'], 'Virugambakkam', 13.0548, 80.1873, 'WORKING', 28),
    (3, array['WMQISXM1V1-00801'], 'Saidapet Railway station', 13.0239454, 80.2239175, 'WORKING', 14),
    (4, array['WMQISXM1V1-00824', 'WMQISXM1V1-00817'], 'Egmore Railway Station', 13.0779871, 80.2619914, 'WORKING', 28),
    (5, array['WMQISXM1V1-00900'], 'SHRE OM SAI AGENCY', 13.142855, 80.2228683, 'WORKING', 14),
    (6, array['WMQISXM1V1-02196', 'WMQISXM1V1-02198'], 'Mogappaire_Hub', 13.075088, 80.185469, 'WORKING', 28),
    (7, array['WMQISXM1V1-00902', 'WMQISXM1V1-00903'], 'Mundakakanniamman Koil Railway Station_2 QIS', 13.0397304, 80.2693693, 'WORKING', 28),
    (8, array['WMQISXM1V1-00820', 'WMQISXM1V1-00821'], 'Chintadripet Railway Station', 13.07311, 80.273583, 'WORKING', 28),
    (9, array['WMQISXM1V1-00778'], 'Thirumayilai', 13.0348859, 80.266978, 'WORKING', 14),
    (10, array['WMQISXM1V1-01025'], 'KOTTURPURAM (KTPM) Railway Station', 13.015004, 80.248179, 'WORKING', 14),
    (11, array['WMQISXM1V1-01029'], 'THIRUVANMYUR (TYMR) Railway Station', 12.989378, 80.2511327, 'WORKING', 14),
    (12, array['WMQISXM1V1-00797'], 'ADAMBAKKAM CO-OP BUILDING SL(TNHCF)', 12.979648, 80.201394, 'WORKING', 14),
    (13, array['WMQISXM1V1-02176', 'WMQISXM1V1-02205'], 'St.Thomas Mount', 12.99615, 80.20029, 'WORKING', 28),
    (14, array['WMQISXM1V1-00806', 'WMQISXM1V1-00808'], 'Taramani Railway Station', 12.9785235, 80.2408429, 'WORKING', 28),
    (15, array['WMQISXM1V1-00981'], 'Perungudi Railway station', 12.976035, 80.231786, 'WORKING', 14),
    (16, array['WMQISXM1V1-00929', 'WMQISXM1V1-00931'], 'Pallikaranai_Pvt_4 QIS', 12.9391633, 80.203525, 'WORKING', 28),
    (17, array['WMQISXM1V1-00805', 'WMQISXM1V1-00807'], 'Velachery Railway Station', 12.971073, 80.219217, 'WORKING', 28),
    (18, array['WMQISXM1V1-00934', 'WMQISXM1V1-00923'], 'Valsarvakkam_4 QIS', 13.0403425, 80.178421, 'WORKING', 28),
    (19, array['WMQISXM1V1-00841', 'WMQISXM1V1-00847'], 'Moeving - Porur', 13.043659, 80.164598, 'WORKING', 28),
    (20, array['WMQISXM1V1-00983'], 'Thuraipakkam_hub', 12.929997, 80.233665, 'WORKING', 14),
    (21, array['WMQISXM1V1-00979'], 'Basin Bridge', 13.103977, 80.274168, 'WORKING', 14),
    (22, array['WMQISXM1V1-02203'], 'Washermanpet', 13.108654, 80.281844, 'WORKING', 14),
    (23, array['WMQISXM1V1-00853', 'WMQISXM1V1-00855'], 'Chennai Central Suburban Station', 13.082806, 80.273642, 'WORKING', 28),
    (24, array['WMQISXM1V1-00995'], 'Anna Nagar West Extension', 13.089261, 80.194874, 'WORKING', 14),
    (25, array['WMQISXM1V1-00812', 'WMQISXM1V1-00816'], 'Annanur Railway Station', 13.117360, 80.126137, 'WORKING', 14),
    (26, array['WMQISXM1V1-00997'], 'Guindy_Maduvankarai_Hub', 12.998300, 80.207958, 'WORKING', 14),
    (27, array['WMQISXM1V1-02303'], 'Mandaveli Railway Station', 13.028746, 80.261135, 'WORKING', 14),
    (28, array['WMQISXM1V1-02305', 'WMQISXM1V1-02308'], 'Kodambakkam Railway Station', 13.051989, 80.230281, 'WORKING', 28),
    (29, array['WMQISXM1V1-02194'], 'Greenways Road Railway Station', 13.021062, 80.252794, 'WORKING', 14),
    (30, array['WMQISXM1V1-02301', 'WMQISXM1V1-02306'], 'Chrompet_Hub_Private', 12.945565, 80.156203, 'WORKING', 28),
    (31, array['WMQISXM1V1-02307'], 'Thiruvallikeni Railway station', 13.055873, 80.280715, 'WORKING', 14),
    (32, array['WMQISXM1V1-02347', 'WMQISXM1V1-02338'], 'East_Tambaram', 12.919910, 80.140095, 'WORKING', 28),
    (33, array['WMQISXM1V1-02362'], 'Selaiyur', 12.912581, 80.141060, 'WORKING', 14),
    (34, array['WMQISXM1V1-02330'], 'Semmancherry', 12.877046, 80.202494, 'WORKING', 14),
    (35, array['WMQISXM1V1-00844'], 'Karapakkam', 12.911359, 80.233504, 'WORKING', 14),
    (36, array['WMQISXM1V1-02339', 'WMQISXM1V1-02348'], 'Anna Nagar Bajanai Koil street', 13.078933, 80.212885, 'WORKING', 28),
    (37, array['WMQISXM1V1-02415', 'WMQISXM1V1-02416'], 'Sembakkam', 12.931337, 80.157706, 'WORKING', 28)
)
insert into public.battery_stations
    (serial_number, qis_ids, name, latitude, longitude, status, battery_count)
select
    s.serial_number,
    s.qis_ids,
    s.name,
    s.latitude::double precision,
    s.longitude::double precision,
    s.status::public.battery_station_status,
    s.battery_count
from seed s
where not exists (
    select 1 from public.battery_stations b where b.serial_number = s.serial_number
);

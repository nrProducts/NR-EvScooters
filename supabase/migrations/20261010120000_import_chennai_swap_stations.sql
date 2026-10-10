-- =========================================================================
-- Import the real Chennai battery-swap network — 37 stations, 56 QIS IDs.
--
-- The source export came from an OLDER schema (`battery_stations` /
-- `battery_station_qis_index`) and cannot be replayed as written. What it
-- said, and what this does instead:
--
--   battery_stations                 -> swap_stations
--   battery_station_qis_index        -> swap_station_qis_ids
--   latitude / longitude columns     -> GENERATED here (st_y/st_x of
--                                       `location`), so the point is built
--                                       once and the two read-only columns
--                                       follow from it
--   is_visible_on_mobile             -> is_rider_visible
--   created_by / updated_by          -> created_by_user_id /
--                                       updated_by_user_id, left NULL: the
--                                       one actor id in the export belongs
--                                       to the old system's user table and
--                                       would not resolve here
--   qis_ids[] + qis_ids_text         -> dropped; the child table is the only
--                                       place QIS IDs live in this schema
--   status 'WORKING'                 -> 'working' (enum is lower case)
--   (absent)                         -> `code`, NOT NULL and UNIQUE, derived
--                                       from the serial as SWP-0001
--
-- THE TWO EXISTING ROWS ARE REMOVED FIRST.
--
-- `swap_stations.serial_number` is UNIQUE and the export uses 1..37, which
-- collides with the two development samples already present (Egmore
-- SWP-0001, Maduravoyal SWP-0002). The export also contains its own Egmore
-- Railway Station at serial 4, so keeping the old row would leave two
-- stations with the same name on the rider's map. Nothing outside
-- swap_station_qis_ids references swap_stations — checked, the only inbound
-- foreign key — so removing them strands no booking or rental.
-- =========================================================================

-- --- out with the samples -------------------------------------------------
-- By id, not by a blanket delete: this must not quietly remove anything an
-- operator has added since.

delete from public.swap_station_qis_ids
 where swap_station_id in (
     'abc6db48-1812-4a60-842f-cfec9a285a64',  -- Egmore Railway Station (SWP-0001)
     '125f9c15-46a4-429b-b117-bd9ea81337af'   -- Maduravoyal (SWP-0002)
 );

delete from public.swap_stations
 where id in (
     'abc6db48-1812-4a60-842f-cfec9a285a64',
     '125f9c15-46a4-429b-b117-bd9ea81337af'
 );

-- --- the network ----------------------------------------------------------
-- `code` and `location` are derived in the SELECT rather than written out 37
-- times by hand — one expression that cannot drift row to row, and no chance
-- of a transposed lat/lng in a literal. st_makepoint takes LONGITUDE FIRST,
-- which is the opposite of how the pair is always spoken.

insert into public.swap_stations
    (id, serial_number, code, name, location, status, battery_count, is_rider_visible, created_at)
select v.id,
       v.serial,
       'SWP-' || lpad(v.serial::text, 4, '0'),
       v.name,
       st_setsrid(st_makepoint(v.lng, v.lat), 4326)::geography,
       'working'::swap_station_status,
       v.battery_count,
       true,
       timestamptz '2026-08-03 05:45:55.398156+00'
  from (values
    ('76d3c6ec-5c9a-4ef7-ba5c-7baa9ba2cc1c'::uuid,  1, 'KAVYA AGENCIES',                              13.0648,    80.197765,  28),
    ('b0f3fdec-4299-4b2c-8cc0-b2c160e7199e'::uuid,  2, 'Virugambakkam',                               13.0548,    80.1873,    28),
    ('04fbba54-2912-4938-97a4-fcc1399da725'::uuid,  3, 'Saidapet Railway station',                    13.0239454, 80.2239175, 14),
    ('10711db0-87ea-4403-a18b-331c42715da9'::uuid,  4, 'Egmore Railway Station',                      13.0779871, 80.2619914, 28),
    ('da979973-dbf3-4138-8ae7-df25f403aedb'::uuid,  5, 'SHRE OM SAI AGENCY',                          13.142855,  80.2228683, 14),
    ('1ffa0fea-5eb2-4cc0-a74a-c7ede4b81bf8'::uuid,  6, 'Mogappaire_Hub',                              13.075088,  80.185469,  28),
    ('fdbdc2b8-9900-42ed-876e-aaa105d928d2'::uuid,  7, 'Mundakakanniamman Koil Railway Station_2 QIS',13.0397304, 80.2693693, 28),
    ('a2900049-7bed-4d95-9664-018381dd1224'::uuid,  8, 'Chintadripet Railway Station',                13.07311,   80.273583,  28),
    ('76bceefa-d628-4bbb-8eef-1157a64942da'::uuid,  9, 'Thirumayilai',                                13.0348859, 80.266978,  14),
    ('7a410272-cfa7-49ad-b858-e23bc3336be2'::uuid, 10, 'KOTTURPURAM (KTPM) Railway Station',          13.015004,  80.248179,  14),
    ('be0aaa83-a5bc-4ef6-8af4-b144639da73d'::uuid, 11, 'THIRUVANMYUR (TYMR) Railway Station',         12.989378,  80.2511327, 14),
    ('68cf8076-30a2-45d0-9aff-fc5dc1da75a8'::uuid, 12, 'ADAMBAKKAM CO-OP BUILDING SL(TNHCF)',         12.979648,  80.201394,  14),
    ('77af44f5-70c6-4681-8a66-c6c140189c8f'::uuid, 13, 'St.Thomas Mount',                             12.99615,   80.20029,   28),
    ('7e489c07-5693-462f-9b92-304e640709d6'::uuid, 14, 'Taramani Railway Station',                    12.9785235, 80.2408429, 28),
    ('91e57db3-de76-4aab-a1a0-2213ddaf01ed'::uuid, 15, 'Perungudi Railway station',                   12.976035,  80.231786,  14),
    ('d87edebb-0c18-49cf-80ed-3001bdaf42ac'::uuid, 16, 'Pallikaranai_Pvt_4 QIS',                      12.9391633, 80.203525,  28),
    ('ac2fa832-c5d8-41a3-8220-388bb859f8d8'::uuid, 17, 'Velachery Railway Station',                   12.971073,  80.219217,  28),
    ('c6ab1a28-6878-4d65-95d5-b910c122dbb5'::uuid, 18, 'Valsarvakkam_4 QIS',                          13.0403425, 80.178421,  28),
    ('2c2c8569-ee95-40ae-8744-4e66c6a07393'::uuid, 19, 'Moeving - Porur',                             13.043659,  80.164598,  28),
    ('d4f8cc0d-1a02-4d09-9728-d25466b2133e'::uuid, 20, 'Thuraipakkam_hub',                            12.929997,  80.233665,  14),
    ('a81956eb-5b3f-430f-9b86-1ab9eeaf50d1'::uuid, 21, 'Basin Bridge',                                13.103977,  80.274168,  14),
    ('a46bb1cc-e080-4d36-b9e0-ae8ab5d863c4'::uuid, 22, 'Washermanpet',                                13.108654,  80.281844,  14),
    ('348bb38f-2300-490b-b314-4ebb277f86b9'::uuid, 23, 'Chennai Central Suburban Station',            13.082806,  80.273642,  28),
    ('a6c2222c-3846-4292-b6b7-31a4d2aee984'::uuid, 24, 'Anna Nagar West Extension',                   13.089261,  80.194874,  14),
    ('9444f184-91ef-4d89-935c-0f54a01aa96a'::uuid, 25, 'Annanur Railway Station',                     13.11736,   80.126137,  14),
    ('1ba6abff-835e-4678-a5f5-8030466379ea'::uuid, 26, 'Guindy_Maduvankarai_Hub',                     12.9983,    80.207958,  14),
    ('609e6ddc-57cf-459f-a040-21cf399d34ee'::uuid, 27, 'Mandaveli Railway Station',                   13.028746,  80.261135,  14),
    ('997bf6bf-bcb6-4ecd-9dba-014197cd842e'::uuid, 28, 'Kodambakkam Railway Station',                 13.051989,  80.230281,  28),
    ('29757c37-4a66-4684-8854-8ce18e8f958d'::uuid, 29, 'Greenways Road Railway Station',              13.021062,  80.252794,  14),
    ('4e375c68-bcf4-4361-8b15-a6eedbf8f848'::uuid, 30, 'Chrompet_Hub_Private',                        12.945565,  80.156203,  28),
    ('67609e8e-41e3-4715-b3f0-705f3e6f7807'::uuid, 31, 'Thiruvallikeni Railway station',              13.055873,  80.280715,  14),
    ('eb81e83e-6625-45ce-b0af-3bb137156feb'::uuid, 32, 'East_Tambaram',                               12.91991,   80.140095,  28),
    ('8a0b87aa-52b5-461b-9022-1734f615abc7'::uuid, 33, 'Selaiyur',                                    12.912581,  80.14106,   14),
    ('0df80e35-a05d-470a-8aca-de4f017ba4fe'::uuid, 34, 'Semmancherry',                                12.877046,  80.202494,  14),
    ('8bff8e9d-fc49-4b3a-b84a-1b349c6d11fa'::uuid, 35, 'Karapakkam',                                  12.911359,  80.233504,  14),
    ('3fc1cd9d-5756-411c-8b73-7434db8fd626'::uuid, 36, 'Anna Nagar Bajanai Koil street',              13.078933,  80.212885,  28),
    ('4edb387a-d914-4dd5-83cb-5c5c702006d6'::uuid, 37, 'Sembakkam',                                   12.931337,  80.157706,  28)
  ) as v(id, serial, name, lat, lng, battery_count);

-- --- QIS IDs --------------------------------------------------------------
-- 56 mappings. A station carries one or two; battery_count above is 14 per
-- QIS, which is why the two-QIS stations read 28.

insert into public.swap_station_qis_ids (swap_station_id, qis_id) values
    ('76d3c6ec-5c9a-4ef7-ba5c-7baa9ba2cc1c', 'WMQISXM1V1-00774'),
    ('76d3c6ec-5c9a-4ef7-ba5c-7baa9ba2cc1c', 'WMQISXM1V1-00776'),
    ('76bceefa-d628-4bbb-8eef-1157a64942da', 'WMQISXM1V1-00778'),
    ('68cf8076-30a2-45d0-9aff-fc5dc1da75a8', 'WMQISXM1V1-00797'),
    ('04fbba54-2912-4938-97a4-fcc1399da725', 'WMQISXM1V1-00801'),
    ('ac2fa832-c5d8-41a3-8220-388bb859f8d8', 'WMQISXM1V1-00805'),
    ('7e489c07-5693-462f-9b92-304e640709d6', 'WMQISXM1V1-00806'),
    ('ac2fa832-c5d8-41a3-8220-388bb859f8d8', 'WMQISXM1V1-00807'),
    ('7e489c07-5693-462f-9b92-304e640709d6', 'WMQISXM1V1-00808'),
    ('9444f184-91ef-4d89-935c-0f54a01aa96a', 'WMQISXM1V1-00812'),
    ('9444f184-91ef-4d89-935c-0f54a01aa96a', 'WMQISXM1V1-00816'),
    ('10711db0-87ea-4403-a18b-331c42715da9', 'WMQISXM1V1-00817'),
    ('a2900049-7bed-4d95-9664-018381dd1224', 'WMQISXM1V1-00820'),
    ('a2900049-7bed-4d95-9664-018381dd1224', 'WMQISXM1V1-00821'),
    ('10711db0-87ea-4403-a18b-331c42715da9', 'WMQISXM1V1-00824'),
    ('2c2c8569-ee95-40ae-8744-4e66c6a07393', 'WMQISXM1V1-00841'),
    ('8bff8e9d-fc49-4b3a-b84a-1b349c6d11fa', 'WMQISXM1V1-00844'),
    ('2c2c8569-ee95-40ae-8744-4e66c6a07393', 'WMQISXM1V1-00847'),
    ('348bb38f-2300-490b-b314-4ebb277f86b9', 'WMQISXM1V1-00853'),
    ('348bb38f-2300-490b-b314-4ebb277f86b9', 'WMQISXM1V1-00855'),
    ('da979973-dbf3-4138-8ae7-df25f403aedb', 'WMQISXM1V1-00900'),
    ('fdbdc2b8-9900-42ed-876e-aaa105d928d2', 'WMQISXM1V1-00902'),
    ('fdbdc2b8-9900-42ed-876e-aaa105d928d2', 'WMQISXM1V1-00903'),
    ('c6ab1a28-6878-4d65-95d5-b910c122dbb5', 'WMQISXM1V1-00923'),
    ('d87edebb-0c18-49cf-80ed-3001bdaf42ac', 'WMQISXM1V1-00929'),
    ('d87edebb-0c18-49cf-80ed-3001bdaf42ac', 'WMQISXM1V1-00931'),
    ('c6ab1a28-6878-4d65-95d5-b910c122dbb5', 'WMQISXM1V1-00934'),
    ('b0f3fdec-4299-4b2c-8cc0-b2c160e7199e', 'WMQISXM1V1-00977'),
    ('a81956eb-5b3f-430f-9b86-1ab9eeaf50d1', 'WMQISXM1V1-00979'),
    ('b0f3fdec-4299-4b2c-8cc0-b2c160e7199e', 'WMQISXM1V1-00980'),
    ('91e57db3-de76-4aab-a1a0-2213ddaf01ed', 'WMQISXM1V1-00981'),
    ('d4f8cc0d-1a02-4d09-9728-d25466b2133e', 'WMQISXM1V1-00983'),
    ('a6c2222c-3846-4292-b6b7-31a4d2aee984', 'WMQISXM1V1-00995'),
    ('1ba6abff-835e-4678-a5f5-8030466379ea', 'WMQISXM1V1-00997'),
    ('7a410272-cfa7-49ad-b858-e23bc3336be2', 'WMQISXM1V1-01025'),
    ('be0aaa83-a5bc-4ef6-8af4-b144639da73d', 'WMQISXM1V1-01029'),
    ('77af44f5-70c6-4681-8a66-c6c140189c8f', 'WMQISXM1V1-02176'),
    ('29757c37-4a66-4684-8854-8ce18e8f958d', 'WMQISXM1V1-02194'),
    ('1ffa0fea-5eb2-4cc0-a74a-c7ede4b81bf8', 'WMQISXM1V1-02196'),
    ('1ffa0fea-5eb2-4cc0-a74a-c7ede4b81bf8', 'WMQISXM1V1-02198'),
    ('a46bb1cc-e080-4d36-b9e0-ae8ab5d863c4', 'WMQISXM1V1-02203'),
    ('77af44f5-70c6-4681-8a66-c6c140189c8f', 'WMQISXM1V1-02205'),
    ('4e375c68-bcf4-4361-8b15-a6eedbf8f848', 'WMQISXM1V1-02301'),
    ('609e6ddc-57cf-459f-a040-21cf399d34ee', 'WMQISXM1V1-02303'),
    ('997bf6bf-bcb6-4ecd-9dba-014197cd842e', 'WMQISXM1V1-02305'),
    ('4e375c68-bcf4-4361-8b15-a6eedbf8f848', 'WMQISXM1V1-02306'),
    ('67609e8e-41e3-4715-b3f0-705f3e6f7807', 'WMQISXM1V1-02307'),
    ('997bf6bf-bcb6-4ecd-9dba-014197cd842e', 'WMQISXM1V1-02308'),
    ('0df80e35-a05d-470a-8aca-de4f017ba4fe', 'WMQISXM1V1-02330'),
    ('eb81e83e-6625-45ce-b0af-3bb137156feb', 'WMQISXM1V1-02338'),
    ('3fc1cd9d-5756-411c-8b73-7434db8fd626', 'WMQISXM1V1-02339'),
    ('eb81e83e-6625-45ce-b0af-3bb137156feb', 'WMQISXM1V1-02347'),
    ('3fc1cd9d-5756-411c-8b73-7434db8fd626', 'WMQISXM1V1-02348'),
    ('8a0b87aa-52b5-461b-9022-1734f615abc7', 'WMQISXM1V1-02362'),
    ('4edb387a-d914-4dd5-83cb-5c5c702006d6', 'WMQISXM1V1-02415'),
    ('4edb387a-d914-4dd5-83cb-5c5c702006d6', 'WMQISXM1V1-02416');

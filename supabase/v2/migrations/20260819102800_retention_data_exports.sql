-- =========================================================================
-- 31 — retention_policies: the rights-export bundle
--
-- `generateExport` tells every rider, in the resolution notes it writes onto
-- their request row, that "the file is deleted from our servers after 30
-- days". Nothing was enforcing that: `data-retention-purge` drives itself
-- entirely from `retention_policies`, and the seed in migration 27 has no
-- row for the export bucket, so the handler never ran.
--
-- An export bundle is the most concentrated PII artefact the system
-- produces — every table a rider appears in, in one downloadable file. It is
-- the last thing that should outlive its purpose.
--
-- 30 days matches the promise already made in the notes. Changing it is a
-- reviewed row update, which is the whole reason periods live in this table
-- rather than in the function.
-- =========================================================================

insert into public.retention_policies (category, description, retain_days, action, legal_basis)
values (
    'data_exports',
    'Generated access-request bundles in the data-exports bucket',
    30,
    'delete',
    'DPDPA s.8(7) storage limitation'
)
on conflict (category) do nothing;

-- =========================================================================
-- 20260814100400_dpdpa_pii_access_log.sql
--
-- Who READ a rider's personal data, when, and why.
--
-- audit_logs already records writes and decisions. It does not record reads,
-- and reads are the exposure that actually matters here: any admin can open
-- any rider's Aadhaar and driving-licence scans at full resolution, and until
-- now that left no trace at all. "We do not know who looked" is not an answer
-- you can give a regulator or a rider.
--
-- Kept as a separate table rather than more writeAudit() calls because the
-- volume (every signed-URL mint), the retention (3 years vs up to 8 for
-- financial actions) and the consumer (a rider-facing "who looked at my data"
-- view) are all different. The rule for contributors is one line:
--   writeAudit records writes and decisions; logPiiAccess records reads.
-- =========================================================================

create table public.pii_access_log (
    id             uuid primary key default gen_random_uuid(),

    actor_id       uuid references public.users(id) on delete set null,
    -- Snapshotted rather than joined: the actor's roles at the moment of
    -- access are the fact under investigation, and roles change.
    actor_roles    text[] not null default '{}',

    target_user_id uuid references public.users(id) on delete set null,

    -- kyc_document_image | kyc_detail | user_profile | profile_photo
    -- | data_export | consent_history
    resource       text not null,
    resource_id    text,
    -- Which sensitive fields were actually returned, so the log answers
    -- "what did they see", not merely "they opened a page".
    fields         text[],

    reason         public.pii_access_reason not null default 'other',
    -- Support ticket or DPR reference tying the access to a real task.
    context_ref    text,

    ip             inet,
    user_agent     text,
    path           text,
    created_at     timestamptz not null default now()
);

create index idx_pii_access_target  on public.pii_access_log (target_user_id, created_at desc);
create index idx_pii_access_actor   on public.pii_access_log (actor_id, created_at desc);
create index idx_pii_access_created on public.pii_access_log (created_at desc);
create index idx_pii_access_reason  on public.pii_access_log (reason, created_at desc);

create trigger trg_pii_access_append_only
    before update or delete on public.pii_access_log
    for each row execute function public.trg_append_only_fn();

alter table public.pii_access_log enable row level security;

-- The data principal can see who looked at their own data.
--
-- This is deliberate and slightly unusual. It costs nothing, and it is the
-- single most credible accountability artefact available: a log only staff can
-- read is a log the people it protects have to take on trust.
create policy pii_access_select on public.pii_access_log
    for select using (target_user_id = auth.uid() or public.is_admin());

-- No insert policy. Written by the backend service role only, like audit_logs.

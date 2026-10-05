-- =========================================================================
-- Fix: compute_kyc_status() counted a rejected document of ANY type, not
-- just the mandatory ones (aadhaar, driving_licence).
--
-- v_total and v_verified were correctly filtered to mandatory_kyc_doc_types(),
-- but v_rejected was not — so a rejected OPTIONAL document (passport,
-- voter_id, address_proof) flipped an otherwise fully-verified rider to
-- 'rejected', which the app surfaces as "Complete KYC" even though both
-- mandatory documents are verified. Reported as: an already-verified rider
-- logging in and being sent back through the KYC gate.
--
-- Only rejects the WHOLE submission for a rejected MANDATORY document now,
-- matching the same filter already used for v_total/v_verified.
-- =========================================================================

create or replace function public.compute_kyc_status(p_user_id uuid)
returns public.kyc_status
language plpgsql stable set search_path = ''
as $$
declare
    v_required int := array_length(public.mandatory_kyc_doc_types(), 1);
    v_total    int;
    v_verified int;
    v_rejected int;
begin
    select count(*) filter (where d.document_type = any (public.mandatory_kyc_doc_types())),
           count(*) filter (where d.document_type = any (public.mandatory_kyc_doc_types())
                              and d.verification_status = 'verified'),
           count(*) filter (where d.document_type = any (public.mandatory_kyc_doc_types())
                              and d.verification_status = 'rejected')
      into v_total, v_verified, v_rejected
      from public.kyc_documents d
     where d.user_id = p_user_id;

    if v_total = 0                then return 'not_submitted';
    elsif v_rejected > 0          then return 'rejected';
    elsif v_verified >= v_required then return 'verified';
    elsif v_verified > 0          then return 'partially_verified';
    else                               return 'pending';
    end if;
end $$;

-- Recompute every rider's stored kyc_status with the corrected function —
-- fixes anyone already wrongly stuck on 'rejected' from the bug above,
-- without waiting for their next document change to re-trigger the sync.
update public.rider_profiles
   set kyc_status = public.compute_kyc_status(user_id),
       updated_at = now()
 where kyc_status is distinct from public.compute_kyc_status(user_id);

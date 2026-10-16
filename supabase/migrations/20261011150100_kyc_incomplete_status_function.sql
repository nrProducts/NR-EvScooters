-- =========================================================================
-- KYC: use the new 'incomplete' status.
--
-- Must be its own migration, after 20261011150000 has committed — see that
-- file's header.
--
-- compute_kyc_status() returned 'pending' the moment a rider uploaded ANY
-- mandatory document — not once they'd uploaded ALL of them. A rider who
-- uploaded only Aadhaar (driving_licence still missing) showed up in the
-- admin's "Pending" queue indistinguishable from one who'd genuinely
-- finished and tapped Submit, Approve/Reject offered right there — even
-- though submitKyc() itself already correctly refuses to submit (and never
-- sends the kyc_review_needed notification) until every mandatory document
-- type is present. The notification side was always right; the STATUS/QUEUE
-- side was not, and let an admin act on a submission that was never
-- actually complete.
--
-- 'incomplete': some, but not all, mandatory document types uploaded,
-- nothing verified yet. 'pending' now means what submitKyc() already
-- requires of it — every mandatory type present.
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

    if v_total = 0                 then return 'not_submitted';
    elsif v_rejected > 0           then return 'rejected';
    elsif v_verified >= v_required then return 'verified';
    elsif v_verified > 0           then return 'partially_verified';
    elsif v_total >= v_required    then return 'pending';
    else                                 return 'incomplete';
    end if;
end $$;

-- Recompute every rider's stored kyc_status with the corrected function —
-- same pattern as 20260908120000_fix_kyc_rejected_filter.sql.
update public.rider_profiles
   set kyc_status = public.compute_kyc_status(user_id),
       updated_at = now()
 where kyc_status is distinct from public.compute_kyc_status(user_id);

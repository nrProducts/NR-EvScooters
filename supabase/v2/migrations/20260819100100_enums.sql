-- =========================================================================
-- 02 — Enums (53 types)
--
-- One word per concept. The old schema had 52 enums with near-synonyms
-- (refund_status.success / booking_refund_status.processed /
-- payment_status.succeeded all meant "it worked"). Here: `succeeded` for
-- success everywhere, `cancelled` for cancellation, `voided` for financial
-- reversal. Labels are always snake_case.
-- =========================================================================

-- --- identity ------------------------------------------------------------
create type public.user_role            as enum ('rider', 'staff', 'admin');
create type public.user_status          as enum ('active', 'inactive', 'suspended');
create type public.address_type         as enum ('home', 'billing', 'proof_of_address');
create type public.related_person_role  as enum ('nominee', 'emergency_contact');
create type public.device_platform      as enum ('ios', 'android');
create type public.kyc_status           as enum ('not_submitted', 'pending', 'partially_verified', 'verified', 'rejected');
create type public.kyc_document_type    as enum ('aadhaar', 'driving_licence', 'passport', 'voter_id', 'address_proof');
create type public.verification_status  as enum ('pending', 'verified', 'rejected');

-- --- fleet ---------------------------------------------------------------
create type public.vehicle_category       as enum ('scooter', 'bike', 'moped');
create type public.vehicle_status         as enum ('available', 'reserved', 'assigned', 'maintenance', 'retired');
create type public.vehicle_document_type  as enum ('registration', 'insurance', 'puc', 'fitness', 'permit');
create type public.swap_station_status    as enum ('working', 'not_working', 'maintenance');
create type public.maintenance_type       as enum ('corrective', 'preventive');
create type public.maintenance_status     as enum ('reported', 'triaged', 'in_progress', 'resolved', 'cancelled');
create type public.maintenance_outcome    as enum ('quick_fix', 'temp_vehicle', 'replacement', 'not_repairable');

-- --- commercial ----------------------------------------------------------
create type public.billing_period       as enum ('daily', 'weekly', 'monthly');
create type public.booking_status       as enum ('pending_payment', 'confirmed', 'cancelled', 'expired', 'fulfilled');
create type public.subscription_status  as enum ('active', 'paused', 'past_due', 'ended', 'cancelled');
create type public.period_status        as enum ('scheduled', 'current', 'closed');
create type public.pause_reason         as enum ('vehicle_breakdown', 'rider_request', 'admin');
create type public.rental_status        as enum ('active', 'completed', 'force_ended');
create type public.assignment_reason    as enum ('initial', 'temp_swap', 'replacement');
create type public.return_status        as enum ('requested', 'inspected', 'approved', 'rejected');
create type public.settlement_outcome   as enum ('refund_due', 'amount_due', 'balanced');

-- --- billing -------------------------------------------------------------
create type public.invoice_status        as enum ('draft', 'issued', 'void');
create type public.invoice_purpose       as enum ('initial', 'subscription_period', 'settlement', 'adhoc');
create type public.invoice_item_type     as enum ('plan_fee', 'adjustment', 'deposit');
create type public.pricing_rule_kind     as enum ('charge', 'discount');
create type public.amount_type           as enum ('fixed', 'percentage');
create type public.rule_frequency        as enum ('one_time', 'every_period', 'every_n_periods', 'first_n_periods', 'per_day');
create type public.rule_scope            as enum ('global', 'plan', 'vehicle_model', 'vehicle', 'subscription');
create type public.adjustment_status     as enum ('pending', 'invoiced', 'settled', 'voided');
create type public.payment_order_status  as enum ('created', 'attempted', 'paid', 'failed', 'expired');
create type public.payment_status        as enum ('pending', 'processing', 'succeeded', 'failed');
create type public.payment_method        as enum ('card', 'wallet', 'upi', 'netbanking', 'cash');
create type public.deposit_status        as enum ('pending', 'held', 'released', 'forfeited');
create type public.refund_status         as enum ('pending', 'processing', 'succeeded', 'failed');
create type public.refund_reason         as enum ('deposit_release', 'booking_cancellation', 'settlement', 'goodwill');

-- --- operations ----------------------------------------------------------
create type public.incident_type     as enum ('damage', 'accident', 'theft', 'vandalism', 'breakdown', 'other');
create type public.incident_status   as enum ('open', 'investigating', 'closed');
create type public.damage_status     as enum ('assessed', 'disputed', 'settled', 'waived');
create type public.dispute_outcome   as enum ('upheld', 'rejected', 'partially_upheld');
create type public.support_category  as enum ('booking', 'payment', 'vehicle', 'account', 'other');
create type public.support_priority  as enum ('low', 'medium', 'high', 'urgent');
create type public.support_status    as enum ('open', 'in_progress', 'resolved', 'closed');

-- --- notifications -------------------------------------------------------
create type public.notification_channel  as enum ('push', 'email', 'sms');
create type public.notification_audience as enum ('rider', 'staff', 'both');
create type public.delivery_status       as enum ('pending', 'sent', 'failed');

-- --- compliance ----------------------------------------------------------
create type public.consent_purpose    as enum (
    'kyc_identity_verification', 'service_delivery', 'payments_and_billing',
    'safety_and_incident', 'service_communications', 'marketing_communications',
    'location_services');
create type public.consent_action     as enum ('granted', 'withdrawn');
create type public.dp_request_type    as enum ('access_export', 'correction', 'erasure', 'grievance', 'nominee_update');
create type public.dp_request_status  as enum ('open', 'in_progress', 'awaiting_principal', 'completed', 'rejected', 'withdrawn');
create type public.pii_access_reason  as enum ('kyc_review', 'support_ticket', 'fraud_investigation', 'rights_request', 'legal_request', 'rider_self', 'other');

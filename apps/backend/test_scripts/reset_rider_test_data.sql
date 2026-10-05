-- ============================================================================
-- Reset a rider's test data.
--
-- Force-ends open rentals, cancels active subscriptions, releases held
-- deposits, frees up any still-assigned vehicle, and hard-deletes everything
-- else that's safely deletable (support tickets, maintenance tickets,
-- damages, notifications, subscription pauses/adjustments, rental-vehicle
-- assignment history, return requests, and any unpaid overdue-late-fee
-- invoice from the Overdue Rider → Late Fee Payment → Return gate).
--
-- Left untouched, by design:
--   - Core profile data: users, rider_profiles, user_addresses,
--     user_related_persons, kyc_documents, user_devices.
--   - Anything append-only (a DB trigger blocks DELETE outright, so this
--     script doesn't try): payment_transactions, payment_allocations,
--     audit_logs, consent_records, pii_access_log.
--   - The paid booking/subscription/rental/invoice chain itself — it can't
--     be deleted while a real payment_transaction references it (FK RESTRICT
--     chain), only closed out, which is what the UPDATEs below do.
--
-- Safe to re-run — every UPDATE is guarded by a status check, every DELETE
-- is scoped to this one rider.
-- ============================================================================

DO $$
DECLARE
    v_user_id uuid := '31e79451-55c6-4da1-8f02-0193bb22e490'; -- Kavi
BEGIN
    -- Free up any vehicle still assigned via this rider's open rentals.
    UPDATE vehicles v
    SET status = 'available'
    WHERE v.status = 'assigned'
      AND v.id IN (
          SELECT rva.vehicle_id
          FROM rental_vehicle_assignments rva
          JOIN rentals r ON r.id = rva.rental_id
          WHERE r.user_id = v_user_id AND rva.released_at IS NULL
      );

    -- Force-end any rental still running, and clear any recovery flag so a
    -- fresh test cycle doesn't start already "flagged for recovery".
    UPDATE rentals
    SET status = 'force_ended', returned_at = now(), end_reason = 'test_data_cleanup', recovery_flagged_at = NULL
    WHERE user_id = v_user_id AND (status <> 'force_ended' OR recovery_flagged_at IS NOT NULL);

    -- Cancel any subscription still active/past_due.
    UPDATE subscriptions
    SET status = 'cancelled', ended_at = now()
    WHERE user_id = v_user_id AND status NOT IN ('cancelled', 'ended');

    -- Release any deposit still held.
    UPDATE deposits d
    SET status = 'released', released_at = now()
    FROM subscriptions s
    WHERE d.subscription_id = s.id
      AND s.user_id = v_user_id
      AND d.status NOT IN ('released', 'forfeited');

    -- Hard-delete everything else that's safely deletable.
    DELETE FROM subscription_pauses sp
    USING subscriptions s
    WHERE sp.subscription_id = s.id AND s.user_id = v_user_id;

    DELETE FROM subscription_adjustments sa
    USING subscriptions s
    WHERE sa.subscription_id = s.id AND s.user_id = v_user_id;

    DELETE FROM rental_vehicle_assignments rva
    USING rentals r
    WHERE rva.rental_id = r.id AND r.user_id = v_user_id;

    -- Return requests. Nothing else references rental_returns/rental_feedback
    -- as a parent, so both are plain leaf deletes.
    DELETE FROM rental_returns rr
    USING rentals r
    WHERE rr.rental_id = r.id AND r.user_id = v_user_id;

    DELETE FROM rental_feedback rf
    USING rentals r
    WHERE rf.rental_id = r.id AND r.user_id = v_user_id;

    DELETE FROM support_tickets WHERE user_id = v_user_id;

    DELETE FROM maintenance_tickets WHERE reported_by_user_id = v_user_id;

    DELETE FROM damages WHERE assessed_by_user_id = v_user_id;

    DELETE FROM notification_messages WHERE user_id = v_user_id;

    -- Overdue-late-fee 'adhoc' invoices (Overdue Rider → Late Fee Payment →
    -- Return gate) — only ever safely deletable while UNPAID; a paid one has
    -- a payment_allocations row referencing it, which is append-only and
    -- can't be removed, so it's left as part of the paid financial history
    -- just like everything else that flows through payment_transactions.
    DELETE FROM invoice_items ii
    USING invoices i
    LEFT JOIN v_invoice_balances vb ON vb.invoice_id = i.id
    WHERE ii.invoice_id = i.id
      AND i.user_id = v_user_id
      AND i.purpose = 'adhoc'
      AND COALESCE(vb.is_paid, false) = false;

    DELETE FROM invoices i
    USING (SELECT i2.id FROM invoices i2
           LEFT JOIN v_invoice_balances vb ON vb.invoice_id = i2.id
           WHERE i2.user_id = v_user_id AND i2.purpose = 'adhoc' AND COALESCE(vb.is_paid, false) = false) del
    WHERE i.id = del.id;
END $$;

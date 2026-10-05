import { KycStatus, UserRole, UserStatus } from "../../types";

/**
 * The API's flat view of a user.
 *
 * The table underneath is no longer flat. `public.users` now holds only
 * identity and account state; the address, the emergency contact, the rider's
 * KYC state, the staff member's code and the push token each live in their own
 * child table (`user_addresses`, `user_related_persons`, `rider_profiles`,
 * `staff_profiles`, `user_devices`).
 *
 * This shape is kept flat anyway. Both apps read it, and reshaping the wire
 * format is a frontend rewrite that the database change does not require. The
 * flattening happens in users.service.ts, in one place, on the way out.
 */
export interface UserProfile {
    id: string;
    full_name: string;
    email: string | null;
    phone: string | null;
    date_of_birth: string | null;
    gender: string | null;

    // --- user_addresses, the row marked is_primary ---------------------------
    address_line_1: string | null;
    address_line_2: string | null;
    city: string | null;
    state: string | null;
    postal_code: string | null;
    country: string | null;

    // --- user_related_persons, person_role = 'emergency_contact' -------------
    emergency_contact_name: string | null;
    emergency_contact_phone: string | null;

    /** `users.status`. Was `account_status`. */
    account_status: UserStatus;
    /** `rider_profiles.kyc_status`; `not_submitted` for staff and admin. */
    kyc_status: KycStatus;
    /** `users.photo_storage_path` — a private-bucket path, never a URL. */
    profile_photo_url: string | null;
    /** Derived from `rider_profiles.onboarding_completed_at` being set. */
    profile_completed: boolean;
    /**
     * `users.preferred_language` — 'en' | 'ta' | 'hi', never null (the column
     * is NOT NULL DEFAULT 'en').
     *
     * The only thing the database knows about localisation. Translations live
     * in the mobile app (apps/mobile/src/i18n/copy.*.ts) and nowhere else:
     * there is no translations table and there must not be one, or fixing a
     * typo becomes a data migration and two riders on different app versions
     * can be shown text that does not match their build.
     *
     * Typed as a plain string rather than a union because the API layer is
     * not where the app's supported set is decided — the zod enum in
     * users.validation.ts is what actually constrains writes, alongside the
     * CHECK constraint on the column.
     */
    preferred_language: string;

    created_at: string;
    updated_at: string | null;
    deleted_at: string | null;

    /** `staff_profiles.staff_code`. Null for riders, who have no staff profile. */
    staff_code: string | null;
    /** `staff_profiles.must_change_password`. False for riders. */
    must_change_password: boolean;
    /** `staff_profiles.joined_on`. Null for riders, and for staff hired before this was tracked. */
    joined_on: string | null;
}

export interface UserListItem extends UserProfile {
    /** One value now — `users.role`. Was an array off `user_roles`. */
    role: UserRole;
    assigned_vehicle: {
        id: string;
        vin: string;
        registration_number: string;
        /** `vehicle_models.name`. `vehicles.model` as a text column is gone. */
        model: string;
        /** `vehicles.display_name`, falling back to the model name. */
        name: string;
    } | null;
    current_plan: { id: string; name: string; price: number; billing_cycle: string } | null;
    /**
     * Before pickup this is the booking's own status (pending_payment /
     * confirmed); afterwards it is the subscription's (active / past_due /
     * paused). Null when the rider has no live booking or subscription.
     *
     * `due` was renamed `past_due` with the subscription split — it is the
     * same state, on `subscriptions.status` rather than `bookings.plan_status`.
     */
    payment_status:
        | "pending_payment"
        | "confirmed"
        | "active"
        | "past_due"
        | "paused"
        | null;
    /** `subscriptions.started_on`. Null before pickup or with no subscription. */
    plan_started_at: string | null;
    /**
     * `v_subscription_current_period.due_on` — the LAST usable day of the
     * current billing period, and the next renewal date. Null with no live
     * subscription. A value <= today means the rider is due today or overdue,
     * whether or not the overdue sweep has flipped the status yet.
     */
    next_due_at: string | null;
    /**
     * Sum of every unpaid, non-void invoice balance for this rider — the real
     * money owed RIGHT NOW, from `v_invoice_balances`, not inferred from a
     * plan's due date. 0 once every bill (including any return settlement) is
     * paid, even while a completed rental's records still exist.
     */
    outstanding_amount: number;
    /**
     * The rider's OPEN return, if they have asked to hand the scooter back and
     * staff have not finished it.
     *
     * Needed because `payment_status` cannot answer this and never could:
     * requestReturn deliberately leaves both the rental and the subscription
     * ACTIVE until the handover is confirmed (ending them early would release
     * the vehicle assignment and put a scooter the rider still physically
     * holds back into the bookable pool). So the Users grid read `active` off
     * `subscriptions.status` and showed a rider mid-return as an ordinary
     * paying customer — the plan looked live, the renewal date looked real,
     * and nothing on the row said a return was waiting on staff.
     *
     * `bookings` already merges this into its own status column (see
     * BookingListPage's four-stage Booked -> Active -> Return Requested ->
     * Completed); this is the same fact, on the rider.
     *
     * Deliberately the raw `rental_returns.status` rather than the full
     * ReturnStage: computeReturnStage costs a deposit lookup, a damage lookup
     * and an invoice-paid check PER RENTAL, which is fine for one return
     * detail page and far too much for every row of a paginated user list.
     * The Returns screens remain the place for the detailed stage.
     */
    open_return: {
        /** 'requested' = awaiting staff review; 'inspected' = reviewed, settling. */
        status: "requested" | "inspected";
        requested_at: string | null;
    } | null;
}

export interface UserDetail extends UserListItem {
    /**
     * Last successful sign-in, read from Supabase Auth rather than a column.
     *
     * There is no `users.last_login_at` in the new schema, and adding one
     * would mean writing to the users table on every session resolution to
     * duplicate a value `auth.users.last_sign_in_at` already keeps accurately.
     * It costs one admin lookup, so it is on the detail response only — the
     * list would need one per row.
     */
    last_login_at: string | null;
    kyc_completion_percent: number;
    documents: Array<{
        id: string;
        doc_type: string;
        doc_number_masked: string | null;
        verification_status: string;
        rejection_reason: string | null;
        expires_on: string | null;
        submitted_at: string | null;
        verified_at: string | null;
    }>;
}

export interface ListUsersFilters {
    page: number;
    pageSize: number;
    search?: string;
    accountStatus?: UserStatus;
    kycStatus?: KycStatus;
    role?: UserRole;
    /** Any staff-side role. Mutually exclusive with `role`, which wins. */
    staffOnly?: boolean;
    sortBy: "full_name" | "created_at" | "kyc_status";
    sortDir: "asc" | "desc";
    includeDeleted: boolean;
    /** Exclude riders who already have an active booking or rental. */
    bookable?: boolean;
    /** Only self-registered accounts still awaiting an admin's approve/reject. */
    pendingApproval?: boolean;
}

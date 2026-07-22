import type {
    AccountStatus, ApiDocument, ApiStation, ApiUser, ApiVehicleModel, ApiVehicleModelDetail,
    KycDocType, KycStatus, RoleName, VerificationStatus,
} from '../../types/api';

/**
 * Rows shaped like the database, not like the API responses — the mock
 * repositories project these into API shapes exactly as the backend does.
 */
export interface MockUserRow {
    id: string;
    full_name: string;
    email: string | null;
    phone: string | null;
    date_of_birth: string | null;
    gender: string | null;
    address_line_1: string | null;
    address_line_2: string | null;
    city: string | null;
    state: string | null;
    postal_code: string | null;
    country: string | null;
    emergency_contact_name: string | null;
    emergency_contact_phone: string | null;
    account_status: AccountStatus;
    profile_photo_url: string | null;
    /** Has the rider completed the initial onboarding profile form (spec Step 1)? */
    profile_completed: boolean;
    created_at: string;
    updated_at: string;
    deleted_at: string | null;
    roles: RoleName[];
    assigned_vehicle: ApiUser['assigned_vehicle'];
    current_plan: ApiUser['current_plan'];
}

export interface MockDocumentRow {
    id: string;
    user_id: string;
    doc_type: KycDocType;
    doc_number: string;
    /** Local file URI in mock mode; a storage path in the real system. */
    front_uri: string | null;
    back_uri: string | null;
    verification_status: VerificationStatus;
    rejection_reason: string | null;
    verified_by: string | null;
    verified_at: string | null;
    expiry_date: string | null;
    submitted_at: string | null;
    created_at: string;
    updated_at: string;
}

export interface MockAuditRow {
    id: string;
    action: string;
    actor_id: string | null;
    target_user_id: string | null;
    created_at: string;
    after_data: Record<string, unknown> | null;
}

const daysFromNow = (days: number): string => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
};

const monthsAgo = (months: number): string => {
    const d = new Date();
    d.setMonth(d.getMonth() - months);
    return d.toISOString();
};

// A placeholder that renders in <Image> without any network access, so
// document previews work offline. 1x1 grey PNG.
export const PLACEHOLDER_IMAGE =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const base = {
    address_line_2: null,
    country: 'IN',
    profile_photo_url: null,
    emergency_contact_name: null,
    emergency_contact_phone: null,
    // All seeded riders are pre-existing accounts that already onboarded.
    profile_completed: true,
};

/**
 * Seeded to cover every state the UI branches on: each KYC status, each
 * account status, a soft-deleted account, an expired licence, a rider with no
 * documents, and a second admin so the last-admin guard can be exercised.
 */
export const SEED_USERS: MockUserRow[] = [
    {
        ...base,
        id: 'u-admin-001',
        full_name: 'Priya Nair',
        email: 'admin@fleet.com',
        phone: '+919876500001',
        date_of_birth: '1988-03-14',
        gender: 'female',
        address_line_1: '12 Marine Drive',
        city: 'Kochi',
        state: 'Kerala',
        postal_code: '682031',
        account_status: 'active',
        created_at: monthsAgo(26),
        updated_at: monthsAgo(1),
        deleted_at: null,
        roles: ['admin'],
        assigned_vehicle: null,
        current_plan: null,
    },
    {
        ...base,
        id: 'u-admin-002',
        full_name: 'Vikram Rao',
        email: 'vikram.rao@fleet.com',
        phone: '+919876500002',
        date_of_birth: '1985-11-02',
        gender: 'male',
        address_line_1: '4 Residency Road',
        city: 'Bengaluru',
        state: 'Karnataka',
        postal_code: '560025',
        account_status: 'active',
        created_at: monthsAgo(24),
        updated_at: monthsAgo(3),
        deleted_at: null,
        roles: ['admin'],
        assigned_vehicle: null,
        current_plan: null,
    },
    {
        ...base,
        id: 'u-staff-001',
        full_name: 'Meera Joseph',
        email: 'staff@fleet.com',
        phone: '+919876500003',
        date_of_birth: '1993-06-21',
        gender: 'female',
        address_line_1: '88 MG Road',
        city: 'Kochi',
        state: 'Kerala',
        postal_code: '682016',
        account_status: 'active',
        created_at: monthsAgo(14),
        updated_at: monthsAgo(2),
        deleted_at: null,
        roles: ['staff'],
        assigned_vehicle: null,
        current_plan: null,
    },
    {
        ...base,
        id: 'u-rider-001',
        full_name: 'Asha Menon',
        email: 'rider@fleet.com',
        phone: '+919876500010',
        date_of_birth: '1996-04-12',
        gender: 'female',
        address_line_1: '23 Panampilly Nagar',
        city: 'Kochi',
        state: 'Kerala',
        postal_code: '682036',
        account_status: 'active',
        created_at: monthsAgo(9),
        updated_at: monthsAgo(1),
        deleted_at: null,
        roles: ['rider'],
        assigned_vehicle: { id: 'v-001', vin: 'NRV000123456789', model: 'NR One' },
        current_plan: { id: 'p-monthly', name: 'Commuter Monthly', status: 'active' },
    },
    {
        ...base,
        id: 'u-rider-002',
        full_name: 'Rahul Krishnan',
        email: 'rahul.k@example.com',
        phone: '+919876500011',
        date_of_birth: '1999-09-30',
        gender: 'male',
        address_line_1: '5 Kadavanthra',
        city: 'Kochi',
        state: 'Kerala',
        postal_code: '682020',
        account_status: 'active',
        created_at: monthsAgo(4),
        updated_at: monthsAgo(1),
        deleted_at: null,
        roles: ['rider'],
        assigned_vehicle: null,
        current_plan: { id: 'p-weekly', name: 'Weekly Saver', status: 'active' },
    },
    {
        ...base,
        id: 'u-rider-003',
        full_name: 'Fatima Sheikh',
        email: 'fatima.s@example.com',
        phone: '+919876500012',
        date_of_birth: '1994-01-08',
        gender: 'female',
        address_line_1: '19 Edappally',
        city: 'Kochi',
        state: 'Kerala',
        postal_code: '682024',
        account_status: 'active',
        created_at: monthsAgo(3),
        updated_at: monthsAgo(1),
        deleted_at: null,
        roles: ['rider'],
        assigned_vehicle: null,
        current_plan: null,
    },
    {
        ...base,
        id: 'u-rider-004',
        full_name: 'Deepak Varma',
        email: 'deepak.v@example.com',
        phone: '+919876500013',
        date_of_birth: '1991-07-19',
        gender: 'male',
        address_line_1: '77 Vyttila',
        city: 'Kochi',
        state: 'Kerala',
        postal_code: '682019',
        account_status: 'suspended',
        created_at: monthsAgo(11),
        updated_at: monthsAgo(1),
        deleted_at: null,
        roles: ['rider'],
        assigned_vehicle: null,
        current_plan: null,
    },
    {
        ...base,
        id: 'u-rider-005',
        full_name: 'Sneha Pillai',
        email: 'sneha.p@example.com',
        phone: '+919876500014',
        date_of_birth: '2000-12-05',
        gender: 'female',
        address_line_1: '3 Aluva',
        city: 'Kochi',
        state: 'Kerala',
        postal_code: '683101',
        account_status: 'inactive',
        created_at: monthsAgo(7),
        updated_at: monthsAgo(2),
        deleted_at: null,
        roles: ['rider'],
        assigned_vehicle: null,
        current_plan: null,
    },
    {
        ...base,
        id: 'u-rider-006',
        full_name: 'Arjun Thomas',
        email: 'arjun.t@example.com',
        phone: '+919876500015',
        date_of_birth: '1997-02-28',
        gender: 'male',
        address_line_1: '41 Fort Kochi',
        city: 'Kochi',
        state: 'Kerala',
        postal_code: '682001',
        account_status: 'active',
        created_at: monthsAgo(6),
        updated_at: monthsAgo(1),
        deleted_at: null,
        roles: ['rider'],
        assigned_vehicle: { id: 'v-004', vin: 'NRV000987654321', model: 'NR Cargo' },
        current_plan: { id: 'p-monthly', name: 'Commuter Monthly', status: 'active' },
    },
    {
        ...base,
        id: 'u-rider-007',
        full_name: 'Lakshmi Iyer',
        email: 'lakshmi.i@example.com',
        phone: '+919876500016',
        date_of_birth: '1992-05-16',
        gender: 'female',
        address_line_1: '9 Tripunithura',
        city: 'Kochi',
        state: 'Kerala',
        postal_code: '682301',
        account_status: 'inactive',
        created_at: monthsAgo(18),
        updated_at: monthsAgo(5),
        // Soft-deleted: only visible to an admin with "Show deleted" on.
        deleted_at: monthsAgo(5),
        roles: ['rider'],
        assigned_vehicle: null,
        current_plan: null,
    },
];

export const SEED_DOCUMENTS: MockDocumentRow[] = [
    // Asha — fully verified, can rent.
    {
        id: 'd-001', user_id: 'u-rider-001', doc_type: 'aadhaar',
        doc_number: 'ABCD12345678', front_uri: PLACEHOLDER_IMAGE, back_uri: PLACEHOLDER_IMAGE,
        verification_status: 'verified', rejection_reason: null,
        verified_by: 'u-staff-001', verified_at: monthsAgo(8),
        expiry_date: null, submitted_at: monthsAgo(9),
        created_at: monthsAgo(9), updated_at: monthsAgo(8),
    },
    {
        id: 'd-002', user_id: 'u-rider-001', doc_type: 'driving_license',
        doc_number: 'KL0120110012345', front_uri: PLACEHOLDER_IMAGE, back_uri: null,
        verification_status: 'verified', rejection_reason: null,
        verified_by: 'u-staff-001', verified_at: monthsAgo(8),
        expiry_date: daysFromNow(900), submitted_at: monthsAgo(9),
        created_at: monthsAgo(9), updated_at: monthsAgo(8),
    },
    // Rahul — both pending: the queue's happy path.
    {
        id: 'd-003', user_id: 'u-rider-002', doc_type: 'aadhaar',
        doc_number: 'EFGH87654321', front_uri: PLACEHOLDER_IMAGE, back_uri: PLACEHOLDER_IMAGE,
        verification_status: 'pending', rejection_reason: null,
        verified_by: null, verified_at: null,
        expiry_date: null, submitted_at: monthsAgo(1),
        created_at: monthsAgo(1), updated_at: monthsAgo(1),
    },
    {
        id: 'd-004', user_id: 'u-rider-002', doc_type: 'driving_license',
        doc_number: 'KL0720190067890', front_uri: PLACEHOLDER_IMAGE, back_uri: null,
        verification_status: 'pending', rejection_reason: null,
        verified_by: null, verified_at: null,
        expiry_date: daysFromNow(400), submitted_at: monthsAgo(1),
        created_at: monthsAgo(1), updated_at: monthsAgo(1),
    },
    // Fatima — one verified, one pending: partially_verified.
    {
        id: 'd-005', user_id: 'u-rider-003', doc_type: 'aadhaar',
        doc_number: 'IJKL11223344', front_uri: PLACEHOLDER_IMAGE, back_uri: null,
        verification_status: 'verified', rejection_reason: null,
        verified_by: 'u-staff-001', verified_at: monthsAgo(2),
        expiry_date: null, submitted_at: monthsAgo(3),
        created_at: monthsAgo(3), updated_at: monthsAgo(2),
    },
    {
        id: 'd-006', user_id: 'u-rider-003', doc_type: 'driving_license',
        doc_number: 'KL1120200011223', front_uri: PLACEHOLDER_IMAGE, back_uri: null,
        verification_status: 'pending', rejection_reason: null,
        verified_by: null, verified_at: null,
        expiry_date: daysFromNow(600), submitted_at: monthsAgo(1),
        created_at: monthsAgo(1), updated_at: monthsAgo(1),
    },
    // Deepak — rejected, so the resubmit path has something to fix.
    {
        id: 'd-007', user_id: 'u-rider-004', doc_type: 'aadhaar',
        doc_number: 'MNOP55667788', front_uri: PLACEHOLDER_IMAGE, back_uri: null,
        verification_status: 'rejected',
        rejection_reason: 'The photo is too blurred to read the ID number. Please retake it in good light.',
        verified_by: 'u-staff-001', verified_at: monthsAgo(2),
        expiry_date: null, submitted_at: monthsAgo(3),
        created_at: monthsAgo(3), updated_at: monthsAgo(2),
    },
    // Arjun — verified ID but an EXPIRED licence: drops him out of 'verified'.
    {
        id: 'd-008', user_id: 'u-rider-006', doc_type: 'aadhaar',
        doc_number: 'QRST99887766', front_uri: PLACEHOLDER_IMAGE, back_uri: null,
        verification_status: 'verified', rejection_reason: null,
        verified_by: 'u-admin-001', verified_at: monthsAgo(5),
        expiry_date: null, submitted_at: monthsAgo(6),
        created_at: monthsAgo(6), updated_at: monthsAgo(5),
    },
    {
        id: 'd-009', user_id: 'u-rider-006', doc_type: 'driving_license',
        doc_number: 'KL0520150054321', front_uri: PLACEHOLDER_IMAGE, back_uri: null,
        verification_status: 'verified', rejection_reason: null,
        verified_by: 'u-admin-001', verified_at: monthsAgo(5),
        expiry_date: daysFromNow(-30), submitted_at: monthsAgo(6),
        created_at: monthsAgo(6), updated_at: monthsAgo(5),
    },
];

export const SEED_AUDIT: MockAuditRow[] = [
    {
        id: 'a-001', action: 'kyc.submitted', actor_id: 'u-rider-002',
        target_user_id: 'u-rider-002', created_at: monthsAgo(1),
        after_data: { document_count: 2 },
    },
    {
        id: 'a-002', action: 'kyc.document_rejected', actor_id: 'u-staff-001',
        target_user_id: 'u-rider-004', created_at: monthsAgo(2),
        after_data: { reason: 'The photo is too blurred to read the ID number.' },
    },
    {
        id: 'a-003', action: 'kyc.document_verified', actor_id: 'u-staff-001',
        target_user_id: 'u-rider-003', created_at: monthsAgo(2),
        after_data: { doc_type: 'aadhaar' },
    },
];

/** Demo accounts surfaced as one-tap buttons on the login screen. */
export const DEMO_ACCOUNTS: { email: string; label: string; hint: string }[] = [
    { email: 'admin@fleet.com', label: 'Admin', hint: 'Full access — users, KYC review, fleet' },
    { email: 'staff@fleet.com', label: 'Staff', hint: 'Review KYC, manage riders' },
    { email: 'rider@fleet.com', label: 'Rider', hint: 'Verified rider with a scooter' },
];

export const KYC_STATUS_ORDER: KycStatus[] = [
    'not_submitted', 'pending', 'partially_verified', 'verified', 'rejected',
];

export type { ApiDocument };

// ---------------------------------------------------------------------------
// Vehicle catalog — kept in sync conceptually with
// supabase/migrations/20260721090200_vehicle_catalog_seed.sql. Original copy,
// no third-party branding.
// ---------------------------------------------------------------------------

const NR_VOLT_VENDOR = {
    id: 'vendor-nr-mobility',
    name: 'NR Mobility Partners',
    description: 'Our exclusive EV scooter fleet partner, supplying vehicles for the NR rider network.',
    logo_url: null,
};

const NR_VOLT_X1_DETAIL: ApiVehicleModelDetail = {
    id: 'model-nr-volt-x1',
    name: 'NR Volt X1',
    category: 'scooter',
    tagline: 'Ride further, charge faster',
    description:
        'The NR Volt X1 is our flagship electric scooter, built for daily commuting and weekend rides ' +
        'alike. A removable battery pack means you can charge indoors, swap at a station, or top up at ' +
        'home — whatever fits your day.',
    battery_range_km: 151,
    top_speed_kmph: 90,
    charging_time_hours: 3.5,
    motor_power_watts: 3900,
    battery_capacity: '3.24 kWh removable battery',
    features: [
        'Removable battery pack', 'Reverse assist mode', 'Anti-theft alarm',
        'Companion mobile app', 'Keyless ignition',
    ],
    safety_features: [
        'Regenerative braking', 'Combi braking system (CBS)', 'IP67 water resistance',
        'LED daytime running lights',
    ],
    is_featured: true,
    vendor: NR_VOLT_VENDOR,
    hero_image_url: 'https://placehold.co/1200x800/0f172a/ffffff?text=NR+Volt+X1',
    starting_price: 149,
    images: [
        { id: 'img-1', url: 'https://placehold.co/1200x800/0f172a/ffffff?text=NR+Volt+X1+Hero', alt_text: 'NR Volt X1 hero shot, three-quarter front view', is_hero: true, sort_order: 0 },
        { id: 'img-2', url: 'https://placehold.co/1200x800/1e293b/ffffff?text=NR+Volt+X1+Side', alt_text: 'NR Volt X1 side profile', is_hero: false, sort_order: 1 },
        { id: 'img-3', url: 'https://placehold.co/1200x800/1e293b/ffffff?text=NR+Volt+X1+Console', alt_text: 'NR Volt X1 handlebar console close-up', is_hero: false, sort_order: 2 },
        { id: 'img-4', url: 'https://placehold.co/1200x800/1e293b/ffffff?text=NR+Volt+X1+Battery', alt_text: 'NR Volt X1 removable battery pack', is_hero: false, sort_order: 3 },
    ],
    plans: [
        { id: 'plan-daily', name: 'NR Volt X1 — Daily', billing_cycle: 'daily', price: 149, included_minutes: 120 },
        { id: 'plan-weekly', name: 'NR Volt X1 — Weekly', billing_cycle: 'weekly', price: 799, included_minutes: 900 },
        { id: 'plan-monthly', name: 'NR Volt X1 — Monthly', billing_cycle: 'monthly', price: 2499, included_minutes: 4000 },
        { id: 'plan-yearly', name: 'NR Volt X1 — Yearly', billing_cycle: 'yearly', price: 24999, included_minutes: null },
    ],
    availability: { available_count: 4, status: 'available' },
};

export const SEED_VEHICLE_MODELS_DETAIL: ApiVehicleModelDetail[] = [NR_VOLT_X1_DETAIL];

export const SEED_VEHICLE_MODELS: ApiVehicleModel[] = SEED_VEHICLE_MODELS_DETAIL.map((m) => ({
    id: m.id,
    name: m.name,
    category: m.category,
    tagline: m.tagline,
    battery_range_km: m.battery_range_km,
    top_speed_kmph: m.top_speed_kmph,
    charging_time_hours: m.charging_time_hours,
    is_featured: m.is_featured,
    vendor: m.vendor,
    hero_image_url: m.hero_image_url,
    starting_price: m.starting_price,
}));

// ---------------------------------------------------------------------------
// Bookings — pickup station, kept in sync conceptually with
// supabase/migrations/20260721100200_bookings_seed.sql (same "MG Road Hub"
// station in Kochi). Mock mode has no PostGIS, so lat/lng are plain numbers.
// ---------------------------------------------------------------------------

export const SEED_STATIONS: ApiStation[] = [
    { id: 'station-mg-road-hub', name: 'MG Road Hub', code: 'STN-MGR', lat: 9.9312, lng: 76.2673 },
];

import { supabaseAdmin } from "../../config/supabase";
import { env } from "../../config/env";
import { businessRule } from "../../common/AppError";
import { removeExportObjects } from "./privacy.export";

/**
 * Personal-data columns on `users` that erasure must clear.
 *
 * Much shorter than it was, because most of what it listed is no longer a
 * column. The address, the emergency contact and the nominee moved to
 * `user_addresses` and `user_related_persons`, and the push token to
 * `user_devices` — so erasing them is deleting ROWS, which is what
 * ERASED_CHILD_TABLES below covers. `referral_code` has no successor at all.
 *
 * This list is duplicated from public.anonymise_user() on purpose. The SQL
 * function is what actually runs; this constant exists so
 * privacy.erasure.test.ts can assert that every personal column the API reads
 * appears here. A future `ALTER TABLE users ADD COLUMN` then fails the suite
 * until someone decides that column's erasure fate — which is exactly the
 * decision that otherwise gets forgotten.
 */
export const ERASED_USER_COLUMNS = [
    "full_name",
    "phone",
    "email",
    "date_of_birth",
    "gender",
    "photo_storage_path",
] as const;

/**
 * Child tables erasure must EMPTY for the user, and what each holds.
 *
 * The decomposition turned a row of nulls into a set of deletes, and that is
 * the stronger outcome: a nulled `nominee_full_name` still said a nominee had
 * once been named, where a deleted `user_related_persons` row says nothing.
 *
 * `user_related_persons` matters most. A nominee and an emergency contact are
 * THIRD PARTIES who never dealt with us directly — their data is here only
 * because the rider supplied it, so the rider's erasure has to take it with
 * them.
 */
export const ERASED_CHILD_TABLES: Readonly<Record<string, string>> = {
    user_addresses: "The rider's postal address",
    user_related_persons: "The nominee and emergency contact — third parties' data",
    user_devices: "Push tokens, which identify a physical handset",
};

/**
 * Tables erasure must NOT touch, and why.
 *
 * Asserted by the test suite so nobody quietly adds a delete for one of them
 * while "making erasure more thorough".
 */
export const RETAINED_TABLES: Readonly<Record<string, string>> = {
    invoices: "Statutory financial record",
    payment_orders: "Statutory financial record",
    payment_transactions: "Statutory financial record",
    deposits: "Statutory financial record",
    refunds: "Statutory financial record",
    damages: "Financial dispute evidence",
    bookings: "Statutory financial record",
    rentals: "Statutory financial record",
    subscriptions: "Statutory financial record",
    audit_logs: "Accountability record required by the Act itself",
    pii_access_log: "Accountability record required by the Act itself",
    consent_records: "Evidence of the lawful basis for past processing",
};

interface StoragePaths {
    kyc: string[];
    photos: string[];
    exports: string[];
}

/**
 * Gathers every object belonging to this rider BEFORE the database rows that
 * point at them are destroyed. Getting this order wrong orphans the bytes
 * permanently — the paths would be gone and the objects would remain, which
 * is the exact opposite of what an erasure request asked for.
 */
async function gatherStoragePaths(userId: string): Promise<StoragePaths> {
    const [{ data: docs, error: docsError }, { data: user, error: userError }] = await Promise.all([
        supabaseAdmin
            .from("kyc_documents")
            .select("front_storage_path, back_storage_path")
            .eq("user_id", userId),
        supabaseAdmin.from("users").select("photo_storage_path").eq("id", userId).maybeSingle(),
    ]);
    if (docsError) throw docsError;
    if (userError) throw userError;

    const kyc = (docs ?? []).flatMap((d) =>
        [d.front_storage_path, d.back_storage_path].filter((p): p is string => !!p),
    );

    const photo = (user as { photo_storage_path: string | null } | null)?.photo_storage_path;

    // Anything previously generated for an access request is itself a
    // complete copy of the rider's data and must go with the rest.
    const { data: exports } = await supabaseAdmin
        .from("data_principal_requests")
        .select("export_storage_path")
        .eq("user_id", userId)
        .not("export_storage_path", "is", null);

    return {
        kyc,
        photos: photo ? [photo] : [],
        exports: (exports ?? [])
            .map((r) => (r as { export_storage_path: string | null }).export_storage_path)
            .filter((p): p is string => !!p),
    };
}

/**
 * Refuses to erase an account that still has live obligations.
 *
 * Not obstruction: a rider mid-rental who erases their identity leaves a
 * scooter assigned to a tombstone and an unpaid balance nobody can chase.
 * The rider is told exactly what to finish first.
 */
export async function assertErasable(userId: string): Promise<void> {
    const { data: rentals, error: rentalError } = await supabaseAdmin
        .from("rentals")
        .select("id")
        .eq("user_id", userId)
        .eq("status", "active")
        .limit(1);
    if (rentalError) throw rentalError;
    if (rentals && rentals.length > 0) {
        throw businessRule(
            "This account still has a scooter out on rental. It must be returned before " +
            "the account can be erased.",
        );
    }

    const { data: invoices, error: invoiceError } = await supabaseAdmin
        .from("invoices")
        .select("id")
        .eq("user_id", userId)
        // invoice_status is draft/issued/void — payment state lives on the
        // payment rows now, not on the invoice, so there is no 'paid' or
        // 'overdue' here. Outstanding means issued and not settled; a draft is
        // not yet a demand and a void invoice was withdrawn. Whether an issued
        // invoice has actually been paid is v_invoice_balances' answer, which
        // is the next thing this check should consult.
        .in("status", ["issued"])
        .limit(1);
    if (invoiceError) throw invoiceError;
    if (invoices && invoices.length > 0) {
        throw businessRule(
            "This account has an unpaid balance. It must be settled before the account " +
            "can be erased.",
        );
    }
}

/**
 * Executes an erasure.
 *
 * Order is load-bearing:
 *   1. gather storage paths (the rows that name them are about to go)
 *   2. anonymise_user() — one transactional SQL function, so the field list
 *      cannot drift between here and the retention job
 *   3. remove the storage objects
 *   4. scrub the Supabase Auth identity and revoke every session
 *
 * Steps 3 and 4 are best-effort and logged rather than thrown: the personal
 * data in the database is already gone by then, and failing the request would
 * leave the caller believing nothing happened when most of it did. What
 * remains is surfaced loudly for a human to finish.
 */
export async function eraseUser(userId: string, requestId: string | null): Promise<{
    storage_removed: number;
    auth_scrubbed: boolean;
}> {
    const paths = await gatherStoragePaths(userId);

    const { error: rpcError } = await supabaseAdmin.rpc("anonymise_user", {
        p_user_id: userId,
        // The SQL parameter is a plain `uuid` and accepts null — the retention
        // sweep erases without a request behind it. The generated Args type
        // has no way to express that, hence the cast.
        p_request_id: requestId as string,
    });
    if (rpcError) throw rpcError;

    let removed = 0;
    removed += await removeFrom(env.kycBucket, paths.kyc);
    removed += await removeFrom(env.profilePhotoBucket, paths.photos);
    await removeExportObjects(paths.exports);
    removed += paths.exports.length;

    // vehicle-photos and damage-photos are NOT removed: they are evidence of
    // a vehicle's condition tied to a financial dispute, not rider identity.
    // The privacy notice says so explicitly.

    const authScrubbed = await scrubAuthIdentity(userId);

    return { storage_removed: removed, auth_scrubbed: authScrubbed };
}

async function removeFrom(bucket: string, paths: string[]): Promise<number> {
    if (paths.length === 0) return 0;
    const { error } = await supabaseAdmin.storage.from(bucket).remove(paths);
    if (error) {
        // Count only, never the paths — they embed the user id and document type.
        console.error("[privacy.erasure] storage objects survived the erasure", {
            bucket,
            count: paths.length,
            error: error.message,
        });
        return 0;
    }
    return paths.length;
}

/**
 * Removes the identity from Supabase Auth itself.
 *
 * auth.users holds the phone and email independently of public.users, so
 * anonymising the profile alone would leave the rider's phone number sitting
 * in the auth schema — which is where an OTP login reads it from.
 *
 * The email is replaced with a synthetic unroutable address rather than
 * nulled: Supabase requires an account to retain at least one identifier, and
 * deleting the auth user would cascade to public.users, which the financial
 * foreign keys forbid.
 */
async function scrubAuthIdentity(userId: string): Promise<boolean> {
    try {
        const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
            email: `erased+${userId}@invalid.local`,
            phone: "",
            user_metadata: {},
            app_metadata: {},
        });
        if (error) throw new Error(error.message);

        // Revoke every refresh token so the token in the rider's pocket stops
        // working now, not whenever it happens to expire.
        const { error: signOutError } = await supabaseAdmin.auth.admin.signOut(userId, "global");
        if (signOutError) throw new Error(signOutError.message);

        return true;
    } catch (err) {
        // Loud, and reported back to the caller, so ops can finish by hand.
        // Not thrown: the database erasure has already happened.
        console.error("[privacy.erasure] MANUAL ACTION REQUIRED — auth identity not scrubbed", {
            userId,
            error: (err as Error)?.message ?? "unknown",
        });
        return false;
    }
}

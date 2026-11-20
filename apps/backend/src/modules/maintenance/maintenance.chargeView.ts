import { supabaseAdmin } from "../../config/supabase";
import type { MaintenanceDamageCharge, MaintenanceDamageItem } from "./maintenance.types";

/**
 * Turns a ticket's stored damage columns into what the admin console shows:
 * the damaged parts, and the bill with its LIVE payment state.
 *
 * A separate file (not maintenance.service.ts) because vehicles.service.ts
 * reads the same thing for the vehicle's history, and maintenance.service
 * already imports vehicles.service — this keeps that from becoming a cycle.
 */

/** The ticket columns this reads. Selecting them is the caller's job. */
export interface RawChargeColumns {
    id: string;
    damage_items: unknown;
    charge_gst_rate: number | string | null;
    charge_subtotal: number | string | null;
    charge_gst_amount: number | string | null;
    charge_total: number | string | null;
    charge_invoice_id: string | null;
    charge_billed: boolean;
    charge_paid_via: string | null;
}

/** The select fragment that goes with RawChargeColumns. */
export const CHARGE_COLUMNS =
    "damage_items, charge_gst_rate, charge_subtotal, charge_gst_amount, charge_total, charge_invoice_id, charge_billed, charge_paid_via";

export interface DamageView {
    damage_items: MaintenanceDamageItem[];
    damage_charge: MaintenanceDamageCharge | null;
}

export const NO_DAMAGE: DamageView = { damage_items: [], damage_charge: null };

type InvoiceState = NonNullable<MaintenanceDamageCharge["invoice"]>;

function parseItems(raw: unknown): MaintenanceDamageItem[] {
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((entry) => {
        if (!entry || typeof entry !== "object") return [];
        const e = entry as { part?: unknown; notes?: unknown; amount?: unknown };
        if (typeof e.part !== "string") return [];
        return [{
            part: e.part,
            notes: typeof e.notes === "string" && e.notes ? e.notes : null,
            amount: Number(e.amount ?? 0),
        }];
    });
}

/** Paid-ness is derived from allocated money (v_invoice_balances), never stored. */
async function invoiceStates(invoiceIds: string[]): Promise<Map<string, InvoiceState>> {
    const result = new Map<string, InvoiceState>();
    if (invoiceIds.length === 0) return result;

    const [invoicesRes, balancesRes] = await Promise.all([
        supabaseAdmin
            .from("invoices")
            .select("id, invoice_number, payment_allocations(allocated_at, payment_transactions(method))")
            .in("id", invoiceIds),
        supabaseAdmin
            .from("v_invoice_balances")
            .select("invoice_id, allocated_amount, balance_amount, is_paid")
            .in("invoice_id", invoiceIds),
    ]);
    if (invoicesRes.error) throw invoicesRes.error;
    if (balancesRes.error) throw balancesRes.error;

    const balances = new Map<string, { allocated: number; paid: boolean }>();
    for (const b of balancesRes.data ?? []) {
        if (!b.invoice_id) continue;
        balances.set(b.invoice_id, { allocated: Number(b.allocated_amount ?? 0), paid: !!b.is_paid });
    }

    for (const inv of invoicesRes.data ?? []) {
        const bal = balances.get(inv.id);
        const allocations = [...(inv.payment_allocations ?? [])].sort((a, b) =>
            b.allocated_at.localeCompare(a.allocated_at));
        const txn = allocations[0]?.payment_transactions;
        const method = (Array.isArray(txn) ? txn[0] : txn)?.method ?? null;

        result.set(inv.id, {
            id: inv.id,
            invoice_number: inv.invoice_number,
            payment_state: bal?.paid ? "paid" : (bal?.allocated ?? 0) > 0 ? "partial" : "unpaid",
            payment_method: method,
        });
    }
    return result;
}

/** One lookup for a whole page of tickets. */
export async function damageViewsForTickets(rows: RawChargeColumns[]): Promise<Map<string, DamageView>> {
    const states = await invoiceStates([...new Set(rows.flatMap((r) => (r.charge_invoice_id ? [r.charge_invoice_id] : [])))]);

    const result = new Map<string, DamageView>();
    for (const row of rows) {
        const items = parseItems(row.damage_items);
        const billed = row.charge_total !== null && row.charge_total !== undefined;
        result.set(row.id, {
            damage_items: items,
            damage_charge: billed
                ? {
                    billed_to_rider: !!row.charge_billed,
                    paid_via: row.charge_billed ? null : row.charge_paid_via ?? null,
                    gst_rate: Number(row.charge_gst_rate ?? 0),
                    subtotal: Number(row.charge_subtotal ?? 0),
                    gst_amount: Number(row.charge_gst_amount ?? 0),
                    total: Number(row.charge_total),
                    // Null if the invoice was later deleted (the FK sets null).
                    invoice: row.charge_invoice_id ? states.get(row.charge_invoice_id) ?? null : null,
                }
                : null,
        });
    }
    return result;
}

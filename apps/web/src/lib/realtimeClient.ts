import type { RealtimeChannel, RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { supabase } from "./supabaseClient";

/**
 * One shared connection manager for every realtime feature — table-specific
 * logic lives in the caller's handlers, not here, so this stays reusable for
 * future realtime work (chat, fleet tracking) beyond admin notifications.
 */

/**
 * The four tables in the `supabase_realtime` publication, asserted by
 * migration 27 rather than clicked in a dashboard.
 *
 * Two changed with the schema:
 *
 *   `invoices` → `payment_allocations`. The console listened for
 *   `payment_status` flipping to 'succeeded'; that column is gone, because
 *   paid-ness is derived from the allocations rather than stored. An
 *   allocation INSERT is the better signal anyway — money moving is an event,
 *   where a status flip was a description of one.
 *
 *   `notifications_log` → `notification_messages`. The addressed message is
 *   the only part of the three-table split published to realtime; the event
 *   stream and the delivery attempts are internal.
 *
 * Adding a name here does nothing on its own — the table has to be in the
 * publication, and its RLS is the only thing standing between it and every
 * subscribed browser.
 */
export type RealtimeTable =
  | "bookings"
  | "vehicles"
  | "payment_allocations"
  | "notification_messages";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RealtimeHandler = (payload: RealtimePostgresChangesPayload<Record<string, any>>) => void;
export type RealtimeHandlers = Partial<Record<RealtimeTable, RealtimeHandler>>;

let channel: RealtimeChannel | null = null;

// Bounded dedup guard — a reconnect can redeliver an already-handled change;
// this drops the repeat instead of double-toasting / double-invalidating.
const seenEvents = new Set<string>();
const SEEN_LIMIT = 200;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function eventKey(table: RealtimeTable, payload: RealtimePostgresChangesPayload<any>): string {
  const rowId = (payload.new as { id?: string })?.id ?? (payload.old as { id?: string })?.id ?? "";
  return `${table}:${payload.eventType}:${rowId}:${payload.commit_timestamp}`;
}

function withDedupe(table: RealtimeTable, handler: RealtimeHandler): RealtimeHandler {
  return (payload) => {
    const key = eventKey(table, payload);
    if (seenEvents.has(key)) return;
    seenEvents.add(key);
    if (seenEvents.size > SEEN_LIMIT) {
      const oldest = seenEvents.values().next().value;
      if (oldest) seenEvents.delete(oldest);
    }
    handler(payload);
  };
}

/** No-ops if already subscribed — prevents duplicate channels/subscriptions. */
export function subscribeAdminChannel(handlers: RealtimeHandlers): void {
  if (channel) return;

  const ch = supabase.channel("admin-realtime");
  (Object.keys(handlers) as RealtimeTable[]).forEach((table) => {
    const handler = handlers[table];
    if (!handler) return;
    ch.on(
      "postgres_changes",
      { event: "*", schema: "public", table },
      withDedupe(table, handler),
    );
  });

  ch.subscribe();
  channel = ch;
}

export function unsubscribeAdminChannel(): void {
  if (!channel) return;
  void supabase.removeChannel(channel);
  channel = null;
  seenEvents.clear();
}

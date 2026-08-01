import type { RealtimeChannel, RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { supabase } from "./supabaseClient";

/**
 * One shared connection manager for every realtime feature — table-specific
 * logic lives in the caller's handlers, not here, so this stays reusable for
 * future realtime work (chat, fleet tracking) beyond admin notifications.
 */
export type RealtimeTable = "bookings" | "vehicles" | "invoices" | "notifications_log";

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

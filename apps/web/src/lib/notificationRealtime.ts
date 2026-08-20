import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "./supabaseClient";

/**
 * A separate channel from lib/realtimeClient's "admin-realtime" (admin-only,
 * used by RealtimeProvider/ApprovalPopup) — this one is for the personal
 * notification bell (admin, staff, or rider), gated purely by RLS's
 * `user_id = auth.uid()` clause on notification_messages, not by role. Kept
 * distinct so neither channel's lifecycle affects the other.
 */
let channel: RealtimeChannel | null = null;

/** No-ops if already subscribed. */
export function subscribeNotificationBell(onInsert: () => void): void {
  if (channel) return;
  const ch = supabase.channel("notification-bell");
  ch.on(
    "postgres_changes",
    { event: "INSERT", schema: "public", table: "notification_messages" },
    onInsert,
  );
  ch.subscribe();
  channel = ch;
}

export function unsubscribeNotificationBell(): void {
  if (!channel) return;
  void supabase.removeChannel(channel);
  channel = null;
}

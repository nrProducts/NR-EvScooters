import { useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { subscribeAdminChannel, unsubscribeAdminChannel, type RealtimeHandlers } from "@/lib/realtimeClient";
import { useAuthStore } from "@/store/authStore";
import { useToastStore } from "@/store/toastStore";
import { ToastViewport } from "@/components/common/ToastViewport";
import { ApprovalPopup, type ApprovalRequest } from "@/components/common/ApprovalPopup";
import { useNotificationTypeSummaries } from "@/hooks/useNotificationSettings";

/*
 * `APPROVAL_TEMPLATES` lived here — a two-entry map deciding which incoming
 * notifications open a blocking popup rather than just ticking the bell.
 *
 * It is `notification_types.requires_action` now, with `action_path` for
 * where the popup's button goes. The map meant a backend notification that
 * needed a decision was silently treated as news until someone remembered to
 * add it here in a second repository; a migration moves it instead.
 */

/** `vehicle_status`: five values, and `booked`/`scrap` are not among them. */
const VEHICLE_STATUS_LABEL: Record<string, string> = {
  available: "Available",
  reserved: "Reserved",
  assigned: "Assigned",
  maintenance: "Under Maintenance",
  retired: "Retired",
};

function unwrap<T>(raw: unknown): T | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return (v as T) ?? null;
}

/**
 * Mounted once, wraps the whole authenticated app. Owns the single realtime
 * channel via lib/realtimeClient and turns table events into React Query
 * cache invalidations + toasts — it does not keep a second copy of list
 * state, React Query already is that cache.
 */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const push = useToastStore((s) => s.push);
  const navigate = useNavigate();
  const [approval, setApproval] = useState<ApprovalRequest | null>(null);
  // The catalogue decides which notifications are tasks. Fetched, not
  // hard-coded — see the note where APPROVAL_TEMPLATES used to be. The
  // subscriber-free /types read, because this provider runs for staff too and
  // the full settings endpoint is admin-only.
  const { data: notificationTypes } = useNotificationTypeSummaries();

  useEffect(() => {
    // Staff and admin both.
    //
    // This used to be admin-only, justified by "the RLS on the published
    // tables only passes realtime rows through to the 'admin' role, not
    // 'staff'". That was not true: p_bookings_read, p_vehicles_read and
    // p_payment_allocations_read all resolve through public.is_staff(), which
    // is role in ('staff','admin'). RLS was never the constraint — this line
    // was — and the cost fell on the people most likely to sit on the pickup
    // queue all day, watching a list that never moved.
    //
    // RLS remains the actual control on what each session receives; it is
    // per-row, so a staff member sees exactly what a staff member may see.
    // See docs/final-system-audit (finding M2).
    if (!user || (user.role !== "admin" && user.role !== "staff")) {
      unsubscribeAdminChannel();
      return;
    }

    const handlers: RealtimeHandlers = {
      bookings: (payload) => {
        if (payload.eventType === "INSERT") {
          qc.invalidateQueries({ queryKey: ["pickup-queue"] });
          qc.invalidateQueries({ queryKey: ["reports", "summary"] });

          const row = payload.new as { id: string };
          // Realtime payloads are raw, unjoined rows — one small enrichment
          // read for the rider/vehicle names the popup copy needs. Never
          // blocks the invalidation above, and falls back to generic copy
          // rather than dropping the popup if this fails.
          // New bookings need a staff decision (prepare/confirm the pickup),
          // so this opens the approval popup rather than just toasting.
          //
          // The embed changed shape: a booking reserves a PLAN, and the plan
          // is what names a vehicle model — `bookings.vehicle_model_id` is
          // gone. The `!fkey` hint on the rider is gone too, since
          // `cancelled_by` moved to `booking_cancellations` and bookings has
          // one foreign key to users again.
          void supabase
            .from("bookings")
            .select("users(full_name), plans(vehicle_models(name))")
            .eq("id", row.id)
            .maybeSingle()
            .then(
              ({ data }) => {
                const rider = unwrap<{ full_name: string }>(data?.users);
                const plan = unwrap<{ vehicle_models: unknown }>(data?.plans);
                const model = unwrap<{ name: string }>(plan?.vehicle_models);
                setApproval({
                  title: "New Booking",
                  message: rider && model ? `${rider.full_name} booked ${model.name}` : "A new booking was just created.",
                  reviewPath: "/bookings",
                  reviewLabel: "Confirm Pickup",
                });
              },
              () => {
                setApproval({
                  title: "New Booking",
                  message: "A new booking was just created.",
                  reviewPath: "/bookings",
                  reviewLabel: "Confirm Pickup",
                });
              },
            );
          return;
        }

        if (payload.eventType === "UPDATE") {
          const next = payload.new as { status?: string };
          const prev = payload.old as { status?: string };
          if (!next.status || next.status === prev?.status) return;

          qc.invalidateQueries({ queryKey: ["pickup-queue"] });
          qc.invalidateQueries({ queryKey: ["reports", "summary"] });

          if (next.status === "cancelled") {
            push({ tone: "warning", title: "Booking Cancelled", message: "A booking was just cancelled." });
          } else if (next.status === "fulfilled") {
            push({ tone: "success", title: "Booking Completed", message: "A pickup was just completed." });
          }
        }
      },

      vehicles: (payload) => {
        if (payload.eventType !== "UPDATE") return;
        // `vehicles.name` is `display_name`, and it is nullable — the
        // registration number is the one identifier every vehicle has.
        const next = payload.new as {
          id: string; display_name: string | null; registration_number: string; status?: string;
        };
        const prev = payload.old as { status?: string };
        if (!next.status || next.status === prev?.status) return;

        qc.invalidateQueries({ queryKey: ["vehicles"] });
        qc.invalidateQueries({ queryKey: ["vehicle", next.id] });
        qc.invalidateQueries({ queryKey: ["reports", "summary"] });

        const label = next.display_name ?? next.registration_number;
        push({
          tone: "info",
          title: "Vehicle Status Changed",
          message: `${label} (${next.registration_number}) is now ${VEHICLE_STATUS_LABEL[next.status] ?? next.status}.`,
        });
      },

      // Money landing, rather than a status column describing it having
      // landed. `invoices.payment_status` is gone — paid-ness is derived from
      // exactly these rows — so an allocation INSERT is both the earliest and
      // the only reliable signal that a payment settled an invoice.
      //
      // An INSERT, not an UPDATE: an allocation is written once and never
      // revised, which also means the old "did it JUST become succeeded?"
      // guard against re-toasting on unrelated updates is unnecessary.
      payment_allocations: (payload) => {
        if (payload.eventType !== "INSERT") return;
        const row = payload.new as { invoice_id?: string };

        qc.invalidateQueries({ queryKey: ["invoices"] });
        if (row.invoice_id) qc.invalidateQueries({ queryKey: ["invoice", row.invoice_id] });
        qc.invalidateQueries({ queryKey: ["payments"] });
        qc.invalidateQueries({ queryKey: ["reports", "summary"] });

        push({ tone: "success", title: "Payment Received", message: "A payment was just received." });
      },

      // Rider-facing notifications fire constantly (KYC updates, booking
      // confirmations, etc.) — toasting every one would spam admins, so this
      // just keeps the header bell badge live, except for the ones the
      // catalogue marks as needing action, which open the blocking popup.
      //
      // `title` and `body` are columns on the message now rather than keys
      // inside a `payload` blob, which is why the fallbacks below almost
      // never fire: the row itself carries the words.
      notification_messages: (payload) => {
        qc.invalidateQueries({ queryKey: ["notifications"] });
        if (payload.eventType !== "INSERT") return;

        const row = payload.new as {
          notification_type_code?: string; title?: string; body?: string;
        };
        const type = notificationTypes?.find(
          (t) => t.notification_type === row.notification_type_code,
        );
        if (!type?.requires_action) return;

        setApproval({
          title: row.title ?? type.label ?? "Approval needed",
          message: row.body ?? "Something needs your review.",
          // A type marked as needing action with nowhere to go is a catalogue
          // mistake, not a reason to drop the popup — the dashboard is at
          // least somewhere the person can start looking.
          reviewPath: type.action_path ?? "/",
          reviewLabel: "Review",
        });
      },
    };

    subscribeAdminChannel(handlers);
    return () => unsubscribeAdminChannel();
  }, [user?.id, user?.role, qc, push, notificationTypes]);

  return (
    <>
      {children}
      <ToastViewport />
      <ApprovalPopup
        request={approval}
        onDismiss={() => setApproval(null)}
        onReview={(request) => {
          setApproval(null);
          navigate(request.reviewPath);
        }}
      />
    </>
  );
}

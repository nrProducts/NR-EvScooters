import { useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { subscribeAdminChannel, unsubscribeAdminChannel, type RealtimeHandlers } from "@/lib/realtimeClient";
import { useAuthStore } from "@/store/authStore";
import { useToastStore } from "@/store/toastStore";
import { ToastViewport } from "@/components/common/ToastViewport";
import { ApprovalPopup, type ApprovalRequest } from "@/components/common/ApprovalPopup";

// Notification templates that need a staff decision, not just an FYI toast —
// these open a blocking center-screen popup instead of/alongside the toast.
// Add new "needs review" templates here as they're wired up on the backend.
const APPROVAL_TEMPLATES: Record<string, { reviewPath: string; reviewLabel: string }> = {
  kyc_review_needed: { reviewPath: "/kyc", reviewLabel: "Review KYC" },
  maintenance_review_needed: { reviewPath: "/maintenance", reviewLabel: "Review Ticket" },
};

const VEHICLE_STATUS_LABEL: Record<string, string> = {
  available: "Available",
  booked: "Booked",
  assigned: "Assigned",
  maintenance: "Under Maintenance",
  scrap: "Scrapped",
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

  useEffect(() => {
    // Admin-only for now — bookings/invoices/notifications_log RLS only
    // passes realtime rows through to the 'admin' role, not 'staff'.
    if (user?.role !== "admin") {
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
          void supabase
            .from("bookings")
            .select("users!bookings_user_id_fkey(full_name), vehicle_models(name)")
            .eq("id", row.id)
            .maybeSingle()
            .then(
              ({ data }) => {
                const rider = unwrap<{ full_name: string }>(data?.users);
                const model = unwrap<{ name: string }>(data?.vehicle_models);
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
        const next = payload.new as { id: string; name: string; registration_number: string; status?: string };
        const prev = payload.old as { status?: string };
        if (!next.status || next.status === prev?.status) return;

        qc.invalidateQueries({ queryKey: ["vehicles"] });
        qc.invalidateQueries({ queryKey: ["vehicle", next.id] });
        qc.invalidateQueries({ queryKey: ["reports", "summary"] });

        push({
          tone: "info",
          title: "Vehicle Status Changed",
          message: `${next.name} (${next.registration_number}) is now ${VEHICLE_STATUS_LABEL[next.status] ?? next.status}.`,
        });
      },

      invoices: (payload) => {
        if (payload.eventType !== "UPDATE") return;
        const next = payload.new as { id: string; payment_status?: string };
        const prev = payload.old as { payment_status?: string };
        if (next.payment_status !== "succeeded" || prev?.payment_status === "succeeded") return;

        qc.invalidateQueries({ queryKey: ["invoices"] });
        qc.invalidateQueries({ queryKey: ["invoice", next.id] });
        qc.invalidateQueries({ queryKey: ["reports", "summary"] });

        push({ tone: "success", title: "Payment Received", message: "A payment was just received." });
      },

      // Rider-facing notifications fire constantly (KYC updates, booking
      // confirmations, etc.) — toasting every one would spam admins, so this
      // just keeps the header bell badge live, except for templates that need
      // a staff decision, which open the blocking approval popup instead.
      notifications_log: (payload) => {
        qc.invalidateQueries({ queryKey: ["notifications"] });
        if (payload.eventType !== "INSERT") return;

        const row = payload.new as { template?: string; payload?: { title?: string; body?: string } };
        const approvalTemplate = row.template && APPROVAL_TEMPLATES[row.template];
        if (!approvalTemplate) return;

        setApproval({
          title: row.payload?.title ?? "Approval needed",
          message: row.payload?.body ?? "Something needs your review.",
          reviewPath: approvalTemplate.reviewPath,
          reviewLabel: approvalTemplate.reviewLabel,
        });
      },
    };

    subscribeAdminChannel(handlers);
    return () => unsubscribeAdminChannel();
  }, [user?.id, user?.role, qc, push]);

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

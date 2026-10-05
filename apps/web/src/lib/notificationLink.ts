import type { MyNotification } from "@/types";

/**
 * Return-flow notifications (`subject_type: 'rental'`, `subject_id: <rentalId>`)
 * deep-link straight to that return's detail page — preserving the rider /
 * vehicle / return record and working after a refresh — instead of the
 * generic Rental Operations list.
 */
export function returnFlowDeepLink(
  type: string,
  subjectType: string | null | undefined,
  subjectId: string | null | undefined,
): string | null {
  const isReturnFlow =
    type === "rental_return_requested" ||
    type === "return_requested" ||
    type === "vehicle_recovery_required" ||
    type === "return_payment_required" ||
    type.includes("return");

  if (isReturnFlow && subjectType === "rental" && subjectId) {
    return `/bookings/returns/${subjectId}`;
  }
  return null;
}

/** Where clicking a notification in the bell / activity list should navigate. */
export function notificationLink(
  n: Pick<MyNotification, "template" | "notification_type" | "reference_type" | "reference_id" | "payload">,
): string | null {
  const type = n.notification_type ?? n.template ?? "";
  return returnFlowDeepLink(type, n.reference_type, n.reference_id) ?? n.payload?.screen ?? null;
}

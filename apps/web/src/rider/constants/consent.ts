import type { ConsentPurpose } from "../types/api";

/**
 * English labels for DPDPA consent purposes. The mobile app renders these from
 * its i18n bundle (en/ta); the rider web MVP is English-only, so they live
 * here. Keep the wording aligned with apps/mobile/src/i18n/copy.en.ts.
 */
export const CONSENT_PURPOSE_LABEL: Record<ConsentPurpose, { title: string; summary: string }> = {
  kyc_identity_verification: {
    title: "Identity verification",
    summary: "Verify your identity from the documents you upload so you can rent a scooter.",
  },
  service_delivery: {
    title: "Providing the service",
    summary: "Manage your bookings, rentals, plans and the vehicle assigned to you.",
  },
  payments_and_billing: {
    title: "Payments & billing",
    summary: "Process payments, refunds, deposits and generate your invoices.",
  },
  safety_and_incident: {
    title: "Safety & incidents",
    summary: "Respond to accidents, breakdowns and safety issues during a ride.",
  },
  service_communications: {
    title: "Service messages",
    summary: "Send you booking, payment, plan-expiry and return notifications.",
  },
  marketing_communications: {
    title: "Offers & updates",
    summary: "Send you promotions, new plans and product news. You can turn this off any time.",
  },
  referral_program: {
    title: "Referrals",
    summary: "Track referrals and credit rewards when a friend you invited signs up.",
  },
  location_services: {
    title: "Location",
    summary: "Use your location to show the nearest pickup and battery-swap stations.",
  },
};

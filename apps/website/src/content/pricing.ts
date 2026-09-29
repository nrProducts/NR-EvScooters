/**
 * Marketing WORDS only — the bullet copy under each plan card. There is no
 * `plans.highlights` column, so this is the one part of a plan's card that
 * has nowhere else to live.
 *
 * Every NUMBER (price, duration, deposit, onboarding charge, refund terms)
 * and the plan's own `name` come from GET /public/plans, live, every time —
 * see mergePlanCopy in siteData.tsx. Nothing here is ever shown as a
 * fallback price: if the API hasn't answered yet, or fails, the Pricing
 * section shows a loading/error state instead of inventing numbers that
 * could drift from what plans.plans actually charges.
 *
 * Keyed by billing cycle, matching whichever plans the admin has active
 * (Plans page in apps/web) — add an entry here for any new billing cycle so
 * its card has real highlight copy instead of falling back to the first
 * entry's.
 */
export interface PlanHighlights {
  billingCycle: "daily" | "weekly" | "monthly" | "yearly";
  highlights: string[];
}

export const PLAN_HIGHLIGHTS: PlanHighlights[] = [
  {
    billingCycle: "daily",
    highlights: [
      "Unlimited riding for the day",
      "One MVS7 scooter, swappable battery included",
      "No onboarding charge",
      "Free battery swaps at any Chennai swap station",
    ],
  },
  {
    billingCycle: "weekly",
    highlights: [
      "Unlimited riding for 7 days",
      "One MVS7 scooter, swappable battery included",
      "Refundable security deposit",
      "Free battery swaps at any Chennai swap station",
    ],
  },
];

/**
 * Fallback copy only, used when GET /public/plans hasn't answered yet (or
 * fails) — live pricing/terms always come from the API once it loads (see
 * mergePlanCopy in siteData.tsx, which matches an entry here by billing
 * cycle to borrow its highlights). A Monthly row also exists in the plans
 * table but is inactive (active=false), i.e. not currently offered, so it's
 * deliberately left out here rather than shown as a fake option. Add an
 * entry here for any other plan the admin activates (Plans page in
 * apps/web) so its card has real highlight copy instead of falling through
 * to another plan's.
 */
export interface RentalPlan {
  name: string;
  billingCycle: "daily" | "weekly" | "monthly" | "yearly";
  price: number;
  durationDays: number;
  /** The REFUNDABLE part of what is collected up front. */
  depositAmount: number;
  /** One-time non-refundable charge taken with the first payment. 0 = none. */
  onboardingChargeAmount: number;
  /** Rental days before the deposit becomes refundable. 0 = no minimum. Meaningless when depositRefundable is false. */
  minRentalDaysForRefund: number;
  /** Whether the deposit is ever refundable at all. False = forfeited outright on return, like the onboarding charge. */
  depositRefundable: boolean;
  vehicleModelId: string;
  highlights: string[];
}

export const ACTIVE_PLANS: RentalPlan[] = [
  {
    name: "Daily",
    billingCycle: "daily",
    price: 299,
    durationDays: 1,
    depositAmount: 999,
    onboardingChargeAmount: 0,
    minRentalDaysForRefund: 0,
    depositRefundable: false,
    vehicleModelId: "mvs7",
    highlights: [
      "Unlimited riding for the day",
      "One MVS7 scooter, swappable battery included",
      "No onboarding charge",
      "Free battery swaps at any Chennai swap station",
    ],
  },
  {
    name: "Weekly Unlimited",
    billingCycle: "weekly",
    price: 1899,
    durationDays: 7,
    depositAmount: 1500,
    onboardingChargeAmount: 500,
    minRentalDaysForRefund: 45,
    depositRefundable: true,
    vehicleModelId: "mvs7",
    highlights: [
      "Unlimited riding for 7 days",
      "One MVS7 scooter, swappable battery included",
      "Refundable security deposit",
      "Free battery swaps at any Chennai swap station",
    ],
  },
];

/**
 * Sourced from the live public.plans table. Only the currently active plan
 * is listed — a Daily and a Monthly row also exist but are inactive
 * (active=false), i.e. not currently offered, so they're deliberately left
 * out rather than shown as fake options. Update this the same way if/when
 * the admin activates another plan (Plans page in apps/web).
 */
export interface RentalPlan {
  name: string;
  billingCycle: "daily" | "weekly" | "monthly" | "yearly";
  price: number;
  durationDays: number;
  depositAmount: number;
  vehicleModelId: string;
  highlights: string[];
}

export const ACTIVE_PLANS: RentalPlan[] = [
  {
    name: "Weekly Unlimited",
    billingCycle: "weekly",
    price: 1800,
    durationDays: 7,
    depositAmount: 2000,
    vehicleModelId: "mvs7",
    highlights: [
      "Unlimited riding for 7 days",
      "One MVS7 scooter, swappable battery included",
      "Refundable security deposit",
      "Free battery swaps at any Chennai swap station",
    ],
  },
];

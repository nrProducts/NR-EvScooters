import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { PLAN_HIGHLIGHTS } from "@/content/pricing";

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

/** A plan card, fully assembled: every number from the live API, highlight copy from the content file. */
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

export interface SiteStats {
  /** Total scooters in the fleet (excludes retired). null = not loaded. */
  scootersTotal: number | null;
  /** Scooters bookable right now. */
  scootersAvailable: number | null;
  /** Scooters currently out on an active rental. */
  scootersOnRoad: number | null;
  /** Plans currently on offer. */
  activePlans: number | null;
}

export type PlansStatus = "loading" | "ready" | "error";

interface SiteData {
  /**
   * Empty until the live fetch succeeds — there is no hardcoded numeric
   * fallback to show in the meantime (see content/pricing.ts). Check
   * `plansStatus` to tell "still loading" apart from "loaded, zero active
   * plans" apart from "the API call failed".
   */
  plans: RentalPlan[];
  plansStatus: PlansStatus;
  stats: SiteStats;
  /** True once the backend has answered (plans call succeeded), even if it returned zero plans. */
  live: boolean;
}

const EMPTY_STATS: SiteStats = {
  scootersTotal: null, scootersAvailable: null, scootersOnRoad: null, activePlans: null,
};

const INITIAL: SiteData = {
  plans: [],
  plansStatus: "loading",
  stats: EMPTY_STATS,
  live: false,
};

const SiteDataContext = createContext<SiteData>(INITIAL);

/** Live plans + fleet/station counts from GET /public/*. No bundled numeric fallback — see PlansStatus. */
export const useSiteData = () => useContext(SiteDataContext);

interface ApiPlan {
  name: string;
  billing_cycle: RentalPlan["billingCycle"];
  price: number;
  duration_days: number;
  deposit_amount: number;
  onboarding_charge_amount: number;
  min_rental_days_for_refund: number;
  deposit_refundable: boolean;
  vehicle_model_id: string | null;
}

interface ApiStats {
  scooters_total?: number;
  scooters_available?: number;
  scooters_on_road?: number;
  active_plans?: number;
}

/** Every number is the API's; only `highlights` is borrowed from the local copy, matched by billing cycle. */
function mergePlanCopy(p: ApiPlan): RentalPlan {
  const copy = PLAN_HIGHLIGHTS.find((c) => c.billingCycle === p.billing_cycle);
  return {
    name: p.name,
    billingCycle: p.billing_cycle,
    price: p.price,
    durationDays: p.duration_days,
    depositAmount: p.deposit_amount,
    onboardingChargeAmount: p.onboarding_charge_amount,
    minRentalDaysForRefund: p.min_rental_days_for_refund,
    depositRefundable: p.deposit_refundable,
    vehicleModelId: p.vehicle_model_id ?? "",
    highlights: copy?.highlights ?? [],
  };
}

export function SiteDataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<SiteData>(INITIAL);

  useEffect(() => {
    if (!API_BASE) {
      setData((d) => ({ ...d, plansStatus: "error" }));
      return;
    }
    const controller = new AbortController();

    (async () => {
      try {
        const [plansRes, statsRes] = await Promise.all([
          fetch(`${API_BASE}/public/plans`, { signal: controller.signal }).then((r) => (r.ok ? r.json() : null)),
          fetch(`${API_BASE}/public/stats`, { signal: controller.signal }).then((r) => (r.ok ? r.json() : null)),
        ]);

        if (!plansRes) throw new Error("plans request failed");

        const apiPlans = (plansRes.plans ?? []) as ApiPlan[];
        const s = (statsRes ?? {}) as ApiStats;

        setData({
          plans: apiPlans.map(mergePlanCopy),
          plansStatus: "ready",
          stats: statsRes
            ? {
                scootersTotal: s.scooters_total ?? null,
                scootersAvailable: s.scooters_available ?? null,
                scootersOnRoad: s.scooters_on_road ?? null,
                activePlans: s.active_plans ?? null,
              }
            : EMPTY_STATS,
          live: true,
        });
      } catch (err) {
        if (controller.signal.aborted) return;
        console.error("[siteData] failed to load live pricing", err);
        setData((d) => ({ ...d, plansStatus: "error" }));
      }
    })();

    return () => controller.abort();
  }, []);

  return <SiteDataContext.Provider value={data}>{children}</SiteDataContext.Provider>;
}

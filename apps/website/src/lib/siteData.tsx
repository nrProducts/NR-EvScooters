import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { ACTIVE_PLANS, type RentalPlan } from "@/content/pricing";

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

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

interface SiteData {
  /** Always non-empty — falls back to the bundled ACTIVE_PLANS copy. */
  plans: RentalPlan[];
  stats: SiteStats;
  /** True once the backend has answered; false while on bundled fallbacks. */
  live: boolean;
}

const FALLBACK: SiteData = {
  plans: ACTIVE_PLANS,
  stats: { scootersTotal: null, scootersAvailable: null, scootersOnRoad: null, activePlans: null },
  live: false,
};

const SiteDataContext = createContext<SiteData>(FALLBACK);

/** Live plans + fleet/station counts from GET /public/*, with bundled fallbacks. */
export const useSiteData = () => useContext(SiteDataContext);

interface ApiPlan {
  name: string;
  billing_cycle: RentalPlan["billingCycle"];
  price: number;
  duration_days: number;
  deposit_amount: number;
  vehicle_model_id: string | null;
}

interface ApiStats {
  scooters_total?: number;
  scooters_available?: number;
  scooters_on_road?: number;
  active_plans?: number;
}

/** Live pricing from the API; marketing copy (highlights) from the content file. */
function mergePlanCopy(p: ApiPlan): RentalPlan {
  const copy =
    ACTIVE_PLANS.find((c) => c.vehicleModelId === p.vehicle_model_id) ??
    ACTIVE_PLANS.find((c) => c.billingCycle === p.billing_cycle) ??
    ACTIVE_PLANS[0];
  return {
    name: p.name,
    billingCycle: p.billing_cycle,
    price: p.price,
    durationDays: p.duration_days,
    depositAmount: p.deposit_amount,
    vehicleModelId: p.vehicle_model_id ?? copy?.vehicleModelId ?? "",
    highlights: copy?.highlights ?? [],
  };
}

export function SiteDataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<SiteData>(FALLBACK);

  useEffect(() => {
    if (!API_BASE) return;
    const controller = new AbortController();

    (async () => {
      try {
        const [plansRes, statsRes] = await Promise.all([
          fetch(`${API_BASE}/public/plans`, { signal: controller.signal }).then((r) => (r.ok ? r.json() : null)),
          fetch(`${API_BASE}/public/stats`, { signal: controller.signal }).then((r) => (r.ok ? r.json() : null)),
        ]);

        const apiPlans = (plansRes?.plans ?? []) as ApiPlan[];
        const s = (statsRes ?? {}) as ApiStats;

        setData({
          plans: apiPlans.length > 0 ? apiPlans.map(mergePlanCopy) : ACTIVE_PLANS,
          stats: statsRes
            ? {
                scootersTotal: s.scooters_total ?? null,
                scootersAvailable: s.scooters_available ?? null,
                scootersOnRoad: s.scooters_on_road ?? null,
                activePlans: s.active_plans ?? null,
              }
            : FALLBACK.stats,
          live: true,
        });
      } catch {
        // Network error / abort — keep the bundled fallback, site still renders.
      }
    })();

    return () => controller.abort();
  }, []);

  return <SiteDataContext.Provider value={data}>{children}</SiteDataContext.Provider>;
}

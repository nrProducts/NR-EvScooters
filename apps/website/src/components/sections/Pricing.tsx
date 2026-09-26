import { Check, ArrowRight } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Reveal } from "@/components/ui/Reveal";
import { useSiteData } from "@/lib/siteData";
import { formatCurrency } from "@/lib/utils";

const CYCLE_LABEL: Record<string, string> = {
  daily: "day",
  weekly: "week",
  monthly: "month",
  yearly: "year",
};

/**
 * Maps over `plans` (from GET /public/plans, falling back to the bundled
 * ACTIVE_PLANS) rather than assuming one — today that's a single Weekly
 * plan, but the layout already supports more being activated later without
 * a rewrite.
 */
export function Pricing() {
  const { plans } = useSiteData();
  const multiple = plans.length > 1;

  return (
    <section id="pricing" className="bg-sage/50 py-12 sm:py-16">
      <Container>
        <Reveal>
        <SectionHeading
          eyebrow="Pricing"
          title={"One simple plan.\nNo surprises."}
          description="Flexible EV scooter rental for everyday Chennai travel — pricing is managed centrally, so it's always accurate here."
        />
        </Reveal>

        <div
          className={
            multiple
              ? "mx-auto mt-14 grid max-w-5xl gap-6 sm:grid-cols-2 lg:grid-cols-3"
              : "mx-auto mt-14 max-w-lg"
          }
        >
          {plans.map((plan, i) => (
            <Reveal key={plan.name} delay={i * 100} className="overflow-hidden rounded-[2.5rem] bg-white shadow-soft">
              {/* One continuous card background — the price still reads first
                  through size/weight alone, so a color-block panel isn't
                  needed to earn that, and a hard sage-to-white cut there read
                  as two stacked boxes rather than one card. A hairline
                  border still separates price from detail, just without the
                  seam. */}
              <div className="border-b border-border px-8 pb-8 pt-7 sm:px-10">
                <Badge tone="outline">Most popular</Badge>
                <h3 className="mt-5 text-2xl font-medium text-foreground">{plan.name}</h3>

                <div className="mt-4 flex items-baseline gap-1.5">
                  <span className="text-5xl font-semibold text-foreground sm:text-6xl">
                    {formatCurrency(plan.price)}
                  </span>
                  <span className="text-base font-medium text-muted-foreground">
                    / {CYCLE_LABEL[plan.billingCycle] ?? plan.billingCycle}
                  </span>
                </div>
              </div>

              <div className="px-8 pb-8 pt-7 sm:px-10 sm:pb-10">
              <p className="text-sm leading-relaxed text-muted-foreground">
                {plan.onboardingChargeAmount > 0 ? (
                  <>
                    {formatCurrency(plan.onboardingChargeAmount + plan.depositAmount)} due up front —{" "}
                    {formatCurrency(plan.onboardingChargeAmount)} one-time onboarding charge (non-refundable) +{" "}
                    {formatCurrency(plan.depositAmount)} refundable security deposit
                    {plan.minRentalDaysForRefund > 0
                      && `, refundable after ${plan.minRentalDaysForRefund} rental days`}
                  </>
                ) : (
                  <>{formatCurrency(plan.depositAmount)} refundable security deposit</>
                )}
              </p>

              <ul className="mt-7 space-y-3.5">
                {plan.highlights.map((h) => (
                  <li key={h} className="flex items-start gap-3 text-[15px] font-medium text-foreground">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sage">
                      <Check className="h-3 w-3 text-primary" aria-hidden />
                    </span>
                    {h}
                  </li>
                ))}
              </ul>

              <Button href="#get-app" size="lg" className="mt-9 w-full">
                Book your scooter
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Button>
              </div>
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  );
}

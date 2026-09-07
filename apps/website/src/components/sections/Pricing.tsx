import { Check, ArrowRight } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
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
    <section id="pricing" className="bg-surface/60 py-12 sm:py-16">
      <Container>
        <SectionHeading
          eyebrow="Pricing"
          title={"One simple plan.\nNo surprises."}
          description="Flexible EV scooter rental for everyday Chennai travel — pricing is managed centrally, so it's always accurate here."
        />

        <div
          className={
            multiple
              ? "mx-auto mt-14 grid max-w-5xl gap-6 sm:grid-cols-2 lg:grid-cols-3"
              : "mx-auto mt-14 max-w-lg"
          }
        >
          {plans.map((plan) => (
            <div
              key={plan.name}
              className="relative overflow-hidden rounded-3xl border-2 border-primary bg-white p-8 shadow-glow sm:p-10"
            >
              <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/10 blur-3xl" />

              <Badge tone="soft">Most popular</Badge>
              <h3 className="mt-5 text-2xl font-extrabold text-foreground">{plan.name}</h3>

              <div className="mt-5 flex items-baseline gap-1.5">
                <span className="text-5xl font-extrabold tracking-tight text-foreground sm:text-6xl">
                  {formatCurrency(plan.price)}
                </span>
                <span className="text-base font-semibold text-muted-foreground">
                  / {CYCLE_LABEL[plan.billingCycle] ?? plan.billingCycle}
                </span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {formatCurrency(plan.depositAmount)} refundable security deposit
              </p>

              <ul className="mt-7 space-y-3.5">
                {plan.highlights.map((h) => (
                  <li key={h} className="flex items-start gap-3 text-[15px] font-medium text-foreground">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15">
                      <Check className="h-3 w-3 text-primary" aria-hidden />
                    </span>
                    {h}
                  </li>
                ))}
              </ul>

              <Button href="#get-app" size="lg" className="relative mt-9 w-full">
                Book Your Scooter
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}

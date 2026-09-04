import { Check } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Button } from "@/components/ui/Button";
import { useSiteData } from "@/lib/siteData";
import { formatCurrency } from "@/lib/utils";

export function Pricing() {
  const { plans } = useSiteData();
  return (
    <section id="pricing" className="bg-surface py-14 sm:py-20">
      <Container>
        <SectionHeading
          eyebrow="Pricing"
          title="One simple plan, no surprises"
          description="This is the plan currently on offer — pricing is managed centrally, so it's always accurate here."
        />

        <div className="mx-auto mt-10 max-w-md">
          {plans.map((plan) => (
            <div key={plan.name} className="rounded-2xl border-2 border-primary bg-card p-8 shadow-lift">
              <span className="inline-flex items-center rounded-full bg-secondary px-3 py-1 text-xs font-semibold uppercase tracking-wide text-secondary-foreground">
                Most popular
              </span>
              <h3 className="mt-4 text-xl font-bold text-foreground">{plan.name}</h3>

              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-4xl font-extrabold tracking-tight text-foreground">
                  {formatCurrency(plan.price)}
                </span>
                <span className="text-sm font-medium text-muted-foreground">/ {plan.billingCycle}</span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {formatCurrency(plan.depositAmount)} refundable security deposit
              </p>

              <ul className="mt-6 space-y-3">
                {plan.highlights.map((h) => (
                  <li key={h} className="flex items-start gap-2 text-sm text-foreground">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                    {h}
                  </li>
                ))}
              </ul>

              <Button href="#get-app" size="lg" className="mt-8 w-full">
                Book Your Scooter
              </Button>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}

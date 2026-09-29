import { Check, ArrowRight, Sparkles } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Reveal } from "@/components/ui/Reveal";
import { useSiteData } from "@/lib/siteData";
import { formatCurrency } from "@/lib/utils";
import { useBookingCta } from "@/lib/bookingCta";
import { PRE_BOOKING_MODE } from "@/content/launchMode";

const CYCLE_LABEL: Record<string, string> = {
  daily: "day",
  weekly: "week",
  monthly: "month",
  yearly: "year",
};

/**
 * Maps over `plans` (from GET /public/plans — see lib/siteData.tsx). Every
 * number shown here is the API's; there is no hardcoded price to fall back
 * to, so `plansStatus` decides what renders while that call is in flight or
 * if it fails, rather than ever showing a number that could be stale.
 */
export function Pricing() {
  const { plans, plansStatus } = useSiteData();
  const multiple = plans.length > 1;
  const bookingCta = useBookingCta("pricing_card");

  return (
    <section id="pricing" className="bg-sage/50 py-12 sm:py-16">
      <Container>
        <Reveal>
        <SectionHeading
          eyebrow="Pricing"
          title={PRE_BOOKING_MODE ? "Pricing is on its way." : "One simple plan.\nNo surprises."}
          description={
            PRE_BOOKING_MODE
              ? "We're finalising our rental plans ahead of launch. Pre-book now and we'll let you know the moment pricing goes live in your area."
              : "Flexible EV scooter rental for everyday Chennai travel — pricing is managed centrally, so it's always accurate here."
          }
        />
        </Reveal>

        {PRE_BOOKING_MODE ? (
          <PricingComingSoon onPreBook={bookingCta} />
        ) : (
        <>
        {plansStatus === "loading" && <PricingSkeleton />}

        {plansStatus === "error" && (
          <div className="mx-auto mt-14 max-w-lg rounded-[2.5rem] border border-border bg-white p-10 text-center shadow-soft">
            <p className="text-base font-medium text-foreground">Pricing couldn&rsquo;t be loaded right now.</p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Please refresh the page, or{" "}
              <a href="#contact" className="font-medium text-primary underline underline-offset-2">
                contact us
              </a>{" "}
              for current plans and pricing.
            </p>
          </div>
        )}

        {plansStatus === "ready" && plans.length === 0 && (
          <div className="mx-auto mt-14 max-w-lg rounded-[2.5rem] border border-border bg-white p-10 text-center shadow-soft">
            <p className="text-base font-medium text-foreground">No plans are on offer right now.</p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Check back shortly, or{" "}
              <a href="#contact" className="font-medium text-primary underline underline-offset-2">
                contact us
              </a>{" "}
              for availability.
            </p>
          </div>
        )}

        {plansStatus === "ready" && plans.length > 0 && (
        <div
          className={
            multiple
              ? "mx-auto mt-14 grid max-w-5xl gap-6 sm:grid-cols-2 lg:grid-cols-3"
              : "mx-auto mt-14 max-w-lg"
          }
        >
          {plans.map((plan, i) => (
            <Reveal
              key={plan.name}
              delay={i * 100}
              className="flex h-full flex-col overflow-hidden rounded-[2.5rem] bg-white shadow-soft"
            >
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

              <div className="flex flex-1 flex-col px-8 pb-8 pt-7 sm:px-10 sm:pb-10">
              <p className="min-h-[4.25rem] text-sm leading-relaxed text-muted-foreground sm:min-h-[3.75rem]">
                {plan.onboardingChargeAmount > 0 ? (
                  <>
                    {formatCurrency(plan.onboardingChargeAmount + plan.depositAmount)} due up front —{" "}
                    {formatCurrency(plan.onboardingChargeAmount)} one-time onboarding charge (non-refundable) +{" "}
                    {formatCurrency(plan.depositAmount)} security deposit
                    {!plan.depositRefundable
                      ? " (non-refundable)"
                      : plan.minRentalDaysForRefund > 0
                        ? `, refundable after ${plan.minRentalDaysForRefund} rental days`
                        : ", refundable"}
                  </>
                ) : (
                  <>
                    {formatCurrency(plan.depositAmount)} security deposit
                    {!plan.depositRefundable
                      ? " (non-refundable)"
                      : plan.minRentalDaysForRefund > 0
                        ? `, refundable after ${plan.minRentalDaysForRefund} rental days`
                        : ", refundable"}
                  </>
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

              {/* A spacer, not margin-auto on the button itself — margin-auto
                  would let a longer card (more list items, taller deposit
                  note) squeeze this gap down to almost nothing. mt-9 is the
                  guaranteed minimum; flex-1 only ever adds MORE room above
                  the button so it still bottom-aligns across cards. */}
              <div className="mt-9 flex-1 sm:mt-6" />
              <Button href={bookingCta.href} size="lg" className="w-full" onClick={bookingCta.onClick}>
                {PRE_BOOKING_MODE ? "Pre-Book Now" : "Book your scooter"}
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Button>
              </div>
            </Reveal>
          ))}
        </div>
        )}
        </>
        )}
      </Container>
    </section>
  );
}

/**
 * Plans aren't finalised yet, so no card here ever shows a Daily/Weekly
 * price — that reappears automatically once PRE_BOOKING_MODE flips back to
 * false, same as every other CTA on the site. One quiet card, a Pre-Book
 * CTA, no numbers.
 */
function PricingComingSoon({ onPreBook }: { onPreBook: ReturnType<typeof useBookingCta> }) {
  return (
    <div className="mx-auto mt-14 max-w-lg overflow-hidden rounded-[2.5rem] bg-white p-10 text-center shadow-soft sm:p-12">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-sage">
        <Sparkles className="h-6 w-6 text-primary" aria-hidden />
      </div>
      <h3 className="mt-6 text-xl font-semibold text-foreground">Plans &amp; pricing will be announced soon</h3>
      <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
        We're putting the final touches on our Daily and Weekly rental plans. Pre-book your ride
        today and be the first to know your price when we launch in your area.
      </p>
      <Button href={onPreBook.href} size="lg" className="mt-8 w-full sm:w-auto" onClick={onPreBook.onClick}>
        Pre-Book Now
        <ArrowRight className="h-4 w-4" aria-hidden />
      </Button>
    </div>
  );
}

/** Shape-matched placeholder while GET /public/plans is in flight — never invented numbers, just pulsing blocks. */
function PricingSkeleton() {
  return (
    <div className="mx-auto mt-14 grid max-w-5xl gap-6 sm:grid-cols-2" aria-hidden>
      {[0, 1].map((i) => (
        <div key={i} className="animate-pulse overflow-hidden rounded-[2.5rem] bg-white shadow-soft">
          <div className="border-b border-border px-8 pb-8 pt-7 sm:px-10">
            <div className="h-6 w-28 rounded-full bg-sage" />
            <div className="mt-5 h-7 w-24 rounded-md bg-sage" />
            <div className="mt-4 h-12 w-36 rounded-md bg-sage" />
          </div>
          <div className="px-8 pb-8 pt-7 sm:px-10 sm:pb-10">
            <div className="h-4 w-full rounded-md bg-sage" />
            <div className="mt-2 h-4 w-2/3 rounded-md bg-sage" />
            <div className="mt-9 space-y-3.5">
              {[0, 1, 2, 3].map((j) => (
                <div key={j} className="h-4 w-4/5 rounded-md bg-sage" />
              ))}
            </div>
            <div className="mt-9 h-12 w-full rounded-full bg-sage" />
          </div>
        </div>
      ))}
    </div>
  );
}

import { Check, Minus } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Reveal } from "@/components/ui/Reveal";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { QUOTE_FACTORS } from "@/content/fleet";
import {
  FleetFinalCta,
  FleetPageHero,
  PricingModelCards,
  WhatBothInclude,
} from "@/components/fleet/FleetBlocks";

/**
 * Rows say HOW the two models differ in structure. No rupee figures appear
 * anywhere on this page by owner decision: prices are shared on request, so the
 * page sends people to "Contact for price details". Don't add numbers here.
 */
const COMPARISON: { row: string; monthly: string; oneTime: string }[] = [
  { row: "How you pay", monthly: "A fee every month", oneTime: "One payment for the software" },
  { row: "Ongoing software fee", monthly: "Yes, monthly", oneTime: "None" },
  { row: "Updates and support", monthly: "Included while you subscribe", oneTime: "Optional, discussed separately" },
  { row: "Scales with your fleet", monthly: "Fee follows fleet size and modules", oneTime: "Scope agreed up front" },
  { row: "Best for", monthly: "New and growing fleets", oneTime: "Established fleets planning for years" },
];

const PRICING_FAQ = [
  {
    q: "How do I get the price?",
    a: "Contact us for price details. Fleet software varies a lot: a 10-vehicle operator and a 500-vehicle operator need different things, so we share pricing once we know your fleet size and the modules you need. Use the Contact for Price Details button or request a demo.",
  },
  {
    q: "Can I switch from monthly to a one-time purchase later?",
    a: "Tell us which way you are leaning in the demo. We will explain how each option works for your fleet, including whether and how you could change later.",
  },
  {
    q: "Is the demo free?",
    a: "Yes. Requesting a demo does not commit you to buying.",
  },
];

export function FleetPricingPage() {
  return (
    <>
      <FleetPageHero
        eyebrow="Pricing"
        title="Fleet management software pricing: monthly subscription or one-time purchase"
        description="Buy SwapNgo Fleet the way that suits your business. Both options include the admin web app, the rider mobile app and the integrated system behind them."
      />

      <section className="pb-12 sm:pb-16">
        <Container>
          <PricingModelCards placement="fleet_pricing" />
        </Container>
      </section>

      <section className="border-y border-border bg-mist/40 py-12 sm:py-16">
        <Container>
          <Reveal>
            <SectionHeading eyebrow="Compare" title={"Monthly vs one-time,\nside by side."} />
          </Reveal>
          <Reveal className="mx-auto mt-10 max-w-4xl overflow-x-auto rounded-3xl border border-border bg-card">
            <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
              <caption className="sr-only">Comparison of the monthly subscription and one-time purchase models</caption>
              <thead>
                <tr className="border-b border-border bg-sage/50">
                  <th scope="col" className="px-5 py-4 font-semibold text-foreground"><span className="sr-only">Aspect</span></th>
                  <th scope="col" className="px-5 py-4 font-semibold text-foreground">Monthly Subscription</th>
                  <th scope="col" className="px-5 py-4 font-semibold text-foreground">One-Time Purchase</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map((r) => (
                  <tr key={r.row} className="border-b border-border last:border-0">
                    <th scope="row" className="px-5 py-4 font-medium text-foreground">{r.row}</th>
                    <td className="px-5 py-4 text-foreground/80">{r.monthly}</td>
                    <td className="px-5 py-4 text-foreground/80">{r.oneTime}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Reveal>
        </Container>
      </section>

      <section className="py-12 sm:py-16">
        <Container className="space-y-8">
          <Reveal>
            <WhatBothInclude />
          </Reveal>
          <Reveal className="mx-auto max-w-3xl rounded-[2rem] border border-border bg-card p-7 sm:p-9">
            <h2 className="text-lg font-semibold text-foreground">What shapes your price</h2>
            <ul className="mt-4 space-y-3">
              {QUOTE_FACTORS.map((f) => (
                <li key={f} className="flex items-start gap-3 text-[15px] leading-snug text-foreground/85">
                  <Minus className="mt-1 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                  {f}
                </li>
              ))}
            </ul>
          </Reveal>
        </Container>
      </section>

      <section className="border-t border-border bg-sage/40 py-12 sm:py-16">
        <Container>
          <Reveal>
            <SectionHeading eyebrow="Pricing questions" title="Before you ask" />
          </Reveal>
          <Reveal className="mx-auto mt-10 grid max-w-3xl gap-4">
            {PRICING_FAQ.map((f) => (
              <div key={f.q} className="rounded-2xl border border-border bg-card p-5">
                <h3 className="flex items-start gap-2.5 text-base font-semibold text-foreground">
                  <Check className="mt-1 h-4 w-4 shrink-0 text-primary" aria-hidden />
                  {f.q}
                </h3>
                <p className="mt-2 pl-[1.65rem] text-sm leading-relaxed text-muted-foreground">{f.a}</p>
              </div>
            ))}
          </Reveal>
        </Container>
      </section>

      <FleetFinalCta heading="Contact us for price details" priceContact />
    </>
  );
}

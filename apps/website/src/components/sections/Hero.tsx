import { ArrowRight, BatteryCharging, Wallet, ShieldCheck } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { ScooterIllustration } from "@/components/ui/ScooterIllustration";
import { useSiteData } from "@/lib/siteData";
import { formatCurrency } from "@/lib/utils";

export function Hero() {
  const { plans } = useSiteData();
  const cheapest = plans.reduce((min, p) => (p.price < min.price ? p : min), plans[0]);
  const BENEFITS = [
    { icon: Wallet, label: `Plans from ${formatCurrency(cheapest.price)} / ${cheapest.billingCycle}` },
    { icon: ShieldCheck, label: "KYC-verified riders only" },
  ];

  return (
    <section id="home" className="relative overflow-hidden bg-background pb-10 pt-4 sm:pb-14">
      {/* Soft green accents on a white canvas — no full-bleed fill. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-24 h-[32rem] w-[32rem] rounded-full bg-primary/20 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 -left-24 h-[26rem] w-[26rem] rounded-full bg-primary/10 blur-3xl"
      />

      <Container className="relative grid items-center gap-12 py-14 sm:py-16 lg:grid-cols-2 lg:py-20">
        <div className="animate-fade-up">
          <span className="inline-flex items-center rounded-full border border-primary/20 bg-secondary px-3 py-1 text-xs font-semibold uppercase tracking-wide text-secondary-foreground">
            Smart EV Rentals
          </span>

          <h1 className="mt-5 text-4xl font-extrabold leading-[1.1] tracking-tight text-foreground sm:text-5xl lg:text-6xl">
            EV Scooter Rental in Chennai — Move Smarter with <span className="text-primary">Swapngo</span>
          </h1>

          <p className="mt-6 max-w-lg text-lg leading-relaxed text-muted-foreground">
            Rent an electric scooter in Chennai with swappable-battery charging — no waiting around to charge.
            Verify once, book a weekly plan, swap batteries in minutes, and ride.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button href="#get-app" variant="default" size="lg">
              Book Your Scooter
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Button>
            <Button href="#pricing" variant="outline" size="lg">
              View Plans
            </Button>
          </div>

          <dl className="mt-8 flex flex-wrap gap-x-8 gap-y-3">
            {BENEFITS.map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-primary" aria-hidden />
                <dt className="sr-only">Benefit</dt>
                <dd className="text-sm font-medium text-muted-foreground">{label}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="relative animate-fade-up [animation-delay:120ms]">
          <div className="relative motion-safe:animate-float">
            {/* Green-tinted panel behind the scooter keeps some brand colour without flooding the page. */}
            <div className="overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-secondary via-background to-secondary p-1 shadow-lift ring-1 ring-primary/15">
              <div className="overflow-hidden rounded-[1.5rem] bg-white">
                <ScooterIllustration className="aspect-[4/3] w-full" />
              </div>
            </div>

            <div className="absolute -right-4 -top-4 flex items-center gap-2 rounded-2xl bg-white px-4 py-3 shadow-lift ring-1 ring-border sm:-right-6 sm:-top-6">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15">
                <BatteryCharging className="h-4 w-4 text-primary" aria-hidden />
              </span>
              <div className="leading-tight">
                <p className="text-sm font-bold text-foreground">~2 min</p>
                <p className="text-[11px] text-muted-foreground">battery swap</p>
              </div>
            </div>
          </div>
        </div>
      </Container>

      {/* Thin green baseline instead of a big angled colour block. */}
      <div aria-hidden className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-transparent via-primary to-transparent" />
    </section>
  );
}

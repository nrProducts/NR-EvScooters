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
    <section
      id="home"
      className="relative overflow-hidden bg-primary pb-24 pt-4 sm:pb-32"
      style={{ clipPath: "polygon(0 0, 100% 0, 100% 100%, 0 94%)" }}
    >
      <Container className="grid items-center gap-12 py-16 sm:py-20 lg:grid-cols-2 lg:py-24">
        <div className="animate-fade-up">
          <span className="inline-flex items-center rounded-full bg-white/90 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
            Smart EV Rentals
          </span>

          <h1 className="mt-5 text-4xl font-extrabold leading-[1.1] tracking-tight text-foreground sm:text-5xl lg:text-6xl">
            Move Smarter with Swapngo
          </h1>

          <p className="mt-6 max-w-lg text-lg leading-relaxed text-foreground/80">
            Rent an electric scooter with swappable-battery charging — no waiting around to charge. Verify once,
            book a plan, swap batteries in minutes, and ride.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button href="#get-app" variant="dark" size="lg">
              Book Your Scooter
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Button>
            <Button href="#pricing" variant="light" size="lg">
              View Plans
            </Button>
          </div>

          <dl className="mt-8 flex flex-wrap gap-x-8 gap-y-3">
            {BENEFITS.map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-foreground/70" aria-hidden />
                <dt className="sr-only">Benefit</dt>
                <dd className="text-sm font-medium text-foreground/80">{label}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="relative animate-fade-up [animation-delay:120ms]">
          <div className="relative motion-safe:animate-float">
            <div className="overflow-hidden rounded-2xl bg-white shadow-lift">
              <ScooterIllustration className="aspect-[4/3] w-full" />
            </div>

            <div className="absolute -right-4 -top-4 flex items-center gap-2 rounded-2xl bg-white px-4 py-3 shadow-lift sm:-right-6 sm:-top-6">
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
    </section>
  );
}

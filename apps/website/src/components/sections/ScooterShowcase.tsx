import { ArrowRight, Gauge, BatteryCharging, Zap, Sparkles } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ScooterIllustration } from "@/components/ui/ScooterIllustration";

/**
 * Deliberately non-numeric. There's no verified range/top-speed spec in the
 * project's content or database to show here — inventing figures would be
 * worse than not showing them, so these describe the riding experience
 * instead of making a number up.
 */
const SPECS = [
  { icon: Gauge, label: "Range", value: "Built for daily commutes" },
  { icon: Zap, label: "Ride feel", value: "City-ready, comfortable" },
  { icon: BatteryCharging, label: "Battery", value: "Swap-ready" },
  { icon: Sparkles, label: "Charging", value: "Swap or charge" },
];

export function ScooterShowcase() {
  return (
    <section className="overflow-hidden py-12 sm:py-16">
      <Container className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
        <div className="relative order-2 lg:order-1">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10 rounded-[3rem] bg-gradient-to-br from-surface via-background to-secondary/60"
          />
          <div className="motion-safe:animate-float">
            <ScooterIllustration className="aspect-square w-full max-w-lg p-6 sm:p-10" />
          </div>
        </div>

        <div className="order-1 lg:order-2">
          <Badge>Meet your ride</Badge>
          <h2 className="mt-4 text-balance text-section-mobile font-extrabold tracking-tight text-foreground sm:text-section">
            Meet your next ride.
          </h2>
          <p className="mt-5 max-w-md text-lg leading-relaxed text-muted-foreground">
            Every Swapngo scooter is electric, well maintained, and built around swappable-battery
            charging — comfortable enough for daily commutes, reliable enough to depend on.
          </p>

          <dl className="mt-9 grid grid-cols-2 gap-5">
            {SPECS.map(({ icon: Icon, label, value }) => (
              <div key={label} className="rounded-2xl border border-border bg-card p-4">
                <Icon className="h-4 w-4 text-primary" aria-hidden />
                <dt className="mt-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
                <dd className="mt-1 text-sm font-bold text-foreground">{value}</dd>
              </div>
            ))}
          </dl>

          <Button href="#get-app" size="lg" className="mt-9">
            Book This Scooter
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      </Container>
    </section>
  );
}

import { ArrowRight, BatteryCharging, Gauge, Clock, Leaf } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Badge } from "@/components/ui/Badge";
import { Reveal } from "@/components/ui/Reveal";
import { Button } from "@/components/ui/Button";
import { ScooterIllustration } from "@/components/ui/ScooterIllustration";

/**
 * Deliberately non-numeric. There's no verified range/top-speed spec in the
 * project's content or database to show here — inventing figures would be
 * worse than not showing them, so these describe the riding experience
 * instead of making a number up. "Under 2 minutes" is the one number kept —
 * it's the swap time quoted consistently elsewhere (BatterySwap section,
 * FAQ), not a fabricated one.
 */
const SPECS = [
  { icon: BatteryCharging, label: "Swappable battery", value: "No charging worries" },
  { icon: Gauge, label: "Smooth ride", value: "City-ready and comfortable" },
  { icon: Clock, label: "Fast swap", value: "Under 2 minutes, any station" },
  { icon: Leaf, label: "Eco-friendly", value: "Zero tailpipe emissions" },
];

export function ScooterShowcase() {
  return (
    <section className="py-12 sm:py-16">
      <Container>
        <Reveal className="relative overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-sage via-background to-mist p-8 shadow-soft sm:p-12 lg:p-14">
          <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/40 blur-3xl" />

          <div className="relative grid gap-10 lg:grid-cols-2 lg:items-center lg:gap-14">
            <div>
              <Badge>Our scooters</Badge>
              <h2 className="mt-5 text-balance text-section-mobile font-semibold tracking-tight text-foreground sm:text-section">
                Motovolt MVS7
              </h2>
              <p className="mt-2 text-base font-medium text-muted-foreground">
                Reliable <span aria-hidden>&middot;</span> Eco-friendly <span aria-hidden>&middot;</span> Cost effective
              </p>

              <dl className="mt-8 grid grid-cols-2 gap-5">
                {SPECS.map(({ icon: Icon, label, value }) => (
                  <div key={label}>
                    <span className="flex h-10 w-10 items-center justify-center rounded-[0.85rem] bg-white/80">
                      <Icon className="h-4 w-4 text-primary" aria-hidden />
                    </span>
                    <dt className="mt-2.5 text-sm font-semibold text-foreground">{label}</dt>
                    <dd className="mt-0.5 text-[13px] leading-snug text-muted-foreground">{value}</dd>
                  </div>
                ))}
              </dl>

              <Button href="#get-app" size="lg" className="mt-9">
                Book this scooter
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Button>
            </div>

            <div className="relative">
              <span
                aria-hidden
                className="absolute -top-2 right-2 hidden -rotate-3 font-script text-3xl leading-[0.85] text-primary sm:block"
              >
                Ride
                <br />
                Green
              </span>
              <ScooterIllustration className="mx-auto aspect-square w-full max-w-md" />
            </div>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}

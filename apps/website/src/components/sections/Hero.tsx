import { ArrowRight, BatteryCharging, MapPin, Check } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ScooterIllustration } from "@/components/ui/ScooterIllustration";
import { useSiteData } from "@/lib/siteData";

const TRUST_POINTS = ["Flexible plans", "Unlimited kilometres", "Battery swapping", "Easy booking"];

export function Hero() {
  const { stats } = useSiteData();

  return (
    <section id="home" className="relative overflow-hidden bg-background">
      {/* Soft green field + faint dot grid behind the whole composition — texture, not noise. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-grid-pattern [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,black,transparent)]" />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-40 -top-40 h-[42rem] w-[42rem] rounded-full bg-primary/25 blur-[110px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-48 -left-32 h-[34rem] w-[34rem] rounded-full bg-primary/10 blur-[110px]"
      />

      <Container className="relative grid min-h-[80vh] items-center gap-16 py-16 sm:py-20 lg:min-h-[86vh] lg:grid-cols-[1.05fr_1fr] lg:gap-12 lg:py-24">
        <div className="animate-fade-up">
          <Badge tone="outline">Chennai's EV Mobility</Badge>

          <h1 className="mt-6 text-balance text-hero-mobile font-extrabold text-foreground sm:text-hero lg:text-hero-lg">
            EV Scooter Rental in Chennai <span className="text-primary">without the hassle.</span>
          </h1>

          <p className="mt-6 max-w-lg text-lg leading-relaxed text-muted-foreground sm:text-xl">
            Rent an electric scooter with flexible plans, unlimited kilometres, and convenient
            battery swapping across the city — no waiting around to charge.
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Button href="#get-app" size="lg">
              Book a Scooter
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Button>
            <Button href="#how-it-works" variant="outline" size="lg">
              How It Works
            </Button>
          </div>

          <ul className="mt-10 grid grid-cols-2 gap-x-6 gap-y-3 sm:flex sm:flex-wrap sm:gap-x-8">
            {TRUST_POINTS.map((point) => (
              <li key={point} className="flex items-center gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15">
                  <Check className="h-3 w-3 text-primary" aria-hidden />
                </span>
                <span className="text-sm font-semibold text-foreground/80">{point}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative animate-fade-up [animation-delay:120ms]">
          <div className="relative mx-auto max-w-md motion-safe:animate-float lg:max-w-none">
            <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-secondary via-white to-surface p-2 shadow-lift ring-1 ring-primary/15 sm:p-4">
              <div className="overflow-hidden rounded-[1.5rem]">
                <ScooterIllustration className="aspect-[4/3] w-full scale-110" priority />
              </div>
            </div>

            <div className="absolute -left-4 top-6 flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-lift ring-1 ring-border motion-safe:animate-float-sm sm:-left-8 sm:top-10">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15">
                <MapPin className="h-4 w-4 text-primary" aria-hidden />
              </span>
              <div className="leading-tight">
                <p className="text-sm font-bold text-foreground">Available nearby</p>
                <p className="text-xs text-muted-foreground">
                  {stats.scootersAvailable != null ? `${stats.scootersAvailable} scooters ready` : "Scooters ready now"}
                </p>
              </div>
            </div>

            <div className="absolute -right-2 bottom-6 flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-lift ring-1 ring-border motion-safe:animate-float-sm [animation-delay:600ms] sm:-right-6 sm:bottom-10">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15">
                <BatteryCharging className="h-4 w-4 text-primary" aria-hidden />
              </span>
              <div className="leading-tight">
                <p className="text-sm font-bold text-foreground">Battery swap</p>
                <p className="text-xs text-muted-foreground">~2 min, and you're riding</p>
              </div>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}

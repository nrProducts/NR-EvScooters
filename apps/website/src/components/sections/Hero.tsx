import { ArrowRight, BatteryCharging, MapPin, Check } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ScooterReveal } from "@/components/ui/ScooterReveal";
import { Blob } from "@/components/ui/Blob";
import { Reveal } from "@/components/ui/Reveal";
import { useSiteData } from "@/lib/siteData";

const TRUST_POINTS = ["Flexible plans", "Unlimited kilometres", "Battery swapping", "Easy booking"];

export function Hero() {
  const { stats } = useSiteData();

  return (
    <section id="home" className="relative overflow-hidden bg-background">
      {/* Two drifting colour fields + a faint dot grid — ambient light, not decoration you're meant to notice. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-grid-pattern [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,black,transparent)]" />
      <Blob tone="sage" className="-right-40 -top-40 h-[42rem] w-[42rem]" />
      <Blob tone="mist" className="-bottom-48 -left-32 h-[34rem] w-[34rem]" delay="-3s" />

      <Container className="relative grid items-center gap-12 py-10 sm:gap-14 sm:py-14 lg:grid-cols-[1.05fr_1fr] lg:gap-12 lg:py-16">
        <Reveal>
          <Badge tone="outline">Chennai's EV mobility</Badge>

          <h1 className="mt-6 text-balance text-hero-mobile font-semibold text-foreground sm:text-hero lg:text-hero-lg">
            EV scooter rental in Chennai{" "}
            <span className="font-script text-[1.35em] font-normal leading-[0.8] tracking-normal text-primary">
              without
            </span>{" "}
            the hassle.
          </h1>

          <p className="mt-6 max-w-[500px] text-lg leading-relaxed text-muted-foreground sm:text-xl">
            Rent an electric scooter with flexible plans, unlimited kilometres, and convenient
            battery swapping across the city — no waiting around to charge.
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Button href="#get-app" size="lg" className="w-full sm:w-auto">
              Book a scooter
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Button>
            <Button href="#how-it-works" variant="light" size="lg" className="border border-border">
              How it works
            </Button>
          </div>

          <ul className="mt-10 grid grid-cols-2 gap-x-6 gap-y-3 sm:flex sm:flex-wrap sm:gap-x-8">
            {TRUST_POINTS.map((point) => (
              <li key={point} className="flex items-center gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sage">
                  <Check className="h-3 w-3 text-primary" aria-hidden />
                </span>
                <span className="text-sm font-medium text-foreground/80">{point}</span>
              </li>
            ))}
          </ul>
        </Reveal>

        <Reveal className="relative" delay={150}>
          <div className="relative mx-auto max-w-xs sm:max-w-sm lg:max-w-md">
            <div className="relative overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-sage via-white to-mist p-2 shadow-soft ring-1 ring-border sm:p-4">
              <div className="overflow-hidden rounded-[1.5rem]">
                <ScooterReveal className="aspect-[4/3] w-full" priority />
              </div>
              {/* Same handwritten accent as the Motovolt MVS7 card further down
                  the page — the two scooter visuals on the site read as one
                  pair now instead of two unrelated treatments. Hidden below
                  `sm`: on a phone-width card the photo is small enough that
                  this large script text reads as too big and crowds the
                  scooter itself — the "Battery swap" badge already carries
                  the page's message there. */}
              <span
                aria-hidden
                className="pointer-events-none absolute right-7 top-7 hidden -rotate-3 font-script text-3xl leading-[0.85] text-primary sm:block"
              >
                Ride
                <br />
                Green
              </span>
            </div>

            <div className="absolute -left-3 top-5 flex items-center gap-2 rounded-2xl bg-white px-3 py-2 shadow-soft ring-1 ring-border sm:-left-8 sm:top-10 sm:gap-3 sm:rounded-[1.75rem] sm:px-4 sm:py-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sage sm:h-10 sm:w-10">
                <MapPin className="h-3.5 w-3.5 text-primary sm:h-4 sm:w-4" aria-hidden />
              </span>
              <div className="leading-tight">
                <p className="text-xs font-semibold text-foreground sm:text-sm">Available nearby</p>
                <p className="text-[11px] text-muted-foreground sm:text-xs">
                  {stats.scootersAvailable != null ? `${stats.scootersAvailable} scooters ready` : "Scooters ready now"}
                </p>
              </div>
            </div>

            <div className="absolute bottom-4 right-3 flex items-center gap-2 rounded-2xl bg-white px-3 py-2 shadow-soft ring-1 ring-border sm:-right-6 sm:bottom-10 sm:gap-3 sm:rounded-[1.75rem] sm:px-4 sm:py-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-mist sm:h-10 sm:w-10">
                <BatteryCharging className="h-3.5 w-3.5 text-primary sm:h-4 sm:w-4" aria-hidden />
              </span>
              <div className="leading-tight">
                <p className="text-xs font-semibold text-foreground sm:text-sm">Battery swap</p>
                <p className="text-[11px] text-muted-foreground sm:text-xs">~2 min, and you're riding</p>
              </div>
            </div>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}

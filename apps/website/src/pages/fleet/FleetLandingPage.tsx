import { ArrowRight, Check, LayoutDashboard, Server, Smartphone } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Badge } from "@/components/ui/Badge";
import { Blob } from "@/components/ui/Blob";
import { Reveal } from "@/components/ui/Reveal";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { Link } from "@/lib/router";
import { trackEvent } from "@/lib/analytics";
import {
  ADMIN_HIGHLIGHTS,
  BENEFITS,
  FEATURE_CATEGORIES,
  SEGMENTS,
} from "@/content/fleet";
import { ADMIN_SHOTS, RIDER_SHOTS, SHOTS } from "@/content/fleetShots";
import { ProductShot } from "@/components/fleet/ProductShot";
import { DemoButton, FleetFinalCta, PricingModelCards } from "@/components/fleet/FleetBlocks";
import { FleetFaq } from "@/components/fleet/FleetFaq";

export function FleetLandingPage() {
  return (
    <>
      <Hero />
      <ThreeParts />
      <Highlights />
      <Gallery />
      <FeatureOverview />
      <Benefits />
      <Audience />
      <PricingTeaser />
      <FleetFaq />
      <FleetFinalCta />
    </>
  );
}

function Hero() {
  const adminShot = ADMIN_SHOTS[0];
  const riderShot = RIDER_SHOTS[0];

  return (
    <section className="relative overflow-hidden bg-background">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-grid-pattern [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,black,transparent)]" />
      <Blob tone="sage" className="-right-40 -top-40 h-[42rem] w-[42rem]" />
      <Blob tone="mist" className="-bottom-48 -left-32 h-[34rem] w-[34rem]" delay="-3s" />

      <Container className="relative grid items-center gap-12 py-12 sm:py-16 lg:grid-cols-[0.9fr_1.1fr] lg:gap-12 lg:py-20">
        <Reveal>
          <Badge tone="outline">Fleet management software</Badge>
          <h1 className="mt-6 text-balance text-hero-mobile font-semibold text-foreground sm:text-hero lg:text-hero-lg">
            SwapNgo Fleet:{" "}
            <span className="font-script text-[1.35em] font-normal leading-[0.8] tracking-normal text-primary">
              Complete
            </span>{" "}
            Fleet Management Software
          </h1>
          <p className="mt-6 max-w-[540px] text-lg leading-relaxed text-muted-foreground sm:text-xl">
            An admin web application, a rider mobile application and one integrated system to run vehicles,
            riders, bookings, payments and compliance for your fleet.
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <DemoButton placement="fleet_hero" />
            <ButtonLink
              to="/fleet-management/pricing"
              variant="light"
              size="lg"
              className="w-full border border-border sm:w-auto"
              onClick={() => trackEvent("click_view_pricing", { placement: "fleet_hero" })}
            >
              View Pricing
            </ButtonLink>
            <ButtonLink
              to="/fleet-management/features"
              variant="ghost"
              size="lg"
              className="w-full sm:w-auto"
              onClick={() => trackEvent("click_explore_features", { placement: "fleet_hero" })}
            >
              Explore Features
            </ButtonLink>
          </div>

          <ul className="mt-10 grid grid-cols-1 gap-x-6 gap-y-3 sm:flex sm:flex-wrap sm:gap-x-8">
            {["Admin web app", "Rider mobile app", "Monthly or one-time purchase"].map((point) => (
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
          {adminShot ? (
            <div className="relative">
              <ProductShot shot={adminShot} device="browser" priority showCaption={false} />
              {riderShot && (
                <div className="absolute -bottom-6 -right-2 w-[34%] min-w-[7rem] sm:-right-6">
                  <ProductShot shot={riderShot} device="phone" showCaption={false} />
                </div>
              )}
            </div>
          ) : (
            <ProductStack />
          )}
        </Reveal>
      </Container>
    </section>
  );
}

/** Shown when no screenshots are published: the three parts of the product as a stack. */
function ProductStack() {
  const parts = [
    { icon: LayoutDashboard, title: "Admin web application", text: "Run operations from one console" },
    { icon: Smartphone, title: "Rider mobile application", text: "Riders book, pay and get support" },
    { icon: Server, title: "Integrated system", text: "One back end behind both" },
  ];
  return (
    <div className="mx-auto max-w-md space-y-3 rounded-[2.5rem] bg-gradient-to-br from-sage via-white to-mist p-4 shadow-soft ring-1 ring-border sm:p-5">
      {parts.map(({ icon: Icon, title, text }) => (
        <div key={title} className="flex items-center gap-4 rounded-2xl border border-border bg-white p-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[1rem] bg-sage">
            <Icon className="h-5 w-5 text-primary" aria-hidden />
          </span>
          <span>
            <span className="block text-sm font-semibold text-foreground">{title}</span>
            <span className="block text-xs text-muted-foreground">{text}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

function ThreeParts() {
  const parts = [
    {
      icon: Smartphone,
      title: "Rider Mobile Application",
      text: "Your riders onboard, complete KYC, book a plan, pay, download tax invoices, request a return and get support, all from their phone.",
      to: "/fleet-management/rider-app",
      cta: "Explore the rider app",
    },
    {
      icon: LayoutDashboard,
      title: "Admin Web Application",
      text: "Your team manages vehicles, riders, bookings, payments, GST and staff access from one console, with permissions for each person.",
      to: "/fleet-management/admin-app",
      cta: "Explore the admin app",
    },
    {
      icon: Server,
      title: "Integrated Fleet Management System",
      text: "One back end connects both apps, so a payment, a KYC approval or a return is the same fact for riders and staff, immediately.",
      to: "/fleet-management/features",
      cta: "See every feature",
    },
  ];

  return (
    <section className="py-12 sm:py-16">
      <Container>
        <Reveal>
          <SectionHeading
            eyebrow="What you get"
            title={"Three parts.\nOne system."}
            description="SwapNgo Fleet is not a single app. It is the complete set your business needs to run a vehicle fleet."
          />
        </Reveal>
        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          {parts.map(({ icon: Icon, title, text, to, cta }, i) => (
            <Reveal key={title} delay={i * 90} className="flex flex-col rounded-3xl border border-border bg-card p-7 hover:border-primary/30 hover:shadow-card">
              <div className="flex h-12 w-12 items-center justify-center rounded-[1rem] bg-sage">
                <Icon className="h-6 w-6 text-primary" aria-hidden />
              </div>
              <h2 className="mt-5 text-lg font-semibold text-foreground">{title}</h2>
              <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{text}</p>
              <Link to={to} className="mt-auto inline-flex items-center gap-1.5 pt-6 text-sm font-semibold text-primary hover:text-primary-hover">
                {cta}
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  );
}

function Highlights() {
  return (
    <section className="border-y border-border bg-sage/50 py-12 sm:py-16">
      <Container>
        <Reveal>
          <SectionHeading eyebrow="Product highlights" title={"The admin console,\nat a glance."} />
        </Reveal>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ADMIN_HIGHLIGHTS.map(({ icon: Icon, title, description }, i) => (
            <Reveal key={title} delay={(i % 3) * 80} className="rounded-2xl border border-border bg-white p-5 hover:border-primary/30">
              <Icon className="h-5 w-5 text-primary" aria-hidden />
              <h3 className="mt-3 text-base font-semibold text-foreground">{title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  );
}

function Gallery() {
  const shots = [SHOTS.liveMap, SHOTS.revenue];
  if (shots.length === 0) return null;
  return (
    <section className="py-12 sm:py-16">
      <Container>
        <Reveal>
          <SectionHeading
            eyebrow="See it working"
            title={"Real screens from\nthe real product."}
            description="Screenshots of the admin console, shown with demonstration data."
          />
        </Reveal>
        <div className="mt-12 grid gap-8 md:grid-cols-2">
          {shots.map((shot, i) => (
            <Reveal key={shot.src} delay={i * 90}>
              <ProductShot shot={shot} device="browser" />
            </Reveal>
          ))}
        </div>
        <Reveal className="mt-10 text-center">
          <Link to="/fleet-management/admin-app" className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:text-primary-hover">
            More admin screens
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </Reveal>
      </Container>
    </section>
  );
}

function FeatureOverview() {
  return (
    <section className="bg-mist/40 py-12 sm:py-16">
      <Container>
        <Reveal>
          <SectionHeading
            eyebrow="Feature categories"
            title={"Everything a rental fleet\nneeds to run."}
            description={`${FEATURE_CATEGORIES.length} feature areas, all working today.`}
          />
        </Reveal>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURE_CATEGORIES.map((cat, i) => {
            const Icon = cat.icon;
            return (
              <Reveal key={cat.id} delay={(i % 3) * 70} className="rounded-2xl border border-border bg-card p-5 hover:border-primary/30">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[0.9rem] bg-sage">
                    <Icon className="h-5 w-5 text-primary" aria-hidden />
                  </span>
                  <h3 className="text-base font-semibold text-foreground">{cat.title}</h3>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{cat.summary}</p>
              </Reveal>
            );
          })}
        </div>
        <Reveal className="mt-10 text-center">
          <ButtonLink
            to="/fleet-management/features"
            variant="dark"
            onClick={() => trackEvent("click_explore_features", { placement: "fleet_feature_overview" })}
          >
            Explore all features
            <ArrowRight className="h-4 w-4" aria-hidden />
          </ButtonLink>
        </Reveal>
      </Container>
    </section>
  );
}

function Benefits() {
  return (
    <section className="py-12 sm:py-16">
      <Container>
        <Reveal>
          <SectionHeading eyebrow="Business benefits" title={"What changes when your fleet\nruns on one system."} />
        </Reveal>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {BENEFITS.map((b, i) => (
            <Reveal key={b.title} delay={(i % 3) * 80} className="rounded-3xl border border-border bg-card p-6">
              <h3 className="text-base font-semibold text-foreground">{b.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{b.description}</p>
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  );
}

function Audience() {
  return (
    <section className="border-y border-border bg-sage/50 py-12 sm:py-16">
      <Container>
        <Reveal>
          <SectionHeading
            eyebrow="Who it is for"
            title={"Built for businesses that put\nvehicles in other people's hands."}
            description="If you rent, lease or subscribe vehicles to riders or drivers on recurring plans, SwapNgo Fleet is designed for you."
          />
        </Reveal>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {SEGMENTS.map(({ icon: Icon, title, description }, i) => (
            <Reveal key={title} delay={(i % 4) * 70} className="rounded-2xl border border-border bg-white p-5">
              <Icon className="h-5 w-5 text-primary" aria-hidden />
              <h3 className="mt-3 text-base font-semibold text-foreground">{title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  );
}

function PricingTeaser() {
  return (
    <section className="py-12 sm:py-16">
      <Container>
        <Reveal>
          <SectionHeading
            eyebrow="Pricing"
            title={"Two ways to buy.\nPick what suits your business."}
            description="Take SwapNgo Fleet as a monthly subscription, or buy the software once."
          />
        </Reveal>
        <div className="mt-12">
          <PricingModelCards compact placement="fleet_landing" />
        </div>
        <Reveal className="mt-8 text-center">
          <Link to="/fleet-management/pricing" className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:text-primary-hover">
            Compare both models in detail
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </Reveal>
      </Container>
    </section>
  );
}

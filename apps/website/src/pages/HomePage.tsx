import { useState, type ReactNode } from "react";
import {
  ArrowRight,
  Bike,
  BatteryCharging,
  Check,
  Handshake,
  LayoutDashboard,
  ShieldCheck,
  Smartphone,
  type LucideIcon,
} from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Blob } from "@/components/ui/Blob";
import { Reveal } from "@/components/ui/Reveal";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { ScooterIllustration } from "@/components/ui/ScooterIllustration";
import { ProductShot } from "@/components/fleet/ProductShot";
import { EnquirySection } from "@/components/EnquirySection";
import { AvailabilityModal } from "@/components/AvailabilityModal";
import { GetApp } from "@/components/sections/GetApp";
import { buttonVariants } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { useBookingCta } from "@/lib/bookingCta";
import { PRE_BOOKING_MODE } from "@/content/launchMode";
import { SHOTS } from "@/content/fleetShots";
import { Link } from "@/lib/router";
import { useSiteData } from "@/lib/siteData";
import { trackEvent } from "@/lib/analytics";
import { SERVICE_CITY } from "@/content/contact";

export function HomePage() {
  return (
    <>
      <HubHero />
      <Solutions />
      <WhySwapngo />
      <GetApp />
      <EnquirySection />
    </>
  );
}

/**
 * The home page speaks to two people at once, and says so right under the
 * headline: someone who wants to RENT a scooter (EV scooter rental in
 * Chennai), and someone who wants to RENT OUT scooters (fleet management
 * software). Each gets a highlighted title, one line of proof, and a short row
 * of small actions. The picture shows both products together: the scooter,
 * and the admin dashboard that runs a fleet of them.
 *
 * Sized to fit one screen at 100% zoom on a laptop or desktop: the headline is
 * fluid, the buttons are small, and the picture is capped in width.
 *
 * The rider row behaves exactly as on the rental page: the same booking CTA
 * (pre-book modal or the app section, per launchMode) and the same live
 * availability popup.
 */
function HubHero() {
  const bookingCta = useBookingCta("home_hero");
  const [availabilityOpen, setAvailabilityOpen] = useState(false);
  // On this page "#get-app" is a section further down, so a plain anchor works;
  // pre-booking mode opens the modal instead (its onClick prevents default).
  const bookHref = PRE_BOOKING_MODE ? "#" : "#get-app";

  return (
    <section id="home" className="relative overflow-hidden bg-background">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-grid-pattern [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,black,transparent)]" />
      <Blob tone="sage" className="-right-40 -top-40 h-[42rem] w-[42rem]" />
      <Blob tone="mist" className="-bottom-48 -left-32 h-[34rem] w-[34rem]" delay="-3s" />

      <Container className="relative grid items-center gap-8 py-6 sm:py-8 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10 lg:py-10">
        {/* Phones: this block is as tall as the screen below the header (svh = with the browser bars showing). */}
        <Reveal className="max-sm:flex max-sm:min-h-[calc(100svh-7.25rem)] max-sm:flex-col max-sm:justify-center">
          <h1 className="text-balance text-[clamp(1.9rem,1rem+2.6vw,3.1rem)] font-semibold leading-[1.06] tracking-tight text-foreground max-sm:text-[2.05rem] max-[380px]:text-[1.8rem]">
            Powering Smarter <Script>Mobility</Script> &amp; Fleet Management
          </h1>
          <p className="mt-4 max-w-[34rem] text-base leading-relaxed text-muted-foreground max-[380px]:mt-3 max-[380px]:text-[15px]">
            From renting electric scooters to providing powerful fleet management technology, SwapNgo helps
            businesses and individuals move smarter.
          </p>

          <div className="mt-6 space-y-5 max-[380px]:mt-4 max-[380px]:space-y-4">
            <PathActions
              icon={Bike}
              to="/ev-scooter-rental"
              title={
                <>
                  EV scooter rental in <span className="text-primary">Chennai</span>
                </>
              }
              text="Weekly plans, unlimited kilometres and battery swapping."
            >
              <ButtonLink to={bookHref} size="sm" className="h-9 px-4 text-[13px] max-sm:h-10 max-sm:px-4 max-sm:text-sm" onClick={bookingCta.onClick}>
                {PRE_BOOKING_MODE ? "Pre-Book Now" : "Book a scooter"}
                <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </ButtonLink>
              <button
                type="button"
                onClick={() => {
                  setAvailabilityOpen(true);
                  trackEvent("check_availability", { placement: "home_hero" });
                }}
                className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-9 px-4 text-[13px] max-sm:h-10 max-sm:px-4 max-sm:text-sm")}
              >
                <Bike className="h-3.5 w-3.5 text-primary" aria-hidden />
                Check availability
              </button>
              {/* Plans and prices live on the rental page, exactly as before. */}
              <Link
                to="/ev-scooter-rental#pricing"
                onClick={() => trackEvent("click_view_rental_plans", { placement: "home_hero" })}
                className="inline-flex h-9 items-center gap-1 px-2 text-[13px] font-medium text-foreground/70 hover:text-primary max-sm:h-10 max-sm:text-sm"
              >
                View rental plans
                <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </PathActions>

            <PathActions
              dark
              icon={LayoutDashboard}
              to="/fleet-management"
              title={
                <>
                  <span className="text-primary">Fleet</span> management software
                </>
              }
              text="Rent out your own scooters and run the business on SwapNgo Fleet."
              className="border-t border-border pt-5"
            >
              <ButtonLink
                to="/fleet-management#demo"
                variant="dark"
                size="sm"
                className="h-9 px-4 text-[13px] max-sm:h-10 max-sm:px-4 max-sm:text-sm"
                onClick={() => trackEvent("click_request_demo", { placement: "home_hero" })}
              >
                Request a Demo
                <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </ButtonLink>
              <ButtonLink
                to="/fleet-management"
                variant="outline"
                size="sm"
                className="h-9 px-4 text-[13px] max-sm:h-10 max-sm:px-4 max-sm:text-sm"
                onClick={() => trackEvent("click_explore_fleet", { placement: "home_hero" })}
              >
                Explore Fleet Software
              </ButtonLink>
            </PathActions>
          </div>
        </Reveal>

        <Reveal className="relative" delay={150}>
          {/* Both products in one picture: the admin dashboard behind, the scooter in front. Width-capped so the hero fits one screen. */}
          <div className="relative mx-auto w-full max-w-[26rem] pb-16 sm:max-w-[30rem] sm:pb-20 lg:ml-auto lg:mr-0 xl:max-w-[34rem]">
            <div className="ml-auto w-[92%]">
              <ProductShot shot={SHOTS.dashboard} device="browser" showCaption={false} zoomable={false} />
            </div>
            <div className="absolute bottom-0 left-0 w-[54%]">
              <div className="relative rounded-[1.75rem] bg-gradient-to-br from-sage via-white to-mist p-2 shadow-lift ring-1 ring-border">
                <div className="overflow-hidden rounded-[1.25rem]">
                  <ScooterIllustration className="aspect-[4/3] w-full" priority />
                </div>
                <div className="absolute -top-3 left-3 flex items-center gap-1.5 rounded-xl bg-white px-2.5 py-1.5 shadow-soft ring-1 ring-border">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-mist">
                    <BatteryCharging className="h-3 w-3 text-primary" aria-hidden />
                  </span>
                  <div className="leading-tight">
                    <p className="text-[11px] font-semibold text-foreground">Battery swap</p>
                    <p className="text-[10px] text-muted-foreground">~2 min, and you're riding</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </Container>

      <AvailabilityModal
        open={availabilityOpen}
        onClose={() => setAvailabilityOpen(false)}
        bookingHref={bookHref}
        onBook={bookingCta.onClick}
      />
    </section>
  );
}

/** The handwritten accent word the site's headlines use. */
function Script({ children }: { children: ReactNode }) {
  return <span className="font-script text-[1.2em] font-normal leading-none tracking-normal text-primary">{children}</span>;
}

/** One audience: a highlighted title, one line of proof, then its small actions. */
function PathActions({
  icon: Icon,
  to,
  title,
  text,
  dark = false,
  className,
  children,
}: {
  icon: LucideIcon;
  /** The page this audience's title links to: an exact-wording internal link for search engines, and a shortcut for visitors. */
  to: string;
  title: ReactNode;
  text: string;
  dark?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      <div className="flex items-start gap-3">
        <span className={cn("mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", dark ? "bg-dark" : "bg-sage")}>
          <Icon className="h-[18px] w-[18px] text-primary" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold leading-tight text-foreground max-sm:text-xl sm:text-xl">
            <Link to={to} className="underline-offset-4 hover:underline">
              {title}
            </Link>
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground max-sm:text-[0.9375rem]">{text}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 sm:pl-12">{children}</div>
    </div>
  );
}

/**
 * The two businesses as two full rows, each with a real picture and its own
 * actions, not two identical cards: rent a scooter, and rent out scooters.
 */
function Solutions() {
  return (
    <section id="solutions" className="py-12 sm:py-16">
      <Container>
        <Reveal>
          <SectionHeading
            eyebrow="Our solutions"
            title={"Two ways Swapngo\nkeeps things moving."}
            description="One brand, two different services. Choose the one that fits what you need."
          />
        </Reveal>

        <div className="mt-12 space-y-14 lg:space-y-20">
          <SolutionRow
            icon={Bike}
            eyebrow="EV Scooter Rental in Chennai · For riders"
            title="Rent a scooter. Skip the charging."
            text="Rent an electric scooter by the week, ride without a kilometre cap, and swap the battery in about 2 minutes instead of waiting to charge. For individual riders and delivery partners in Chennai."
            points={[
              "Weekly plans with unlimited kilometres",
              "Battery swap in about 2 minutes at swap stations",
              "Verify once with KYC, then book from your phone",
              "Plans and prices shown before you pay",
            ]}
            actions={
              <>
                <ButtonLink
                  to="/ev-scooter-rental"
                  size="lg"
                  className="w-full sm:w-auto"
                  onClick={() => trackEvent("click_explore_rentals", { placement: "home_solutions" })}
                >
                  Explore Scooter Rentals
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </ButtonLink>
                <Link
                  to="/ev-scooter-rental#pricing"
                  onClick={() => trackEvent("click_view_rental_plans", { placement: "home_solutions" })}
                  className="inline-flex h-12 items-center justify-center gap-1.5 px-3 text-sm font-semibold text-foreground/80 hover:text-primary"
                >
                  View rental plans
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              </>
            }
            visual={
              <div className="relative mx-auto max-w-md">
                <div className="overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-sage via-white to-mist p-2 shadow-soft ring-1 ring-border sm:p-4">
                  <div className="overflow-hidden rounded-[1.5rem]">
                    <ScooterIllustration className="aspect-[4/3] w-full" />
                  </div>
                </div>
              </div>
            }
          />

          <SolutionRow
            reverse
            dark
            icon={LayoutDashboard}
            eyebrow="Fleet Management Software · For businesses"
            title="Rent out your scooters. Run it all on SwapNgo Fleet."
            text="The same admin web app, rider mobile app and integrated back end that run our own rental business, for companies that want to run their own fleet. For scooter, bike and car rental, vehicle leasing, delivery and logistics fleets."
            points={[
              "Rider KYC, bookings, renewals and returns",
              "Payments, refunds, deposits and GST invoices",
              "Live vehicle map and running hours, with a supported GPS tracker",
              "Staff roles, attendance, leave and rider broadcasts",
            ]}
            actions={
              <>
                <ButtonLink
                  to="/fleet-management#demo"
                  variant="dark"
                  size="lg"
                  className="w-full sm:w-auto"
                  onClick={() => trackEvent("click_request_demo", { placement: "home_solutions" })}
                >
                  Request a Demo
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </ButtonLink>
                <ButtonLink
                  to="/fleet-management"
                  variant="light"
                  size="lg"
                  className="w-full border border-border sm:w-auto"
                  onClick={() => trackEvent("click_explore_fleet", { placement: "home_solutions" })}
                >
                  Explore Fleet Software
                </ButtonLink>
                <Link
                  to="/contact?topic=fleet"
                  onClick={() => trackEvent("click_contact_for_price", { placement: "home_solutions" })}
                  className="inline-flex h-12 items-center justify-center gap-1.5 px-3 text-sm font-semibold text-foreground/80 hover:text-primary"
                >
                  Contact for price details
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              </>
            }
            visual={<ProductShot shot={SHOTS.dashboard} device="browser" />}
          />
        </div>
      </Container>
    </section>
  );
}

function SolutionRow({
  icon: Icon,
  eyebrow,
  title,
  text,
  points,
  actions,
  visual,
  reverse = false,
  dark = false,
}: {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  text: string;
  points: string[];
  actions: ReactNode;
  visual: ReactNode;
  reverse?: boolean;
  dark?: boolean;
}) {
  return (
    <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-14">
      <Reveal className={cn(reverse && "lg:order-2")}>{visual}</Reveal>
      <Reveal delay={100} className={cn(reverse && "lg:order-1")}>
        <div className="flex items-center gap-3">
          <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-[1rem]", dark ? "bg-dark" : "bg-sage")}>
            <Icon className="h-5 w-5 text-primary" aria-hidden />
          </span>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-foreground/60">{eyebrow}</p>
        </div>
        <h3 className="mt-5 text-balance text-2xl font-semibold text-foreground sm:text-3xl">{title}</h3>
        <p className="mt-3 text-base leading-relaxed text-muted-foreground">{text}</p>
        <ul className="mt-5 space-y-2.5">
          {points.map((p) => (
            <li key={p} className="flex items-start gap-2.5 text-[15px] leading-snug text-foreground/85">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
              {p}
            </li>
          ))}
        </ul>
        <div className="mt-7 flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center">{actions}</div>
      </Reveal>
    </div>
  );
}

function WhySwapngo() {
  const { stats } = useSiteData();

  const reasons = [
    {
      icon: Bike,
      title: "We run a live EV fleet",
      description: `Swapngo operates electric scooters for riders in ${SERVICE_CITY} every day, on Motovolt MVS7 scooters.`,
    },
    {
      icon: BatteryCharging,
      title: "Battery-swap know-how",
      description: "Our rentals run on a battery-swap network with Indofast Energy, so riders swap in minutes instead of waiting to charge.",
    },
    {
      icon: Smartphone,
      title: "Technology we built ourselves",
      description: "The apps, the admin console and the back end behind our rentals are our own software, built around real operations.",
    },
    {
      icon: ShieldCheck,
      title: "Verified riders, clear billing",
      description: "KYC before the first ride, GST invoices, refunds with approval and an audit trail, because we need them too.",
    },
  ];

  return (
    <section id="why" className="border-y border-border bg-mist/40 py-12 sm:py-16">
      <Container>
        <Reveal>
          <SectionHeading
            eyebrow="Why Swapngo"
            title={"We don't just sell software.\nWe run a fleet on it."}
            description="Both offerings come from the same place: running electric vehicle rentals day to day."
          />
        </Reveal>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {reasons.map(({ icon: Icon, title, description }, i) => (
            <Reveal key={title} delay={i * 80} className="rounded-3xl border border-border bg-card p-6 hover:border-primary/30 hover:shadow-card">
              <div className="flex h-11 w-11 items-center justify-center rounded-[1rem] bg-sage">
                <Icon className="h-5 w-5 text-primary" aria-hidden />
              </div>
              <h3 className="mt-5 text-base font-semibold text-foreground">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
            </Reveal>
          ))}
        </div>

        {stats.scootersTotal != null && (
          <Reveal className="mx-auto mt-10 flex max-w-xl items-center justify-center gap-3 rounded-full border border-border bg-white px-5 py-3 text-sm text-foreground/80 shadow-soft">
            <Handshake className="h-4 w-4 text-primary" aria-hidden />
            <span>
              <strong className="text-foreground">{stats.scootersTotal}+</strong> EV scooters in our fleet today.
            </span>
          </Reveal>
        )}
      </Container>
    </section>
  );
}

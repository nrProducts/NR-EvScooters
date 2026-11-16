import { ArrowRight } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Reveal } from "@/components/ui/Reveal";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Link } from "@/lib/router";
import { RIDER_SHOTS } from "@/content/fleetShots";
import { ProductShot } from "@/components/fleet/ProductShot";
import { DemoButton, FleetFinalCta, FleetPageHero } from "@/components/fleet/FleetBlocks";

const JOURNEY = [
  { title: "Sign up and set up a profile", text: "Riders sign in with their phone number (or Google) and complete a short profile." },
  { title: "Verify identity (KYC)", text: "They submit a photo, an emergency contact, their Aadhaar number and driving licence. Your team reviews them in the admin console." },
  { title: "Choose a vehicle and a plan", text: "Riders browse the vehicle models you list and pick one of the plans you have configured." },
  { title: "Pay online", text: "Payment, deposit and any onboarding charge are collected in the app through Razorpay." },
  { title: "Ride and stay supplied", text: "Riders see their vehicle and plan, and, for EV fleets using swap stations, find the nearest station with directions." },
  { title: "Renew, pay and download invoices", text: "A billing tab shows the amount due, payment history, and GST tax invoices and credit notes they can open." },
  { title: "Return and settle", text: "Riders request a return in the app, and see the settlement and deposit refund once your team has inspected the vehicle." },
  { title: "Get help", text: "Support tickets, notifications, booking history and referrals are all inside the app." },
];

const EXTRAS = [
  "Follows the phone's light or dark theme",
  "Rider privacy centre: view and raise data-rights requests, name a nominee",
  "Referral rewards that can be applied to an invoice",
  "In-app notifications, plus browser push in the web version",
  "Return lock: once a return is open, renewals and new bookings are paused so nothing is billed by mistake",
];

export function FleetRiderPage() {
  return (
    <>
      <FleetPageHero
        eyebrow="Rider mobile application"
        title="A rider mobile app that works with your fleet management software"
        description="Riders handle everything from their phone: onboarding, KYC, booking, payments, invoices, returns and support. It syncs with your admin console, so staff and riders always see the same thing. Built for Android, and available in a web browser too."
      >
        <DemoButton placement="fleet_rider_hero" />
      </FleetPageHero>

      {/* Only rendered when there are screenshots: an empty shell here was just a blank band. */}
      {RIDER_SHOTS.length > 0 && (
        <section className="pb-12 sm:pb-16">
          <Container>
            <div className="grid grid-cols-2 gap-x-5 gap-y-10 sm:grid-cols-3 lg:grid-cols-4">
              {RIDER_SHOTS.map((shot, i) => (
                <Reveal key={shot.src} delay={(i % 4) * 80}>
                  <ProductShot shot={shot} device="phone" priority={i === 0} />
                </Reveal>
              ))}
            </div>
            <p className="mt-8 text-center text-xs text-muted-foreground">
              Screenshots of the live product, shown with demonstration data.
            </p>
          </Container>
        </section>
      )}

      <section className="border-y border-border bg-mist/40 py-12 sm:py-16">
        <Container>
          <Reveal>
            <SectionHeading eyebrow="The rider journey" title={"From first sign-up\nto vehicle return."} />
          </Reveal>
          <ol className="mx-auto mt-12 grid max-w-5xl gap-4 sm:grid-cols-2">
            {JOURNEY.map((step, i) => (
              <Reveal key={step.title} delay={(i % 2) * 80} as="li" className="flex gap-4 rounded-2xl border border-border bg-card p-5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                  {i + 1}
                </span>
                <span>
                  <span className="block text-base font-semibold text-foreground">{step.title}</span>
                  <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">{step.text}</span>
                </span>
              </Reveal>
            ))}
          </ol>
        </Container>
      </section>

      <section className="py-12 sm:py-16">
        <Container className="grid items-start gap-10 lg:grid-cols-2 lg:gap-16">
          <Reveal>
            <h2 className="text-balance text-section-mobile font-semibold text-foreground sm:text-section">
              Thoughtful details riders notice
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
              The rider app has been shaped by running a live rental fleet, so the edge cases are handled.
            </p>
          </Reveal>
          <Reveal delay={100}>
            <ul className="space-y-3">
              {EXTRAS.map((e) => (
                <li key={e} className="rounded-2xl border border-border bg-card p-4 text-[15px] leading-snug text-foreground/85">
                  {e}
                </li>
              ))}
            </ul>
          </Reveal>
        </Container>
      </section>

      <section className="border-t border-border py-10">
        <Container className="flex flex-col items-center justify-between gap-4 text-center sm:flex-row sm:text-left">
          <p className="text-base font-medium text-foreground">Your team manages everything from the admin console.</p>
          <Link to="/fleet-management/admin-app" className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:text-primary-hover">
            See the admin app
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </Container>
      </section>

      <FleetFinalCta />
    </>
  );
}

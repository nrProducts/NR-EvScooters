import { Route, BatteryCharging, CalendarClock, ShieldCheck } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Reveal } from "@/components/ui/Reveal";
import { SERVICE_CITY } from "@/content/contact";

const POINTS = [
  {
    icon: Route,
    title: "Unlimited kilometres",
    description: "No per-kilometre meter running while you work. Deliver as many orders as the day gives you.",
  },
  {
    icon: BatteryCharging,
    title: "Swap, don't wait",
    description: "When the battery runs low, swap it in about 2 minutes at a swap station and keep earning.",
  },
  {
    icon: CalendarClock,
    title: "Week-to-week flexibility",
    description: "Weekly plans you renew in the app, with no long lock-in if your work changes.",
  },
  {
    icon: ShieldCheck,
    title: "Verified and set up in the app",
    description: "Complete KYC, choose a plan and pay from your phone, then pick up your scooter.",
  },
];

/**
 * A short block for delivery partners — one of the rental page's target
 * searches ("electric scooter for delivery partners Chennai"). Every point is
 * a feature of the existing plan, restated for that rider, not a new claim.
 */
export function DeliveryPartners() {
  return (
    <section id="delivery-partners" className="py-12 sm:py-16">
      <Container>
        <Reveal>
          <SectionHeading
            eyebrow="For delivery partners"
            title={"An electric scooter for\ndelivery work in " + SERVICE_CITY}
            description="Food, grocery and parcel delivery partners need a scooter that keeps working. Here is why our rentals suit a full day on the road."
          />
        </Reveal>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {POINTS.map(({ icon: Icon, title, description }, i) => (
            <Reveal key={title} delay={i * 80} className="rounded-3xl border border-border bg-card p-6 hover:border-primary/30 hover:shadow-card">
              <div className="flex h-11 w-11 items-center justify-center rounded-[1rem] bg-sage">
                <Icon className="h-5 w-5 text-primary" aria-hidden />
              </div>
              <h3 className="mt-5 text-base font-semibold text-foreground">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  );
}

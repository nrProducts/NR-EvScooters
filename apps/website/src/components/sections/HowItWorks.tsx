import { IdCard, ListChecks, CreditCard, MapPin } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";

/**
 * Order matches what's actually enforced server-side: a booking cannot be
 * created without verified KYC (requireKycVerified on POST /bookings), so
 * KYC comes before choosing a plan/paying, not after.
 */
const STEPS = [
  {
    icon: IdCard,
    title: "Verify your identity",
    description: "Complete KYC in the app — a one-time step before you can book your first ride.",
  },
  {
    icon: ListChecks,
    title: "Choose your scooter & plan",
    description: "Pick your vehicle and the rental plan that fits your riding pattern.",
  },
  {
    icon: CreditCard,
    title: "Pay & confirm",
    description: "Pay online, including a refundable security deposit, to lock in your booking.",
  },
  {
    icon: MapPin,
    title: "Pick up & ride",
    description: "Collect your scooter from your assigned station and you're on your way.",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="py-12 sm:py-16">
      <Container>
        <SectionHeading eyebrow="How It Works" title={"From signup to riding\nin four simple steps."} />

        <ol className="relative mt-16 grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
          {/* Connecting line — desktop only, sits behind the step markers. */}
          <div aria-hidden className="absolute left-0 right-0 top-7 hidden h-px bg-border lg:block" />

          {STEPS.map(({ icon: Icon, title, description }, i) => (
            <li key={title} className="relative">
              <div className="relative z-10 flex h-14 w-14 items-center justify-center rounded-2xl bg-foreground text-white shadow-lift">
                <Icon className="h-6 w-6" aria-hidden />
                <span className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground ring-4 ring-background">
                  {i + 1}
                </span>
              </div>
              <h3 className="mt-5 text-lg font-bold text-foreground">{title}</h3>
              <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">{description}</p>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  );
}

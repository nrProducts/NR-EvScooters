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
    title: "Complete KYC",
    description: "Verify your ID and driving licence in the app — a one-time step before you can book.",
  },
  {
    icon: ListChecks,
    title: "Choose a scooter & plan",
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
    <section id="how-it-works" className="py-14 sm:py-20">
      <Container>
        <SectionHeading eyebrow="How It Works" title="From sign-up to riding in four steps" />

        <ol className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(({ icon: Icon, title, description }, i) => (
            <li key={title} className="relative rounded-2xl border border-border bg-card p-6 shadow-soft">
              <span className="text-sm font-bold text-primary">{String(i + 1).padStart(2, "0")}</span>
              <div className="mt-4 flex h-11 w-11 items-center justify-center rounded-xl bg-secondary">
                <Icon className="h-5 w-5 text-primary" aria-hidden />
              </div>
              <h3 className="mt-4 text-base font-semibold text-foreground">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  );
}

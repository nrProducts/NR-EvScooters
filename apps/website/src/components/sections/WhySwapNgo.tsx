import { Wallet, Smartphone, SlidersHorizontal, ShieldCheck, LifeBuoy, BatteryCharging } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";

const REASONS = [
  {
    icon: Wallet,
    title: "Affordable EV rentals",
    description: "Transparent weekly pricing with a refundable deposit — no hidden charges.",
  },
  {
    icon: Smartphone,
    title: "Easy booking",
    description: "Choose a scooter, verify your ID, pay, and pick it up — all from your phone.",
  },
  {
    icon: SlidersHorizontal,
    title: "Flexible rental plans",
    description: "Plans are managed centrally, so pricing and duration always stay current here.",
  },
  {
    icon: BatteryCharging,
    title: "No waiting to charge",
    description: "Swap a depleted battery for a full one in about 2 minutes, at any swap station.",
  },
  {
    icon: ShieldCheck,
    title: "Verified riders only",
    description: "Every rider completes KYC before their first booking — enforced end-to-end.",
  },
  {
    icon: LifeBuoy,
    title: "Real support",
    description: "In-app support for pickup, payments, and anything that comes up mid-rental.",
  },
];

export function WhySwapngo() {
  return (
    <section id="why" className="py-20 sm:py-28">
      <Container>
        <SectionHeading eyebrow="Why Swapngo" title="Everything you need, nothing you don't" />

        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {REASONS.map(({ icon: Icon, title, description }) => (
            <div
              key={title}
              className="rounded-2xl border border-border bg-card p-6 transition-colors duration-200 hover:border-primary/40 hover:shadow-soft"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary">
                <Icon className="h-5 w-5 text-primary" aria-hidden />
              </div>
              <h3 className="mt-4 text-base font-semibold text-foreground">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}

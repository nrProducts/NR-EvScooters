import type { LucideIcon } from "lucide-react";
import { Wallet, Smartphone, SlidersHorizontal, ShieldCheck, LifeBuoy, BatteryCharging, Zap } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { cn } from "@/lib/utils";

interface Reason {
  icon: LucideIcon;
  title: string;
  description: string;
  /** Bento sizing — "lg" cards get a decorative accent and span two columns on desktop. */
  size: "lg" | "sm";
}

const REASONS: Reason[] = [
  {
    icon: Wallet,
    title: "Affordable EV rentals",
    description: "Transparent weekly pricing with a refundable deposit — no hidden charges, ever.",
    size: "lg",
  },
  {
    icon: BatteryCharging,
    title: "No waiting to charge",
    description: "Swap a depleted battery for a full one in about 2 minutes, at any swap station.",
    size: "lg",
  },
  {
    icon: Smartphone,
    title: "Easy booking",
    description: "Choose a scooter, verify your ID, pay, and pick it up — all from your phone.",
    size: "sm",
  },
  {
    icon: SlidersHorizontal,
    title: "Flexible rental plans",
    description: "Plans are managed centrally, so pricing and duration always stay current here.",
    size: "sm",
  },
  {
    icon: ShieldCheck,
    title: "Verified riders only",
    description: "Every rider completes KYC before their first booking — enforced end-to-end.",
    size: "sm",
  },
  {
    icon: LifeBuoy,
    title: "Real support",
    description: "In-app support for pickup, payments, and anything that comes up mid-rental.",
    size: "sm",
  },
];

export function WhySwapngo() {
  return (
    <section id="why" className="py-12 sm:py-16">
      <Container>
        <SectionHeading eyebrow="Why Swapngo" title={"Everything you need.\nNothing you don't."} />

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-12">
          {REASONS.map((reason) => (
            <ReasonCard key={reason.title} {...reason} />
          ))}
        </div>
      </Container>
    </section>
  );
}

function ReasonCard({ icon: Icon, title, description, size }: Reason) {
  const large = size === "lg";
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-3xl border border-border bg-card p-7 transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-card",
        large ? "lg:col-span-6 lg:min-h-[15rem]" : "lg:col-span-3 lg:min-h-[15rem]",
      )}
    >
      {large && (
        <div
          aria-hidden
          className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-primary/10 blur-2xl transition-transform duration-300 group-hover:scale-110"
        />
      )}
      <div className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-secondary">
        <Icon className="h-5 w-5 text-primary" aria-hidden />
      </div>
      <h3 className={cn("relative mt-5 font-bold text-foreground", large ? "text-xl" : "text-base")}>{title}</h3>
      <p className={cn("relative mt-2 leading-relaxed text-muted-foreground", large ? "max-w-sm text-base" : "text-sm")}>
        {description}
      </p>

      {large && (
        <div aria-hidden className="relative mt-6 flex items-center gap-1.5 opacity-70">
          {Array.from({ length: 10 }).map((_, i) => (
            <span
              key={i}
              className={cn("h-1 flex-1 rounded-full bg-primary/30", i % 3 === 0 && "bg-primary/70")}
            />
          ))}
          <Zap className="ml-1 h-4 w-4 shrink-0 text-primary" />
        </div>
      )}
    </div>
  );
}

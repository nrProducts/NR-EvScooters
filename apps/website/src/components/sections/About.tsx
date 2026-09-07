import { Leaf, Wallet, ShieldCheck } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Badge } from "@/components/ui/Badge";
import { SERVICE_CITY } from "@/content/contact";

const PILLARS = [
  { icon: Wallet, title: "Affordable", description: "Transparent weekly pricing, no fine print." },
  { icon: Leaf, title: "Sustainable", description: "Electric fleet, swappable batteries, no tailpipe." },
  { icon: ShieldCheck, title: "Reliable", description: "Every rider verified, every scooter maintained." },
];

export function About() {
  return (
    <section id="about" className="py-12 sm:py-16">
      <Container className="grid items-center gap-14 lg:grid-cols-2 lg:gap-20">
        <div>
          <Badge>About Swapngo</Badge>
          <h2 className="mt-4 text-balance text-section-mobile font-extrabold tracking-tight text-foreground sm:text-section">
            Built for the way <span className="text-primary">Chennai moves.</span>
          </h2>

          <div className="mt-6 space-y-4 text-base leading-relaxed text-muted-foreground sm:text-lg">
            <p>
              Swapngo rents electric scooters built around swappable-battery charging: instead of
              plugging in and waiting, riders swap a depleted battery for a fully charged one in
              minutes at a nearby station. It's the same idea behind our name — swap, and go.
            </p>
            <p>
              We're currently live in <strong className="text-foreground">{SERVICE_CITY}</strong>,
              running our fleet on Motovolt's MVS7 scooters in partnership with Indofast Energy's
              battery-swap network — one of the largest in the country.
            </p>
          </div>

          <div className="mt-9 grid gap-4 sm:grid-cols-3">
            {PILLARS.map(({ icon: Icon, title, description }) => (
              <div key={title} className="rounded-2xl border border-border bg-card p-5">
                <Icon className="h-5 w-5 text-primary" aria-hidden />
                <p className="mt-3 text-sm font-bold text-foreground">{title}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="relative">
          <div
            aria-hidden
            className="absolute inset-0 -z-10 rounded-[3rem] bg-gradient-to-br from-surface via-background to-secondary/60"
          />
          <div className="rounded-[2.5rem] border border-border bg-card p-8 shadow-card sm:p-10">
            <p className="text-sm font-semibold uppercase tracking-wide text-primary">Our focus</p>
            <p className="mt-4 text-2xl font-bold leading-snug text-foreground sm:text-3xl">
              Affordable rentals, a booking flow that respects your time, and vehicles that are
              actually maintained.
            </p>
            <div className="mt-8 space-y-4 border-t border-border pt-6 text-sm text-muted-foreground">
              <p>Every rider is identity-verified before their first ride.</p>
              <p>Every scooter is tracked in our fleet system.</p>
              <p>Every plan is priced transparently — no fine print.</p>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}

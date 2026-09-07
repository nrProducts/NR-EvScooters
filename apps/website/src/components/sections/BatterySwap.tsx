import { MapPin, Repeat, Zap } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Badge } from "@/components/ui/Badge";

const SWAP_STEPS = [
  { icon: MapPin, title: "Find a swap point", description: "Locate the nearest battery-swap station in the app." },
  { icon: Repeat, title: "Swap your battery", description: "Trade a depleted battery for a fully charged one — no tools, no waiting." },
  { icon: Zap, title: "Continue riding", description: "You're back on the road in about 2 minutes, full charge and all." },
];

/** Swapngo's core differentiator from a traditional plug-in-and-wait EV rental. */
export function BatterySwap() {
  return (
    <section className="relative overflow-hidden bg-dark py-16 text-white sm:py-24">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-grid-pattern opacity-[0.06]" />
      <div aria-hidden className="pointer-events-none absolute -left-32 top-1/2 h-[28rem] w-[28rem] -translate-y-1/2 rounded-full bg-primary/25 blur-[120px]" />

      <Container className="relative">
        <div className="mx-auto max-w-2xl text-center">
          <Badge tone="dark">Battery swapping</Badge>
          <h2 className="mt-4 text-balance text-section-mobile font-extrabold tracking-tight text-white sm:text-section">
            Never wait around to charge.
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-white/70">
            Swap your battery and get back on the road in minutes — at any Swapngo swap station
            across Chennai.
          </p>
        </div>

        <div className="mx-auto mt-16 grid max-w-4xl gap-8 sm:grid-cols-3">
          {SWAP_STEPS.map(({ icon: Icon, title, description }, i) => (
            <div key={title} className="relative rounded-3xl border border-white/10 bg-white/5 p-7 backdrop-blur">
              <span className="font-mono text-xs font-semibold text-primary">{String(i + 1).padStart(2, "0")}</span>
              <div className="mt-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/20">
                <Icon className="h-5 w-5 text-primary" aria-hidden />
              </div>
              <h3 className="mt-4 text-lg font-bold text-white">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-white/60">{description}</p>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}

import { Gauge, BatteryCharging, Zap } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Button } from "@/components/ui/Button";
import { ScooterIllustration } from "@/components/ui/ScooterIllustration";
import { VEHICLE_MODELS } from "@/content/vehicles";
import { ACTIVE_PLANS } from "@/content/pricing";
import { formatCurrency } from "@/lib/utils";

export function Vehicles() {
  return (
    <section id="vehicles" className="bg-surface py-20 sm:py-28">
      <Container>
        <SectionHeading
          eyebrow="Our Vehicles"
          title="Built for daily rides, real payloads"
          description="Every SwapNgo scooter runs on a swappable battery, so a low charge never means downtime."
        />

        <div className="mt-14 grid gap-8 lg:grid-cols-2">
          {VEHICLE_MODELS.map((vehicle) => {
            const plan = ACTIVE_PLANS.find((p) => p.vehicleModelId === vehicle.id);
            return (
              <article key={vehicle.id} className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
                <ScooterIllustration className="aspect-[3/2] w-full bg-surface" />
                <div className="p-6 sm:p-8">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="text-2xl font-bold text-foreground">{vehicle.name}</h3>
                    <span className="text-sm font-medium text-muted-foreground">{vehicle.vendor}</span>
                  </div>
                  <p className="mt-1 text-sm font-medium text-primary">{vehicle.tagline}</p>
                  <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{vehicle.description}</p>

                  <div className="mt-6 grid grid-cols-3 gap-3">
                    <Spec icon={Gauge} label="Range" value={`${vehicle.rangeKm} km`} />
                    <Spec icon={Zap} label="Top speed" value={`${vehicle.topSpeedKmph} km/h`} />
                    <Spec icon={BatteryCharging} label="Battery" value="Swappable" />
                  </div>

                  <ul className="mt-6 grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
                    {vehicle.features.slice(0, 6).map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                        {f}
                      </li>
                    ))}
                  </ul>

                  <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-6">
                    {plan && (
                      <p className="text-sm text-muted-foreground">
                        From <span className="text-lg font-bold text-foreground">{formatCurrency(plan.price)}</span> /{" "}
                        {plan.billingCycle}
                      </p>
                    )}
                    <Button href="#get-app" size="sm">
                      Book This Scooter
                    </Button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </Container>
    </section>
  );
}

function Spec({ icon: Icon, label, value }: { icon: typeof Gauge; label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface p-3 text-center">
      <Icon className="mx-auto h-4 w-4 text-primary" aria-hidden />
      <p className="mt-1.5 text-sm font-semibold text-foreground">{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

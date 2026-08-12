import { MapPin, Zap, Gauge, Timer } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { VEHICLE_MODELS } from "@/content/vehicles";
import { SERVICE_CITY } from "@/content/contact";

const vehicle = VEHICLE_MODELS[0];

/** Every figure here is a real, sourced fact (fleet spec or battery-station count) — no invented usage metrics. */
const STATS = [
  { icon: MapPin, value: "37+", label: `Battery-swap stations in ${SERVICE_CITY}` },
  { icon: Zap, value: "~2 min", label: "Time to swap a battery" },
  { icon: Gauge, value: `${vehicle.rangeKm} km`, label: `Range per charge (${vehicle.name})` },
  { icon: Timer, value: `${vehicle.topSpeedKmph} km/h`, label: "Top speed" },
];

export function Impact() {
  return (
    <section className="bg-primary py-16 sm:py-20">
      <Container>
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
          {STATS.map(({ icon: Icon, value, label }) => (
            <div key={label} className="text-center">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border-2 border-white/40">
                <Icon className="h-6 w-6 text-white" aria-hidden />
              </span>
              <p className="mt-4 text-2xl font-extrabold tracking-tight text-white sm:text-3xl">{value}</p>
              <p className="mt-1 text-xs font-medium text-white/80 sm:text-sm">{label}</p>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}

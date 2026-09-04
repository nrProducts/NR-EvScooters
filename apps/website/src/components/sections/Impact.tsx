import { Bike, Wifi, CircleCheck, Layers } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { useSiteData } from "@/lib/siteData";

/** Every figure here is live from GET /public/stats — real fleet numbers. */
export function Impact() {
  const { stats } = useSiteData();
  const n = (v: number | null) => (v == null ? "—" : `${v}`);

  const STATS = [
    { icon: Bike, value: n(stats.scootersTotal), label: "Scooters in the fleet" },
    { icon: Wifi, value: n(stats.scootersOnRoad), label: "On the road right now" },
    { icon: CircleCheck, value: n(stats.scootersAvailable), label: "Ready to ride today" },
    { icon: Layers, value: n(stats.activePlans), label: "Rental plans on offer" },
  ];

  return (
    <section className="bg-primary py-12 sm:py-16">
      <Container>
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-4 sm:gap-8">
          {STATS.map(({ icon: Icon, value, label }) => (
            <div key={label} className="text-center">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border-2 border-white/40">
                <Icon className="h-5 w-5 text-white" aria-hidden />
              </span>
              <p className="mt-3 text-2xl font-extrabold tracking-tight text-white sm:text-3xl">{value}</p>
              <p className="mt-1 text-xs font-medium text-white/80 sm:text-sm">{label}</p>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}

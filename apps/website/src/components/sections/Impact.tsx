import { Bike, Route, BatteryCharging, LifeBuoy } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Badge } from "@/components/ui/Badge";
import { useSiteData } from "@/lib/siteData";

/** Every numeric figure here is live from GET /public/stats — real fleet numbers, never invented. */
export function Impact() {
  const { stats } = useSiteData();

  const STATS = [
    {
      icon: Bike,
      value: stats.scootersTotal != null ? `${stats.scootersTotal}+` : "Growing",
      label: "EV scooters in the fleet",
    },
    { icon: Route, value: "Unlimited", label: "Kilometres, every plan" },
    { icon: BatteryCharging, value: "Easy", label: "Battery swapping, city-wide" },
    { icon: LifeBuoy, value: "Real", label: "Support when you need it" },
  ];

  return (
    <section className="border-y border-border bg-surface/60 py-14 sm:py-16">
      <Container>
        <Badge className="mx-auto flex w-fit">Built for everyday Chennai</Badge>

        <div className="mt-10 grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
          {STATS.map(({ icon: Icon, value, label }) => (
            <div
              key={label}
              className="rounded-2xl border border-border bg-white p-6 transition-colors duration-200 hover:border-primary/30"
            >
              <Icon className="h-5 w-5 text-primary" aria-hidden />
              <p className="mt-4 text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">{value}</p>
              <p className="mt-1.5 text-sm font-medium text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}

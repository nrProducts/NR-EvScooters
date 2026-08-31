import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Bike } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/common/EmptyState";
import { CenteredSpinner } from "@/rider/components/common";
import { useVehicleModels } from "@/rider/hooks/queries";
import { formatMoney } from "@/rider/constants/status";
import type { VehicleCategory } from "@/rider/types/api";

const CATEGORIES: { value: VehicleCategory | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "scooter", label: "Scooter" },
  { value: "bike", label: "Bike" },
  { value: "moped", label: "Moped" },
];

export default function RiderBrowseVehicles() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<VehicleCategory | "all">("all");

  const params = useMemo(
    () => ({
      pageSize: 50,
      search: search.trim() || undefined,
      category: category === "all" ? undefined : category,
    }),
    [search, category],
  );
  const { data, isLoading, isError } = useVehicleModels(params);

  return (
    <div>
      <h1 className="mb-4 text-lg font-bold">Browse scooters</h1>

      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search models…"
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {CATEGORIES.map((c) => (
          <button
            key={c.value}
            onClick={() => setCategory(c.value)}
            className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium ${
              category === c.value ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <CenteredSpinner />
      ) : isError ? (
        <EmptyState title="Couldn't load scooters" description="Please try again in a moment." />
      ) : (data?.data ?? []).length === 0 ? (
        <EmptyState title="No scooters found" icon={Bike} />
      ) : (
        <div className="space-y-3">
          {data!.data.map((m) => {
            const unavailable = m.availability.available_count === 0;
            return (
              <Card
                key={m.id}
                onClick={() => navigate(`/rider/booking/${m.id}`)}
                className="cursor-pointer overflow-hidden"
              >
                {m.image_url && (
                  <img src={m.image_url} alt="" className="h-36 w-full object-cover" />
                )}
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-bold">{m.name}</p>
                      {m.vendor?.name && <p className="text-xs text-muted-foreground">{m.vendor.name}</p>}
                    </div>
                    <Badge variant={unavailable ? "muted" : "success"}>
                      {unavailable ? "Unavailable" : `${m.availability.available_count} free`}
                    </Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                    {m.starting_price != null && <span>from {formatMoney(m.starting_price)}</span>}
                    {m.battery_range_km != null && <span>{m.battery_range_km} km range</span>}
                    {m.top_speed_kmph != null && <span>{m.top_speed_kmph} km/h</span>}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

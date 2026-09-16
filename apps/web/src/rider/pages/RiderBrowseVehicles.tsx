import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Bike, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
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
            className={`shrink-0 rounded-xl border px-3.5 py-2 text-xs font-bold ${
              category === c.value ? "border-primary bg-primary/10 text-primary" : "border-border text-foreground"
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
              <button
                key={m.id}
                onClick={() => navigate(`/rider/booking/${m.id}`)}
                className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-3 text-left"
              >
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-secondary">
                  {m.image_url && (
                    <img src={m.image_url} alt="" className="h-full w-full object-contain" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-extrabold">{m.name}</p>
                    <Badge variant={unavailable ? "muted" : "success"} className="shrink-0">
                      {unavailable ? "Unavailable" : `${m.availability.available_count} free`}
                    </Badge>
                  </div>
                  {m.vendor?.name && (
                    <p className="mb-1 truncate text-[11px] font-medium text-muted-foreground">{m.vendor.name}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                    {m.starting_price != null && (
                      <span className="text-xs font-extrabold text-primary">from {formatMoney(m.starting_price)}</span>
                    )}
                    {m.battery_range_km != null && (
                      <span className="text-[11px] text-muted-foreground">{m.battery_range_km} km range</span>
                    )}
                    {m.top_speed_kmph != null && (
                      <span className="text-[11px] text-muted-foreground">{m.top_speed_kmph} km/h</span>
                    )}
                  </div>
                </div>

                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

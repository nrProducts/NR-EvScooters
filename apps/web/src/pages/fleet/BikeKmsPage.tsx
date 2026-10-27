import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { DataTable, type DataTableColumn } from "@/components/common/DataTable";
import { SearchBar } from "@/components/common/SearchBar";
import { StatusBadge } from "@/components/common/StatusBadge";
import { TrackingStatusPanel } from "@/components/fleet/TrackingStatusPanel";
import { useBikeKms, useFleetTelemetry } from "@/hooks/useTelematics";
import { usePageSubtitle } from "@/hooks/usePageSubtitle";
import { cn, formatFullDateTime } from "@/lib/utils";
import type { BikeKms } from "@/services/api/telematics";

type Range = "km_today" | "km_7d" | "km_30d";
type Row = BikeKms & { id: string };

const RANGES: { key: Range; label: string }[] = [
  { key: "km_today", label: "Today" },
  { key: "km_7d", label: "Last 7 days" },
  { key: "km_30d", label: "Last 30 days" },
];

const km = (n: number) => `${n.toLocaleString("en-IN", { maximumFractionDigits: 1 })} km`;

/**
 * How far every bike has gone. Figures come from the trackers' odometers via
 * Intellicar, stored per bike per day and refreshed every couple of hours —
 * so "Today" can lag by up to that long. Admin console only.
 */
export default function BikeKmsPage() {
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch } = useBikeKms();
  // Total odometer comes from the live readings, not the per-day table.
  const { data: fleet } = useFleetTelemetry();
  const odometerByVehicle = useMemo(() => new Map((fleet ?? []).map((t) => [t.vehicle_id, t.odometer_km])), [fleet]);
  const [range, setRange] = useState<Range>("km_7d");
  const [search, setSearch] = useState("");

  const rows: Row[] = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (data ?? [])
      .filter((b) => !term || `${b.vehicle.registration_number} ${b.vehicle.name ?? ""} ${b.vehicle.model ?? ""}`.toLowerCase().includes(term))
      .map((b) => ({ ...b, id: b.vehicle.id }))
      .sort((a, b) => b[range] - a[range] || a.vehicle.registration_number.localeCompare(b.vehicle.registration_number));
  }, [data, range, search]);

  const totals = useMemo(() => {
    const all = data ?? [];
    return {
      today: all.reduce((s, b) => s + b.km_today, 0),
      d7: all.reduce((s, b) => s + b.km_7d, 0),
      d30: all.reduce((s, b) => s + b.km_30d, 0),
      moved: all.filter((b) => b.km_today > 0).length,
      bikes: all.length,
    };
  }, [data]);

  const lastUpdated = useMemo(
    () => (data ?? []).map((b) => b.updated_at).filter((x): x is string => !!x).sort().pop() ?? null,
    [data],
  );

  usePageSubtitle(`${totals.bikes} bikes · ${km(totals.today)} today · ${totals.moved} moved`);

  const columns: DataTableColumn<Row>[] = [
    {
      header: "Bike",
      key: "bike",
      render: (b) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{b.vehicle.name ?? b.vehicle.registration_number}</p>
          <p className="truncate text-xs text-muted-foreground">
            {b.vehicle.registration_number}{b.vehicle.model ? ` · ${b.vehicle.model}` : ""}
          </p>
        </div>
      ),
    },
    { header: "Status", key: "status", hideOnMobile: true, render: (b) => <StatusBadge status={b.vehicle.status} /> },
    {
      header: "Odometer (total)",
      key: "odometer",
      render: (b) => {
        const o = odometerByVehicle.get(b.vehicle.id);
        return o === null || o === undefined
          ? <span className="text-muted-foreground">—</span>
          : <span className="tabular-nums">{km(o)}</span>;
      },
    },
    ...RANGES.map((r): DataTableColumn<Row> => ({
      header: r.label,
      key: r.key,
      render: (b) => (
        <span className={cn("tabular-nums", range === r.key ? "font-semibold" : "text-muted-foreground", b[r.key] === 0 && "opacity-60")}>
          {km(b[r.key])}
        </span>
      ),
    })),
  ];

  return (
    <div className="space-y-4 animate-fade-in">
      <TrackingStatusPanel />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Fleet today", value: km(totals.today) },
          { label: "Fleet · 7 days", value: km(totals.d7) },
          { label: "Fleet · 30 days", value: km(totals.d30) },
          { label: "Bikes moved today", value: `${totals.moved} of ${totals.bikes}` },
        ].map((t) => (
          <Card key={t.label} className="p-3.5">
            <p className="text-[0.6875rem] uppercase tracking-wide text-muted-foreground">{t.label}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">{isLoading ? "—" : t.value}</p>
          </Card>
        ))}
      </div>

      <Card>
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Rank by</span>
            <div className="inline-flex rounded-lg bg-secondary p-1">
              {RANGES.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  aria-pressed={range === r.key}
                  onClick={() => setRange(r.key)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm font-medium transition-smooth",
                    range === r.key ? "bg-card text-primary shadow-soft" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          <SearchBar value={search} onChange={setSearch} placeholder="Search bike, plate or model…" className="sm:max-w-xs" />
        </div>

        <DataTable
          columns={columns}
          data={rows}
          isLoading={isLoading}
          isError={isError}
          onRetry={() => refetch()}
          onRowClick={(b) => navigate(`/vehicles/${b.vehicle.id}`)}
          emptyTitle="No bikes match"
        />
      </Card>

      <p className="text-xs text-muted-foreground">
        From the bikes&apos; trackers, refreshed about every 2 hours
        {lastUpdated ? ` · last update ${formatFullDateTime(lastUpdated)}` : " · no readings yet — bikes show 0 km until tracking is switched on"}.
        &ldquo;Last 7 days&rdquo; is today and the 6 days before.
      </p>
    </div>
  );
}

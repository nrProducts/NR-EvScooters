import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bike, CalendarDays, CalendarRange, Route } from "lucide-react";
import { Card } from "@/components/ui/card";
import { DataTable, type DataTableColumn } from "@/components/common/DataTable";
import { Pagination } from "@/components/common/Pagination";
import { SearchBar } from "@/components/common/SearchBar";
import { StatusBadge } from "@/components/common/StatusBadge";
import { FleetAllowanceCard } from "@/components/fleet/FleetAllowanceCard";
import { TrackingStatusPanel } from "@/components/fleet/TrackingStatusPanel";
import { useFleetAllowance } from "@/hooks/useFleetAllowance";
import { useBikeKms, useFleetTelemetry } from "@/hooks/useTelematics";
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

const PAGE_SIZE = 8;

/**
 * How far every bike has gone — the "Bike KMs" view of the Vehicles screen.
 * Figures come from the trackers' odometers via Intellicar, stored per bike per
 * day and refreshed every couple of hours, so "Today" can lag by up to that
 * long. Admin console only.
 */
export function BikeKmsView() {
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch } = useBikeKms();
  // Total odometer comes from the live readings, not the per-day table.
  const { data: fleet } = useFleetTelemetry();
  const odometerByVehicle = useMemo(() => new Map((fleet ?? []).map((t) => [t.vehicle_id, t.odometer_km])), [fleet]);
  // This month's usage per bike, for the allowance column.
  const { data: allowance } = useFleetAllowance();
  const allowanceByVehicle = useMemo(() => new Map((allowance?.vehicles ?? []).map((v) => [v.id, v])), [allowance]);
  const [range, setRange] = useState<Range>("km_7d");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const allRows: Row[] = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (data ?? [])
      .filter((b) => !term || [
        b.vehicle.registration_number, b.vehicle.name, b.vehicle.model, b.current_rider?.full_name, b.current_rider?.phone,
      ].filter(Boolean).join(" ").toLowerCase().includes(term))
      .map((b) => ({ ...b, id: b.vehicle.id }))
      .sort((a, b) => b[range] - a[range] || a.vehicle.registration_number.localeCompare(b.vehicle.registration_number));
  }, [data, range, search]);

  // Paged in the browser: the whole fleet is one small list, already loaded.
  const lastPage = Math.max(1, Math.ceil(allRows.length / PAGE_SIZE));
  const safePage = Math.min(page, lastPage);
  const rows = allRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

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
    {
      header: "Assigned to",
      key: "assigned",
      render: (b) => (b.current_rider ? (
        <div className="min-w-0">
          <p className="truncate font-medium">{b.current_rider.full_name}</p>
          {b.current_rider.phone ? <p className="truncate text-xs text-muted-foreground">{b.current_rider.phone}</p> : null}
        </div>
      ) : <span className="text-muted-foreground">Unassigned</span>),
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
    {
      // This month's usage against each bike's allowance — the same figures that add up
      // to the fleet allowance card above.
      header: "This month (limit)",
      key: "allowance",
      render: (b) => {
        const a = allowanceByVehicle.get(b.vehicle.id);
        if (!a) return <span className="text-muted-foreground">—</span>;
        if (a.state === "awaiting_start") return <span className="text-xs text-muted-foreground">Awaiting start reading</span>;
        if (a.state === "no_odometer" || a.state === "no_closing") return <span className="text-xs text-muted-foreground">Not tracked</span>;
        if (a.state === "not_started") return <span className="text-xs text-muted-foreground">Not started</span>;
        const tone = a.percent_of_limit >= 100 ? "bg-destructive" : a.percent_of_limit >= 85 ? "bg-warning" : "bg-primary";
        return (
          <div className="min-w-[9rem]">
            <p className="text-sm tabular-nums">
              <span className={cn("font-semibold", a.percent_of_limit >= 100 && "text-destructive")}>{km(a.used_km)}</span>
              <span className="text-muted-foreground"> / {a.limit_km.toLocaleString("en-IN", { maximumFractionDigits: 1 })}</span>
            </p>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
              <div className={cn("h-full rounded-full", tone)} style={{ width: `${Math.min(100, a.percent_of_limit)}%` }} />
            </div>
          </div>
        );
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
    <div className="space-y-4">
      {/* Four headline numbers, each with its own icon. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Fleet today", value: km(totals.today), icon: Route },
          { label: "Last 7 days", value: km(totals.d7), icon: CalendarRange },
          { label: "Last 30 days", value: km(totals.d30), icon: CalendarDays },
          { label: "Bikes moved today", value: `${totals.moved} of ${totals.bikes}`, icon: Bike, bar: totals.bikes > 0 ? (totals.moved / totals.bikes) * 100 : 0 },
        ].map((tile) => (
          <Card key={tile.label} className="flex items-center gap-3 p-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <tile.icon className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground">{tile.label}</p>
              <p className="truncate text-xl font-bold tabular-nums">{isLoading ? "—" : tile.value}</p>
              {"bar" in tile ? (
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${tile.bar}%` }} />
                </div>
              ) : null}
            </div>
          </Card>
        ))}
      </div>

      {/* This month's allowance (wide) beside how fresh the data is (narrow). */}
      <div className="grid gap-4 lg:grid-cols-3">
        <FleetAllowanceCard variant="panel" className="lg:col-span-2" />
        <TrackingStatusPanel variant="stacked" />
      </div>

      <Card>
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <h3 className="text-sm font-semibold">Distance by bike <span className="font-normal text-muted-foreground">· {allRows.length}</span></h3>
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Rank by</span>
            <div className="inline-flex rounded-lg bg-secondary p-1">
              {RANGES.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  aria-pressed={range === r.key}
                  onClick={() => { setRange(r.key); setPage(1); }}
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
          <SearchBar value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search bike, plate, model or rider…" className="sm:max-w-xs" />
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

        {!isLoading && !isError && allRows.length > 0 && (
          <Pagination page={safePage} pageSize={PAGE_SIZE} total={allRows.length} onPageChange={setPage} />
        )}
      </Card>

      <p className="text-xs text-muted-foreground">
        From the bikes&apos; trackers, refreshed about every 2 hours
        {lastUpdated ? ` · last update ${formatFullDateTime(lastUpdated)}` : " · no readings yet — bikes show 0 km until tracking is switched on"}.
        &ldquo;Last 7 days&rdquo; is today and the 6 days before.
      </p>
    </div>
  );
}

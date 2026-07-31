import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Search, CheckCircle2, Loader2, Bike } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import * as vehiclesApi from "@/services/api/vehicles";
import { ApiError } from "@/services/api/httpClient";
import { cn } from "@/lib/utils";

/**
 * The inverted sibling of AssignRiderPalette — the rider is fixed, staff
 * search/pick an available vehicle instead. Shared by the maintenance
 * "issue a temp vehicle" and "reassign after scrap" flows, each just wiring
 * a different async onAssign + copy, so there isn't a near-duplicate second
 * spotlight picker.
 */
export function AssignVehicleToRiderPalette({
  open,
  riderName,
  title,
  subtitle,
  onOpenChange,
  onAssign,
}: {
  open: boolean;
  riderName: string;
  title: string;
  subtitle?: string;
  onOpenChange: (open: boolean) => void;
  /** Should throw (e.g. let a react-query mutateAsync rejection propagate) on failure. */
  onAssign: (vehicleId: string) => Promise<unknown>;
}) {
  const [value, setValue] = useState("");
  const [term, setTerm] = useState("");
  const [assignedName, setAssignedName] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setTerm(value), 300);
    return () => clearTimeout(t);
  }, [value]);

  useEffect(() => {
    if (!open) {
      setValue("");
      setTerm("");
      setAssignedName(null);
      setPendingId(null);
      setError(null);
    }
  }, [open]);

  const enabled = open && term.trim().length >= 2;
  const { data, isFetching } = useQuery({
    queryKey: ["assign-vehicle-search", term],
    queryFn: () => vehiclesApi.fetchVehicles({ search: term, status: "available", pageSize: 8 }),
    enabled,
  });
  const vehicles = data?.data ?? [];

  async function handlePick(vehicleId: string, vehicleName: string) {
    if (pendingId) return;
    setError(null);
    setPendingId(vehicleId);
    try {
      await onAssign(vehicleId);
      setAssignedName(vehicleName);
      setTimeout(() => onOpenChange(false), 900);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not assign this vehicle.");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-lg">
        <AnimatePresence mode="wait">
          {assignedName ? (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center gap-3 px-6 py-14 text-center"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 400, damping: 18 }}
                className="flex h-14 w-14 items-center justify-center rounded-full bg-success/15 text-success"
              >
                <CheckCircle2 className="h-8 w-8" />
              </motion.div>
              <p className="font-medium">{assignedName} assigned to {riderName}</p>
            </motion.div>
          ) : (
            <motion.div key="search" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                <Bike className="h-4 w-4 shrink-0 text-primary" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{title}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {subtitle ?? `For ${riderName}`}
                  </p>
                </div>
              </div>

              <div className="relative border-b border-border">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  autoFocus
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="Type a vehicle name, registration or VIN…"
                  className="h-12 rounded-none border-0 pl-11 focus-visible:ring-0"
                />
              </div>

              <div className="max-h-80 overflow-y-auto scrollbar-thin p-2">
                {!enabled && (
                  <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                    Keep typing… (2+ characters)
                  </p>
                )}

                {enabled && isFetching && (
                  <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…
                  </div>
                )}

                {enabled && !isFetching && vehicles.length === 0 && (
                  <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                    No available vehicles match "{term}".
                  </p>
                )}

                {enabled &&
                  !isFetching &&
                  vehicles.map((v) => {
                    const pendingThis = pendingId === v.id;
                    return (
                      <button
                        key={v.id}
                        disabled={!!pendingId}
                        onClick={() => handlePick(v.id, v.name)}
                        className={cn(
                          "flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-smooth",
                          "hover:bg-card-hover disabled:cursor-not-allowed disabled:opacity-50",
                        )}
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{v.name}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {v.registration_number} · {v.battery_percentage}% battery
                          </span>
                        </span>
                        {pendingThis ? (
                          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
                        ) : (
                          <span className="shrink-0 text-[11px] font-medium text-primary">Assign</span>
                        )}
                      </button>
                    );
                  })}
              </div>

              {error && (
                <p className="mx-4 mb-3 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}

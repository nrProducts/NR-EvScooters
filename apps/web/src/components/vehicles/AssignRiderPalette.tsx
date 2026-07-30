import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Search, CheckCircle2, Loader2, Zap } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAssignVehicleToUser } from "@/hooks/useVehicles";
import * as usersApi from "@/services/api/users";
import { ApiError } from "@/services/api/httpClient";
import { cn } from "@/lib/utils";
import type { Vehicle } from "@/types";

/**
 * A spotlight-style rider picker instead of a plain "assign" form/dropdown —
 * type a name, click a rider, done. Only KYC-verified riders are searchable
 * here, since the backend would reject handing a vehicle to anyone else.
 */
export function AssignRiderPalette({
  vehicle,
  onOpenChange,
}: {
  vehicle: Vehicle | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [value, setValue] = useState("");
  const [term, setTerm] = useState("");
  const [assignedName, setAssignedName] = useState<string | null>(null);
  const assign = useAssignVehicleToUser();

  useEffect(() => {
    const t = setTimeout(() => setTerm(value), 300);
    return () => clearTimeout(t);
  }, [value]);

  useEffect(() => {
    if (!vehicle) {
      setValue("");
      setTerm("");
      setAssignedName(null);
      assign.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicle]);

  const enabled = !!vehicle && term.trim().length >= 2;
  const { data, isFetching } = useQuery({
    queryKey: ["assign-rider-search", term],
    queryFn: () => usersApi.fetchUsers({ search: term, role: "rider", kycStatus: "verified", pageSize: 8 }),
    enabled,
  });
  const riders = data?.data ?? [];

  function handlePick(riderId: string, riderName: string) {
    if (!vehicle || assign.isPending) return;
    assign.mutate(
      { id: vehicle.id, userId: riderId },
      {
        onSuccess: () => {
          setAssignedName(riderName);
          setTimeout(() => onOpenChange(false), 900);
        },
      },
    );
  }

  return (
    <Dialog open={!!vehicle} onOpenChange={onOpenChange}>
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
              <p className="font-medium">{vehicle?.name} handed to {assignedName}</p>
              <p className="text-xs text-muted-foreground">Vehicle status is now "assigned".</p>
            </motion.div>
          ) : (
            <motion.div key="search" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                <Zap className="h-4 w-4 shrink-0 text-primary" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">Assign {vehicle?.name}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{vehicle?.registration_number}</p>
                </div>
              </div>

              <div className="relative border-b border-border">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  autoFocus
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="Type a rider's name, email or phone…"
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

                {enabled && !isFetching && riders.length === 0 && (
                  <p className="px-3 py-6 text-center text-xs text-muted-foreground">No riders match "{term}".</p>
                )}

                {enabled &&
                  !isFetching &&
                  riders.map((r) => {
                    const pendingThis = assign.isPending && assign.variables?.userId === r.id;
                    return (
                      <button
                        key={r.id}
                        disabled={assign.isPending}
                        onClick={() => handlePick(r.id, r.full_name)}
                        className={cn(
                          "flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-smooth",
                          "hover:bg-card-hover disabled:cursor-not-allowed disabled:opacity-50",
                        )}
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{r.full_name}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {r.email ?? r.phone ?? "—"}
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

              {assign.isError && (
                <p className="mx-4 mb-3 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {assign.error instanceof ApiError ? assign.error.message : "Could not assign this vehicle."}
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}

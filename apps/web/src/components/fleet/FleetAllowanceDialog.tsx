import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/common/Spinner";
import { useUpdateFleetAllowance } from "@/hooks/useFleetAllowance";
import { ApiError } from "@/services/api/httpClient";
import { toastError, toastSuccess } from "@/lib/toastHelpers";
import type { AllowanceSummary } from "@/services/api/fleetAllowance";

const MAX_DAYS = 93;

const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

const km = (n: number) => `${n.toLocaleString("en-IN", { maximumFractionDigits: 1 })} km`;

/**
 * Admin-only editor for the fleet kilometre allowance: the per-bike limit, and
 * the start and end dates of the "month" it applies to. The fleet's limit is the
 * per-bike limit times the number of bikes, so it follows the fleet as bikes
 * are added or retired.
 */
export function FleetAllowanceDialog({
  open, onOpenChange, summary,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  summary: AllowanceSummary | undefined;
}) {
  const update = useUpdateFleetAllowance();
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [perBike, setPerBike] = useState("");

  useEffect(() => {
    if (open && summary) {
      setStart(summary.settings.period_start);
      setEnd(summary.settings.period_end);
      setPerBike(String(summary.settings.km_per_vehicle));
      update.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const bikes = summary?.totals.vehicle_count ?? 0;
  const perBikeNum = Number(perBike);
  const validNumber = perBike.trim() !== "" && Number.isFinite(perBikeNum) && perBikeNum > 0 && perBikeNum <= 100_000;
  const validDates = !!start && !!end && daysBetween(start, end) >= 0 && daysBetween(start, end) < MAX_DAYS;
  const days = start && end && daysBetween(start, end) >= 0 ? daysBetween(start, end) + 1 : null;

  let problem: string | null = null;
  if (start && end && daysBetween(start, end) < 0) problem = "The period must end on or after the day it starts.";
  else if (start && end && daysBetween(start, end) >= MAX_DAYS) problem = `A period can be at most ${MAX_DAYS} days.`;
  else if (perBike.trim() !== "" && !validNumber) problem = "Enter kilometres per bike between 1 and 100,000.";

  const changed = !!summary && (
    start !== summary.settings.period_start || end !== summary.settings.period_end || perBikeNum !== summary.settings.km_per_vehicle
  );
  const startChanged = !!summary && start !== summary.settings.period_start;

  const submit = () => {
    update.mutate(
      { period_start: start, period_end: end, km_per_vehicle: perBikeNum },
      {
        onSuccess: () => { toastSuccess("Fleet allowance updated"); onOpenChange(false); },
        onError: (err) => toastError(err, "Could not update the allowance"),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Fleet kilometre allowance</DialogTitle>
          <DialogDescription>
            The kilometres each bike may do in one month, and the dates that month runs. The fleet limit is the
            per-bike figure times the number of bikes.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="al-start">Month starts</Label>
              <Input id="al-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="al-end">Month ends (inclusive)</Label>
              <Input id="al-end" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="al-km">Kilometres per bike</Label>
            <Input
              id="al-km"
              type="number"
              min={1}
              step="any"
              inputMode="decimal"
              value={perBike}
              onChange={(e) => setPerBike(e.target.value)}
            />
          </div>

          <div className="rounded-lg bg-secondary/50 p-3 text-sm">
            {validNumber && bikes > 0 ? (
              <>
                <p className="font-medium">
                  Fleet limit = {km(perBikeNum)} × {bikes} bike{bikes === 1 ? "" : "s"} = {km(perBikeNum * bikes)}
                </p>
                {days !== null ? <p className="text-xs text-muted-foreground">Over {days} day{days === 1 ? "" : "s"}.</p> : null}
              </>
            ) : (
              <p className="text-muted-foreground">Enter the per-bike kilometres to see the fleet limit.</p>
            )}
          </div>

          {startChanged ? (
            <p className="text-xs text-muted-foreground">
              Changing the start date re-reads each bike&apos;s odometer for the new month. It takes a minute or two
              after you save; until then the usage shows as 0 for those bikes.
            </p>
          ) : null}

          {problem ? <p className="text-xs text-destructive">{problem}</p> : null}
          {update.isError ? (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {update.error instanceof ApiError ? update.error.message : "Something went wrong."}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!validDates || !validNumber || !changed || update.isPending} onClick={submit}>
            {update.isPending && <Spinner className="h-4 w-4" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

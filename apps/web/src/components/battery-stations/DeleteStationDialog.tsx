import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/common/Spinner";
import { formatStationName, type BatteryStation } from "@/types/batteryStation";

/**
 * Not the shared ConfirmDialog: deleting a station has a consequence the
 * admin must read (it vanishes from every rider's map) and a reassurance they
 * deserve (the record is kept), so the copy is specific rather than generic.
 */
export function DeleteStationDialog({
  station,
  onOpenChange,
  onConfirm,
  isPending,
}: {
  station: BatteryStation | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (station: BatteryStation) => void;
  isPending: boolean;
}) {
  return (
    <Dialog open={!!station} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {station ? formatStationName(station.name) : "station"}?</DialogTitle>
          <DialogDescription>
            This removes the station from the rider map immediately. The record is kept for reporting and can be
            restored by an engineer, but riders will no longer see or navigate to it.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={() => station && onConfirm(station)} disabled={isPending}>
            {isPending && <Spinner className="h-4 w-4" />}
            Delete station
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

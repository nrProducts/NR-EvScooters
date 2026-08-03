import { Copy } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { BatteryStationMapPicker } from "./BatteryStationMapPicker";
import { useToastStore } from "@/store/toastStore";
import { formatCoordinate } from "@/lib/mapConfig";
import { formatStationName, type BatteryStation } from "@/types/batteryStation";

/** Read-only "View station on map" — the same MapLibre view as the picker. */
export function StationMapPreviewDialog({
  station,
  onOpenChange,
}: {
  station: BatteryStation | null;
  onOpenChange: (open: boolean) => void;
}) {
  const push = useToastStore((s) => s.push);

  const coordinates = station ? `${formatCoordinate(station.latitude)}, ${formatCoordinate(station.longitude)}` : "";

  const copyCoordinates = async () => {
    try {
      await navigator.clipboard.writeText(coordinates);
      push({ tone: "success", title: "Copied", message: `${coordinates} copied to the clipboard.` });
    } catch {
      // Clipboard access is permission-gated and blocked outside secure
      // contexts; the coordinates are on screen either way.
      push({ tone: "warning", title: "Copy blocked", message: "Your browser blocked clipboard access." });
    }
  };

  return (
    <Dialog open={!!station} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{station ? formatStationName(station.name) : "Station"}</DialogTitle>
          <DialogDescription>Serial #{station?.serialNumber} · {station?.qisIds.join(", ")}</DialogDescription>
        </DialogHeader>

        {station && (
          <div className="space-y-3">
            <BatteryStationMapPicker
              value={{ latitude: station.latitude, longitude: station.longitude }}
              onChange={() => {}}
              readOnly
              heightClassName="h-80"
            />
            <div className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2">
              <span className="select-all font-mono text-sm">{coordinates}</span>
              <Button variant="outline" size="sm" onClick={copyCoordinates}>
                <Copy className="h-4 w-4" /> Copy
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

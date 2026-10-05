import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  PERIOD_PRESET_LABEL, rangeForPreset, type DateRange, type PeriodPreset,
} from "@/lib/period";
import type { RevenueGranularity } from "@/services/api/revenue";

export interface PeriodState {
  preset: PeriodPreset;
  range: DateRange;
  granularity: RevenueGranularity | "auto";
}

const PRESETS: PeriodPreset[] = [
  "today", "yesterday", "this_week", "last_week",
  "this_month", "last_month", "this_quarter", "this_year", "last_year", "custom",
];

/** Preset + custom-range + granularity control for the Revenue screen. */
export function PeriodPicker({
  value,
  onChange,
  showGranularity = true,
}: {
  value: PeriodState;
  onChange: (next: PeriodState) => void;
  showGranularity?: boolean;
}) {
  const setPreset = (preset: PeriodPreset) => {
    if (preset === "custom") {
      onChange({ ...value, preset });
      return;
    }
    onChange({ ...value, preset, range: rangeForPreset(preset) });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={value.preset} onValueChange={(v) => setPreset(v as PeriodPreset)}>
        <SelectTrigger className="w-full sm:w-40"><SelectValue /></SelectTrigger>
        <SelectContent>
          {PRESETS.map((p) => (
            <SelectItem key={p} value={p}>{PERIOD_PRESET_LABEL[p]}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {value.preset === "custom" && (
        <div className="flex items-center gap-2">
          <Input
            type="date"
            className="w-full sm:w-40"
            value={value.range.from}
            max={value.range.to}
            onChange={(e) => onChange({ ...value, range: { ...value.range, from: e.target.value } })}
          />
          <span className="text-xs text-muted-foreground">to</span>
          <Input
            type="date"
            className="w-full sm:w-40"
            value={value.range.to}
            min={value.range.from}
            onChange={(e) => onChange({ ...value, range: { ...value.range, to: e.target.value } })}
          />
        </div>
      )}

      {showGranularity && (
        <Select
          value={value.granularity}
          onValueChange={(v) => onChange({ ...value, granularity: v as PeriodState["granularity"] })}
        >
          <SelectTrigger className="w-full sm:w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">Auto</SelectItem>
            <SelectItem value="daily">Daily</SelectItem>
            <SelectItem value="weekly">Weekly</SelectItem>
            <SelectItem value="monthly">Monthly</SelectItem>
            <SelectItem value="yearly">Yearly</SelectItem>
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

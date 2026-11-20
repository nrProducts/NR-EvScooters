import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCycleTime } from "@/lib/utils";

/** The current IST date (`YYYY-MM-DD`) and minutes past midnight. */
function istNow(): { date: string; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(d);
}

function describeGap(mins: number) {
  const abs = Math.abs(mins);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  const span = [h ? `${h} h` : "", m ? `${m} m` : ""].filter(Boolean).join(" ");
  return mins < 0 ? `${span} earlier than the pickup time` : `${span} later than the pickup time`;
}

interface Props {
  /** `HH:MM` when staff chose a time; null = bill at the confirmation moment (default). */
  value: string | null;
  onChange: (value: string | null) => void;
  /** Plan length, to show when the first payment falls due. Null before a plan is known. */
  durationDays: number | null;
}

/**
 * The optional billing time on Confirm pickup. Only the payment clock moves —
 * the recorded pickup time is always the real handover moment. Leaving it on
 * "Time of confirmation" behaves exactly as before.
 */
export function PickupBillingTimePicker({ value, onChange, durationDays }: Props) {
  // Re-read the clock every 30s so the default preview and the gap stay honest
  // while the dialog sits open.
  const [now, setNow] = useState(istNow);
  useEffect(() => {
    const id = window.setInterval(() => setNow(istNow()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const nowHHMM = `${String(Math.floor(now.minutes / 60)).padStart(2, "0")}:${String(now.minutes % 60).padStart(2, "0")}`;
  const chosen = value ?? nowHHMM;
  const [ch, cm] = chosen.split(":").map(Number);
  const gap = ch * 60 + cm - now.minutes;
  const dueDay = durationDays ? addDays(now.date, durationDays) : null;

  return (
    <div className="space-y-2 rounded-lg border border-border px-3 py-2.5">
      <Label className="text-sm">Billing time</Label>
      <label className="flex items-center gap-2 text-sm">
        <input type="radio" name="billing-time" checked={value === null} onChange={() => onChange(null)} />
        Time of confirmation <span className="text-xs text-muted-foreground">(as today)</span>
      </label>
      <label className="flex flex-wrap items-center gap-2 text-sm">
        <input type="radio" name="billing-time" checked={value !== null} onChange={() => onChange(nowHHMM)} />
        Set a time
        <Input
          type="time" step={60} className="h-8 w-32"
          value={value ?? ""} disabled={value === null}
          onChange={(e) => onChange(e.target.value || nowHHMM)}
        />
      </label>
      <p className="text-xs text-muted-foreground">
        {dueDay ? <>First payment due: <span className="font-medium text-foreground">{dueDay}, {formatCycleTime(chosen)}</span></> : null}
        {value !== null && gap !== 0 && <> · {describeGap(gap)}</>}
        {value === null && <> · the exact minute you confirm</>}
      </p>
      {value !== null && (
        <p className="text-xs text-muted-foreground">
          The pickup is still recorded at the real time; only when payments fall due changes.
        </p>
      )}
    </div>
  );
}

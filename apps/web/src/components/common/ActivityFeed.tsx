import { Battery, BatteryCharging, ShieldAlert, UserCheck, CalendarClock, Bike } from "lucide-react";
import type { ActivityEvent } from "@/types";
import { timeAgo } from "@/lib/utils";
import { cn } from "@/lib/utils";

const ICONS: Record<ActivityEvent["type"], typeof Bike> = {
  ride: Bike,
  battery: Battery,
  charging: BatteryCharging,
  kyc: UserCheck,
  booking: CalendarClock,
  alert: ShieldAlert,
};

const TONE: Record<ActivityEvent["type"], string> = {
  ride: "bg-primary/10 text-primary",
  battery: "bg-warning/15 text-warning-foreground",
  charging: "bg-success/10 text-success",
  kyc: "bg-accent text-accent-foreground",
  booking: "bg-secondary text-secondary-foreground",
  alert: "bg-destructive/10 text-destructive",
};

export function ActivityFeed({ events }: { events: ActivityEvent[] }) {
  if (events.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No recent activity.</p>;
  }
  return (
    <div className="space-y-4">
      {events.map((event) => {
        const Icon = ICONS[event.type];
        return (
          <div key={event.id} className="flex items-start gap-3">
            <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full", TONE[event.type])}>
              <Icon className="h-4 w-4" />
            </div>
            <div className="flex-1">
              <p className="text-sm">{event.message}</p>
              <p className="text-xs text-muted-foreground">{timeAgo(event.timestamp)}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

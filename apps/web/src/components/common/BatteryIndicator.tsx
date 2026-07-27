import { Battery, BatteryLow, BatteryWarning } from "lucide-react";
import { cn } from "@/lib/utils";

export function BatteryIndicator({ percent, className }: { percent: number; className?: string }) {
  const Icon = percent < 20 ? BatteryWarning : percent < 50 ? BatteryLow : Battery;
  const color = percent < 20 ? "text-destructive" : percent < 50 ? "text-warning-foreground" : "text-success";
  return (
    <div className={cn("flex items-center gap-1.5 text-sm font-medium", color, className)}>
      <Icon className="h-4 w-4" />
      {percent}%
    </div>
  );
}

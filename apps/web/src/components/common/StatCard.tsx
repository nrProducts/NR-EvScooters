import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { CardContent } from "@/components/ui/card";
import { MotionCard } from "@/components/motion/MotionCard";
import { cn } from "@/lib/utils";

export interface StatCardProps {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  trend?: { value: number; positive?: boolean };
  tone?: "default" | "success" | "warning" | "destructive" | "info";
}

const toneClasses: Record<NonNullable<StatCardProps["tone"]>, string> = {
  default: "bg-primary/10 text-primary",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  destructive: "bg-destructive/10 text-destructive",
  info: "bg-info/10 text-info",
};

export function StatCard({ label, value, icon: Icon, trend, tone = "default" }: StatCardProps) {
  return (
    <MotionCard className="bg-card/80 backdrop-blur-sm">
      <CardContent className="flex items-center justify-between gap-2 p-3">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="truncate text-[11px] font-medium text-muted-foreground">{label}</span>
          <span className="text-lg font-semibold tracking-tight">{value}</span>
          {trend && (
            <span
              className={cn(
                "flex items-center gap-0.5 text-[11px] font-medium",
                trend.positive ? "text-success" : "text-destructive",
              )}
            >
              {trend.positive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
              {trend.value}%
            </span>
          )}
        </div>
        {Icon && (
          <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", toneClasses[tone])}>
            <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
          </div>
        )}
      </CardContent>
    </MotionCard>
  );
}

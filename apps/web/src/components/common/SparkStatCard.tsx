import { AreaChart, Area, ResponsiveContainer } from "recharts";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { CardContent } from "@/components/ui/card";
import { MotionCard } from "@/components/motion/MotionCard";
import { cn } from "@/lib/utils";

export interface SparkStatCardProps {
  label: string;
  value: string;
  /** Chronological values (oldest first) — the last two drive the trend badge. Real series only, never fabricated. */
  points: number[];
  tone?: "success" | "warning" | "info" | "default";
}

const strokeByTone: Record<NonNullable<SparkStatCardProps["tone"]>, string> = {
  default: "hsl(var(--primary))",
  success: "hsl(var(--success))",
  warning: "hsl(var(--warning))",
  info: "hsl(var(--info))",
};

/** Compact "value + real month-over-month trend + sparkline" card — no fabricated deltas: omits the badge if there isn't enough history. */
export function SparkStatCard({ label, value, points, tone = "default" }: SparkStatCardProps) {
  const last = points.at(-1);
  const prev = points.at(-2);
  const trend = last !== undefined && prev !== undefined && prev !== 0 ? ((last - prev) / prev) * 100 : null;
  const color = strokeByTone[tone];
  const data = points.map((v, i) => ({ i, v }));

  return (
    <MotionCard className="bg-card/80 backdrop-blur-sm">
      <CardContent className="space-y-2 p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[0.6875rem] font-medium text-muted-foreground">{label}</span>
          {trend !== null && (
            <span
              className={cn(
                "flex shrink-0 items-center gap-0.5 text-[0.6875rem] font-medium",
                trend >= 0 ? "text-success" : "text-destructive",
              )}
            >
              {trend >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
              {Math.abs(trend).toFixed(1)}%
            </span>
          )}
        </div>
        <span className="block text-lg font-semibold tracking-tight">{value}</span>
        {data.length >= 2 && (
          <div className="h-8 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id={`spark-${label}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.75} fill={`url(#spark-${label})`} dot={false} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </MotionCard>
  );
}

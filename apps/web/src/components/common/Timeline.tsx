import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface TimelineItem {
  id: string;
  title: ReactNode;
  timestamp: string;
  description?: ReactNode;
  tone?: "default" | "success" | "warning" | "destructive";
}

const dotTone: Record<NonNullable<TimelineItem["tone"]>, string> = {
  default: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  destructive: "bg-destructive",
};

export function Timeline({ items }: { items: TimelineItem[] }) {
  return (
    <ol className="relative space-y-5 border-l border-border pl-5">
      {items.map((item) => (
        <li key={item.id} className="relative">
          <span
            className={cn(
              "absolute -left-[1.5625rem] top-1 h-2.5 w-2.5 rounded-full ring-4 ring-background",
              dotTone[item.tone ?? "default"],
            )}
          />
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <p className="text-sm font-medium">{item.title}</p>
            <span className="text-xs text-muted-foreground">{item.timestamp}</span>
          </div>
          {item.description && <p className="mt-0.5 text-xs text-muted-foreground">{item.description}</p>}
        </li>
      ))}
    </ol>
  );
}

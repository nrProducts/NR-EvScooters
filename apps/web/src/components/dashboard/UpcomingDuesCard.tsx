import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useUsers } from "@/hooks/useUsers";
import { cn, formatCurrency, formatCycleTime, formatDate, initials } from "@/lib/utils";

/** Whole calendar days from today (IST) to a period end: negative = overdue, 0 = today. */
function daysUntil(dueAt: string): number {
  const today = new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);
  return Math.round((Date.parse(dueAt.slice(0, 10)) - Date.parse(today)) / 86_400_000);
}

function dueChip(days: number): { text: string; tone: string } {
  if (days < 0) return { text: days === -1 ? "Overdue 1 day" : `Overdue ${-days} days`, tone: "bg-destructive/10 text-destructive" };
  if (days === 0) return { text: "Due today", tone: "bg-warning/15 text-warning" };
  return { text: days === 1 ? "In 1 day" : `In ${days} days`, tone: "bg-primary/10 text-primary" };
}

/**
 * Riders whose plan period ends within the next three days, or already has,
 * soonest first — the same "due" buckets as the Users screen's Due filter, so the
 * list and that screen agree. A short list on purpose: the Users screen has the
 * full one, a click away.
 */
export function UpcomingDuesCard({ className, rows: maxRows = 4 }: { className?: string; rows?: number }) {
  const { data, isLoading } = useUsers({
    role: "rider",
    due: ["overdue", "today", "d1", "d2", "d3"],
    page: 1,
    pageSize: Math.max(12, maxRows * 2),
  });
  const shown = (data?.data ?? [])
    .filter((u) => u.next_due_at && u.picked_up)
    .sort((a, b) => Date.parse(a.next_due_at!) - Date.parse(b.next_due_at!))
    .slice(0, maxRows);
  const total = data?.total ?? 0;

  return (
    <Card className={cn("flex flex-col p-4", className)}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">
          Upcoming dues
          {!isLoading && total > 0 ? <span className="ml-1.5 font-normal text-muted-foreground">· {total}</span> : null}
        </h3>
        <Link to="/users" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
          View all <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {isLoading ? (
        <div className="space-y-2 pt-2">
          {Array.from({ length: maxRows }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
        </div>
      ) : shown.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">No riders are due in the next 3 days.</p>
      ) : (
        <ul className="divide-y divide-border">
          {shown.map((u) => {
            const chip = dueChip(daysUntil(u.next_due_at!));
            return (
              <li key={u.id}>
                <Link to={`/users/${u.id}`} className="flex items-center gap-3 py-2 outline-none hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[0.6875rem] font-semibold text-primary">
                    {initials(u.full_name || "?")}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.8125rem] font-medium leading-tight">{u.full_name || "Unnamed rider"}</span>
                    <span className="block truncate text-[0.6875rem] text-muted-foreground">
                      {u.current_plan?.name ?? "No plan"} · {formatDate(u.next_due_at!)}, {formatCycleTime(u.cycle_time)}
                      {u.outstanding_amount > 0 ? ` · owes ${formatCurrency(u.outstanding_amount)}` : ""}
                    </span>
                  </span>
                  <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[0.625rem] font-semibold", chip.tone)}>{chip.text}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

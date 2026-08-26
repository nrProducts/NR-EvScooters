import { cn } from "@/lib/utils";
import type { ReturnStageStatus } from "@/types";

const STEPS = ["Return Requested", "Inspection", "Charges", "Payment", "Complete Return"] as const;

/**
 * Maps every ReturnStageStatus onto one of the five steps — `rejected` has
 * no step of its own (it's a terminal exit, not a stage in this sequence),
 * so it's rendered by the caller as a distinct badge instead of by this
 * stepper at all.
 */
function stepIndexFor(status: ReturnStageStatus): number {
  switch (status) {
    case "return_requested": return 0;
    case "payment_required": return 2;
    case "payment_submitted": return 3;
    case "ready_for_approval": return 3;
    case "return_completed": return 4;
    default: return 0;
  }
}

export function ReturnStageStepper({ status }: { status: ReturnStageStatus }) {
  const current = stepIndexFor(status);

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto">
      {STEPS.map((label, i) => (
        <div key={label} className="flex items-center gap-1.5">
          <div
            className={cn(
              "whitespace-nowrap rounded-full px-2.5 py-1 text-[0.6875rem] font-semibold",
              i < current && "bg-success/10 text-success",
              i === current && "bg-primary/10 text-primary",
              i > current && "bg-muted text-muted-foreground",
            )}
          >
            {label}
          </div>
          {i < STEPS.length - 1 && <span className="text-muted-foreground/50">→</span>}
        </div>
      ))}
    </div>
  );
}

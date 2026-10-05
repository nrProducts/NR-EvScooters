import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * In-body page header — a strong title, an optional one-line description, and a
 * right-aligned actions slot (primary action in brand green, secondary as
 * outline). Most list screens still publish their title/subtitle to the global
 * top bar via `usePageSubtitle`; this is for pages that also want a header
 * block in the content column (per the SwapNgo spec §3), and as the single
 * place detail pages get their back-button + title treatment.
 *
 * Purely presentational — no data, no store. Compose it, don't fork it.
 */
export function PageHeader({
  title,
  description,
  actions,
  leading,
  className,
}: {
  title?: ReactNode;
  description?: ReactNode;
  /** Right-aligned controls — buttons, filters, export. */
  actions?: ReactNode;
  /** Left of the title — typically a ghost back button on detail pages. */
  leading?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between", className)}>
      <div className="flex min-w-0 items-start gap-3">
        {leading}
        {(title || description) && (
          <div className="min-w-0 space-y-1">
            {title && (
              <h1 className="truncate text-xl font-semibold tracking-tight text-foreground">{title}</h1>
            )}
            {description && <p className="text-sm text-muted-foreground">{description}</p>}
          </div>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

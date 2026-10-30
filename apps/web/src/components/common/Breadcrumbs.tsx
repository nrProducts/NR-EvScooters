import type { MouseEvent } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { MAX_VISIBLE_CRUMBS, type Crumb } from "@/lib/navTrail";
import { useGoToCrumb } from "@/hooks/useNavTrail";
import { cn } from "@/lib/utils";

const Separator = () => <ChevronRight aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />;

/**
 * The trail of pages that led here (Rental Operations › Priya S › TN22AB0005),
 * drawn in the header on detail pages. Each crumb is a real link, so
 * open-in-new-tab and copy-link work, but a plain click steps back through
 * history instead, which returns the list with its tab, filters and page as
 * they were. See lib/navTrail.ts.
 */
export function Breadcrumbs({ trail, className }: { trail: Crumb[]; className?: string }) {
  const goToCrumb = useGoToCrumb();

  // Long chains of cross-links keep the section they started from and the
  // last two steps; the ones between fold into a menu.
  const overflow = trail.length > MAX_VISIBLE_CRUMBS;
  const hidden = overflow ? trail.slice(1, trail.length - 2) : [];
  const tail = overflow ? trail.slice(trail.length - 2) : trail.slice(1);

  const onCrumbClick = (e: MouseEvent, crumb: Crumb) => {
    // Modified clicks (new tab/window) go to the browser as usual.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    goToCrumb(crumb);
  };

  const renderCrumb = (crumb: Crumb, isCurrent: boolean) =>
    isCurrent ? (
      <span aria-current="page" className="block truncate font-semibold text-foreground" title={crumb.label}>
        {crumb.label}
      </span>
    ) : (
      <Link
        to={crumb.to}
        onClick={(e) => onCrumbClick(e, crumb)}
        className="block truncate rounded-sm font-medium text-muted-foreground outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
        title={crumb.label}
      >
        {crumb.label}
      </Link>
    );

  return (
    <nav aria-label="Breadcrumb" className={cn("min-w-0", className)}>
      <ol className="flex min-w-0 items-center gap-1 text-sm">
        <li className="min-w-0 shrink-[2]">{renderCrumb(trail[0], trail.length === 1)}</li>

        {overflow && (
          <li className="flex shrink-0 items-center gap-1">
            <Separator />
            <DropdownMenu>
              <DropdownMenuTrigger
                className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Show ${hidden.length} more pages`}
              >
                <MoreHorizontal className="h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {hidden.map((crumb, i) => (
                  <DropdownMenuItem key={`${crumb.to}-${i}`} onClick={() => goToCrumb(crumb)}>
                    {crumb.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </li>
        )}

        {tail.map((crumb, i) => {
          const isCurrent = i === tail.length - 1;
          return (
            <li key={`${crumb.to}-${i}`} className={cn("flex min-w-0 items-center gap-1", isCurrent ? "shrink" : "shrink-[2]")}>
              <Separator />
              {renderCrumb(crumb, isCurrent)}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

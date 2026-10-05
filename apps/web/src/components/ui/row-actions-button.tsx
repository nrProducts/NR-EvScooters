import * as React from "react";
import { MoreHorizontal } from "lucide-react";
import { Button } from "./button";
import { DropdownMenuTrigger } from "./dropdown-menu";
import { Tooltip, TooltipTrigger, TooltipContent } from "./tooltip";

export interface RowActionsButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Tooltip / accessible name for the trigger. Defaults to "Row actions". */
  label?: string;
}

/**
 * The "⋯" trigger used to open a row-actions dropdown in grids. Renders the
 * ghost icon button, a consistent hover tooltip, and the `DropdownMenuTrigger`
 * wiring in one place. Must be rendered inside a `<DropdownMenu>`, with the
 * matching `<DropdownMenuContent>` as its sibling.
 */
export const RowActionsButton = React.forwardRef<HTMLButtonElement, RowActionsButtonProps>(
  ({ label = "Row actions", ...props }, ref) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <DropdownMenuTrigger asChild>
          <Button ref={ref} variant="ghost" size="icon" aria-label={label} {...props}>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  ),
);
RowActionsButton.displayName = "RowActionsButton";

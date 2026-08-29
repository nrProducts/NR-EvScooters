import * as React from "react";
import { Button, type ButtonProps } from "./button";
import { Tooltip, TooltipTrigger, TooltipContent } from "./tooltip";

export interface IconButtonProps extends ButtonProps {
  /** Describes the action. Used as the hover tooltip and the accessible name. */
  label: string;
  /** Which side the tooltip appears on. Defaults to "top". */
  tooltipSide?: "top" | "right" | "bottom" | "left";
}

/**
 * An icon-only button with a consistent, always-present tooltip. Use this
 * anywhere a control has no visible text label (grid row actions, header
 * controls, collapsed sidebar items, etc.) so every icon explains itself on
 * hover and to screen readers.
 */
export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ label, tooltipSide = "top", size = "icon", ...props }, ref) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button ref={ref} size={size} aria-label={label} {...props} />
      </TooltipTrigger>
      <TooltipContent side={tooltipSide}>{label}</TooltipContent>
    </Tooltip>
  ),
);
IconButton.displayName = "IconButton";

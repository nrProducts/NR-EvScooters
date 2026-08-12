import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary-hover shadow-soft",
        outline: "border border-border bg-transparent hover:bg-secondary",
        ghost: "hover:bg-secondary",
        light: "bg-white text-foreground hover:bg-secondary shadow-soft",
        /** Black pill CTA — for use on colored/full-bleed backgrounds. */
        dark: "bg-foreground text-white hover:bg-foreground/85 shadow-soft",
      },
      size: {
        default: "h-11 px-5",
        lg: "h-12 px-6 text-base",
        sm: "h-9 px-4 text-xs",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.AnchorHTMLAttributes<HTMLAnchorElement>,
    VariantProps<typeof buttonVariants> {
  href: string;
}

/** Every CTA on this site navigates (anchor, mailto, tel, or external app) — no client-side router needed for a one-page site. */
export const Button = React.forwardRef<HTMLAnchorElement, ButtonProps>(
  ({ className, variant, size, href, ...props }, ref) => (
    <a ref={ref} href={href} className={cn(buttonVariants({ variant, size, className }))} {...props} />
  ),
);
Button.displayName = "Button";

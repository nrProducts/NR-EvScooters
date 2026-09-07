import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-glow hover:-translate-y-0.5 hover:bg-primary-hover",
        outline: "border border-border bg-transparent text-foreground hover:-translate-y-0.5 hover:border-foreground/30 hover:bg-secondary/60",
        ghost: "text-foreground hover:bg-secondary/60",
        light: "bg-white text-foreground shadow-soft hover:-translate-y-0.5 hover:bg-secondary",
        /** For colored/dark full-bleed backgrounds. */
        dark: "bg-foreground text-white hover:-translate-y-0.5 hover:bg-foreground/85",
        /** Outline tuned for dark backgrounds (e.g. the closing CTA section). */
        "outline-dark": "border border-white/25 bg-white/5 text-white backdrop-blur hover:-translate-y-0.5 hover:border-white/40 hover:bg-white/10",
      },
      size: {
        default: "h-11 px-5 text-sm",
        lg: "h-14 px-7 text-base",
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

import type { ComponentProps } from "react";
import type { VariantProps } from "class-variance-authority";
import { buttonVariants } from "@/components/ui/Button";
import { Link } from "@/lib/router";
import { cn } from "@/lib/utils";

type ButtonLinkProps = Omit<ComponentProps<typeof Link>, "className"> &
  VariantProps<typeof buttonVariants> & { className?: string };

/** The site's pill button, as an internal (router) link — for CTAs that go to another page on this site. */
export function ButtonLink({ variant, size, className, ...props }: ButtonLinkProps) {
  return <Link className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

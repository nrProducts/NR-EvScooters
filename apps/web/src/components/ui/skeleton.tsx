import { cn } from "@/lib/utils";

// Brand-tinted pulse instead of the generic gray block — same shape, same
// zero-JS CSS animation, just SwapNgo green instead of a neutral color.
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("animate-pulse rounded-md bg-primary/10", className)} {...props} />;
}

export { Skeleton };

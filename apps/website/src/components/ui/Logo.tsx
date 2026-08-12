import logoWordmark from "@/assets/logo-wordmark.png";
import { cn } from "@/lib/utils";

/** The real SwapNgo wordmark, supplied by the team — see apps/website/src/assets/logo-wordmark.png. */
export function Logo({ className }: { className?: string }) {
  return (
    <img
      src={logoWordmark}
      alt="SwapNgo"
      className={cn("h-7 w-auto sm:h-8", className)}
    />
  );
}

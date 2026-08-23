import logoWordmark from "@/assets/logo-wordmark.svg";
import { cn } from "@/lib/utils";

/**
 * The approved Swapngo wordmark (`src/assets/logo-wordmark.svg`).
 * This is the tagline-free lockup — the full "SWAP. RIDE. GO GREEN." version
 * lives on the OG cover and app splash, where it is large enough to read.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <img
      src={logoWordmark}
      alt="Swapngo"
      className={cn("h-7 w-auto sm:h-8", className)}
    />
  );
}

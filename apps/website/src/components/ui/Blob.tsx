import { cn } from "@/lib/utils";

/**
 * A soft out-of-focus colour field used behind hero/CTA compositions. Always
 * decorative: absolutely positioned by the caller, non-interactive, and
 * heavily blurred so it reads as ambient light rather than a shape.
 *
 * The drift is `motion-safe:` only — with reduced motion it sits still.
 */
export function Blob({
  className,
  tone = "sage",
  delay,
}: {
  className?: string;
  tone?: "sage" | "mist" | "primary";
  /** Offsets the 6s drift so neighbouring blobs don't rise and fall in lockstep. */
  delay?: string;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute rounded-full opacity-60 blur-3xl motion-safe:animate-blob",
        tone === "sage" && "bg-sage",
        tone === "mist" && "bg-mist",
        tone === "primary" && "bg-primary/20",
        className,
      )}
      style={delay ? { animationDelay: delay } : undefined}
    />
  );
}

import { cn } from "@/lib/utils";

/**
 * SwapNgo's inline loading indicator — a clean rotating ring (track + one
 * highlighted arc), the same shape used throughout the brand's loading
 * mockups. Drop-in replacement for lucide's `Loader2`: pass the same
 * `h-4 w-4`-style sizing via `className`, or a `size` in pixels.
 *
 * Pure CSS animation (Tailwind's `animate-spin`) on an inline SVG — no new
 * dependency, same footprint as the icon it replaces.
 */
export function Spinner({ className, size }: { className?: string; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={cn("animate-spin text-current", className)}
      style={size ? { height: size, width: size } : undefined}
      role="status"
      aria-label="Loading"
    >
      <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeOpacity="0.15" strokeWidth="2.25" />
      <path
        d="M21.5 12a9.5 9.5 0 0 0-9.5-9.5"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
      />
    </svg>
  );
}

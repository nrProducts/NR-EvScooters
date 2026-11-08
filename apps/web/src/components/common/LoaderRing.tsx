import { useBrandLogos } from "@/hooks/useBrandLogos";
import { cn } from "@/lib/utils";

/**
 * The brand's loading mark: a rotating ring around the real SwapNgo logo.
 * Used full-screen by BrandedLoader and inside a grid by DataTable, so every
 * wait in the console looks the same.
 */
export function LoaderRing({ size = "lg", className }: { size?: "sm" | "lg"; className?: string }) {
  const { mark: logoMark } = useBrandLogos();
  return (
    <div
      className={cn(
        "relative flex items-center justify-center",
        size === "lg" ? "h-28 w-28" : "h-16 w-16",
        className,
      )}
    >
      <svg viewBox="0 0 100 100" fill="none" className="absolute inset-0 h-full w-full animate-[spin_1.6s_linear_infinite]">
        <circle cx="50" cy="50" r="44" stroke="hsl(var(--primary))" strokeOpacity="0.12" strokeWidth="5" />
        <path d="M50 6a44 44 0 0 1 44 44" stroke="hsl(var(--primary))" strokeWidth="5" strokeLinecap="round" />
        <circle cx="94" cy="50" r="4.5" fill="hsl(var(--primary))" />
      </svg>
      <img
        src={logoMark}
        alt=""
        className={cn("animate-pulse", size === "lg" ? "h-11 w-11" : "h-7 w-7")}
        style={{ animationDuration: "2s" }}
      />
    </div>
  );
}

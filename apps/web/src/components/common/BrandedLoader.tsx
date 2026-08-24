import logoMark from "@/assets/logo-mark.svg";

/**
 * Loading overlay — a translucent light-gray wash over whatever is already
 * on screen (fixed, full viewport, so the real page stays visible and in
 * place underneath rather than being replaced by blank space), with a
 * rotating ring around the actual SwapNgo mark, a message, and three
 * staggered pulsing dots centered on top. Matches the brand's own
 * loading-screen mockups rather than a generic spinner.
 *
 * The ring is one SVG with a CSS animation; the mark is the app's real logo
 * asset (already used in the sidebar), not a redrawn approximation of it.
 */
export function BrandedLoader({ label = "Loading…", subtitle }: { label?: string; subtitle?: string }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-muted/40 backdrop-blur-[2px]">
      <div className="relative flex h-28 w-28 items-center justify-center">
        <svg viewBox="0 0 100 100" fill="none" className="absolute inset-0 h-full w-full animate-[spin_1.6s_linear_infinite]">
          <circle cx="50" cy="50" r="44" stroke="hsl(var(--primary))" strokeOpacity="0.12" strokeWidth="5" />
          <path
            d="M50 6a44 44 0 0 1 44 44"
            stroke="hsl(var(--primary))"
            strokeWidth="5"
            strokeLinecap="round"
          />
          <circle cx="94" cy="50" r="4.5" fill="hsl(var(--primary))" />
        </svg>
        <img src={logoMark} alt="" className="h-11 w-11 animate-pulse" style={{ animationDuration: "2s" }} />
      </div>

      <div className="flex flex-col items-center gap-1 text-center">
        <p className="text-sm font-semibold text-foreground">{label}</p>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-1.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-2 w-2 animate-[loader-dot_1.2s_ease-in-out_infinite] rounded-full bg-primary"
            style={{ animationDelay: `${i * 0.2}s` }}
          />
        ))}
      </div>
    </div>
  );
}

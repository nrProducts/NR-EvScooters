import { LoaderRing } from "./LoaderRing";

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
      <LoaderRing />

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

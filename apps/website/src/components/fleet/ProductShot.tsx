import { useEffect, useState } from "react";
import { Maximize2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Shot } from "@/content/fleetShots";

/**
 * A screenshot in a light device frame. `browser` for the admin console,
 * `phone` for the rider app. Images load lazily unless `priority` (the one
 * above the fold), and carry their real dimensions so nothing jumps.
 *
 * Screenshots are shown small in the page layout, where the console's text is
 * not readable, so each one opens full size on click (`zoomable`, on by
 * default). The enlarged view is the same file: nothing extra is downloaded
 * until it is opened except what the browser already cached.
 */
export function ProductShot({
  shot,
  device,
  priority = false,
  className,
  showCaption = true,
  zoomable = true,
}: {
  shot: Shot;
  device: "browser" | "phone";
  priority?: boolean;
  className?: string;
  showCaption?: boolean;
  zoomable?: boolean;
}) {
  const [open, setOpen] = useState(false);

  // While enlarged: Escape closes, and the page behind does not scroll.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  const img = (
    <img
      src={shot.src}
      alt={shot.alt}
      width={shot.width}
      height={shot.height}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      {...(priority ? { fetchPriority: "high" as const } : {})}
      className="block h-auto w-full"
    />
  );

  // The picture itself becomes the control, with a small "enlarge" cue in the corner.
  const content = zoomable ? (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label={`Enlarge screenshot: ${shot.caption}`}
      className="group relative block w-full cursor-zoom-in text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
    >
      {img}
      <span
        aria-hidden
        className="absolute bottom-3 right-3 inline-flex h-8 w-8 items-center justify-center rounded-full bg-foreground/80 text-white opacity-0 shadow-soft transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 max-md:opacity-100"
      >
        <Maximize2 className="h-4 w-4" />
      </span>
    </button>
  ) : (
    img
  );

  return (
    <figure className={cn("m-0", className)}>
      {device === "browser" ? (
        <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-lift">
          <div className="flex items-center gap-1.5 border-b border-border bg-muted px-3.5 py-2.5" aria-hidden>
            <span className="h-2.5 w-2.5 rounded-full bg-foreground/15" />
            <span className="h-2.5 w-2.5 rounded-full bg-foreground/15" />
            <span className="h-2.5 w-2.5 rounded-full bg-foreground/15" />
          </div>
          {content}
        </div>
      ) : (
        <div className="mx-auto w-full max-w-[17rem] rounded-[2.4rem] border-[7px] border-foreground bg-foreground shadow-lift">
          <div className="overflow-hidden rounded-[1.8rem] bg-white">{content}</div>
        </div>
      )}
      {showCaption && (
        <figcaption className="mt-3 text-center text-sm leading-snug text-muted-foreground">
          {shot.caption}
        </figcaption>
      )}

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={shot.caption}
          className="fixed inset-0 z-[100] flex flex-col bg-near-black/85 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="flex shrink-0 items-center justify-between gap-4 px-4 py-3 text-white sm:px-6">
            <p className="min-w-0 truncate text-sm font-medium sm:text-base">{shot.caption}</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          {/* Scrolls inside the overlay when the image is taller than the screen. */}
          <div
            className="min-h-0 flex-1 overflow-auto px-4 pb-6 sm:px-6"
            onClick={(e) => {
              if (e.target === e.currentTarget) setOpen(false);
            }}
          >
            <img
              src={shot.src}
              alt={shot.alt}
              width={shot.width}
              height={shot.height}
              className={cn(
                "mx-auto h-auto rounded-xl bg-white shadow-lift",
                device === "phone" ? "max-w-[22rem]" : "w-full max-w-[1440px]",
              )}
            />
          </div>
        </div>
      )}
    </figure>
  );
}

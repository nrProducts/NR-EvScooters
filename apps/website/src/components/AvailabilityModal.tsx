import { useEffect, type MouseEvent } from "react";
import { Bike, X } from "lucide-react";
import { useSiteData } from "@/lib/siteData";
import { PRE_BOOKING_MODE } from "@/content/launchMode";

/**
 * A small popup that shows the live count of bookable scooters, read from the
 * fleet stats SiteDataProvider already loaded (GET /public/stats) — no fetch of
 * its own. Opened by the hero's "Check availability" button.
 */
export function AvailabilityModal({
  open,
  onClose,
  bookingHref,
  onBook,
}: {
  open: boolean;
  onClose: () => void;
  bookingHref: string;
  onBook: (e: MouseEvent<HTMLAnchorElement>) => void;
}) {
  const { stats, plansStatus, live } = useSiteData();

  // Close on Escape, and lock background scroll while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  const available = stats.scootersAvailable;
  const loading = !live && plansStatus !== "error";
  const hasCount = available != null && available > 0;

  let headline: string;
  let sub: string;
  if (loading) {
    headline = "Checking…";
    sub = "Fetching the latest fleet availability.";
  } else if (hasCount) {
    headline = `${available} available`;
    sub = `${available} scooter${available === 1 ? "" : "s"} ready to book right now.`;
  } else if (available === 0) {
    headline = PRE_BOOKING_MODE ? "Launching soon" : "All out right now";
    sub = PRE_BOOKING_MODE
      ? "Pre-book today and we'll reserve one for you."
      : "Every scooter is on the road — book to grab the next one.";
  } else {
    headline = "Can't check right now";
    sub = "Please try again in a moment.";
  }

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-[100] flex items-end justify-center bg-near-black/60 backdrop-blur-sm sm:items-center sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="availability-title"
        className="relative w-full rounded-t-3xl border border-border bg-card p-6 text-center sm:max-w-sm sm:rounded-3xl sm:p-8"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>

        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-sage">
          <Bike className="h-6 w-6 text-primary" aria-hidden />
        </div>

        <h3 id="availability-title" className="mt-4 text-2xl font-semibold text-foreground">
          {headline}
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{sub}</p>

        {hasCount ? (
          <a
            href={bookingHref}
            onClick={(e) => {
              onBook(e);
              onClose();
            }}
            className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-soft hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            Book a scooter
          </a>
        ) : (
          <button
            type="button"
            onClick={onClose}
            className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-full border border-border bg-white px-6 text-sm font-semibold text-foreground shadow-soft hover:bg-sage focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            Close
          </button>
        )}
      </div>
    </div>
  );
}

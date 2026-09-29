import type { MouseEvent } from "react";
import { PRE_BOOKING_MODE } from "@/content/launchMode";
import { trackEvent } from "@/lib/analytics";
import { usePreBookModal } from "@/lib/preBookModal";

interface BookingCta {
  href: string;
  onClick: (e: MouseEvent<HTMLAnchorElement>) => void;
}

/**
 * What a "Book"-style CTA actually does, decided in ONE place
 * (content/launchMode.ts) rather than at each of the half-dozen call sites.
 * Each site keeps its own label/markup — this only ever returns behaviour —
 * so flipping PRE_BOOKING_MODE back is the entire revert.
 */
export function useBookingCta(placement: string): BookingCta {
  const { openModal } = usePreBookModal();

  if (PRE_BOOKING_MODE) {
    return {
      href: "#",
      onClick: (e) => {
        e.preventDefault();
        trackEvent("click_pre_book", { placement });
        openModal();
      },
    };
  }

  return {
    href: "#get-app",
    onClick: () => trackEvent("click_book_now", { placement }),
  };
}

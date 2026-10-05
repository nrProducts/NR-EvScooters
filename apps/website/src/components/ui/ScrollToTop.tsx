import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";

/** How far down the page before the button appears — matches the header's own "scrolled" threshold-ish feel, but larger: this is for a long scroll back, not a hairline. */
const SHOW_AFTER_PX = 480;

/**
 * Fixed bottom-right FAB, one per page (mounted once in App.tsx, not per
 * section) — appears once there's meaningfully far to scroll back, and
 * smooth-scrolls to the very top on tap. Sits above the mobile menu's own
 * z-40 panel but never needs to coexist with it: the menu locks body scroll
 * while open, so this button's own scroll-position visibility freezes too.
 */
export function ScrollToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > SHOW_AFTER_PX);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const scrollToTop = () => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
  };

  return (
    <button
      type="button"
      onClick={scrollToTop}
      aria-label="Scroll to top"
      tabIndex={visible ? 0 : -1}
      className={cn(
        "fixed bottom-6 right-4 z-30 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-soft transition-all duration-300 hover:bg-primary-hover sm:bottom-8 sm:right-8",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0",
      )}
    >
      <ArrowUp className="h-5 w-5" aria-hidden />
    </button>
  );
}

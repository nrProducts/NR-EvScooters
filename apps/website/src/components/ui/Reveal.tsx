import { useEffect, useRef, useState, type ElementType, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Fades and lifts its children into place once they enter the viewport.
 *
 * Reveals once and then disconnects — content that has been seen stays put,
 * so scrolling back up doesn't replay the whole page. `delay` staggers
 * siblings (grids of cards) without needing a wrapper per item.
 *
 * The hidden state lives in CSS (`.reveal`), which also carries the
 * prefers-reduced-motion override, so nothing here needs to test for it: with
 * reduced motion the element is simply visible from the start.
 */
export function Reveal({
  children,
  className,
  delay = 0,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  /** Milliseconds to hold before this element starts its transition. */
  delay?: number;
  as?: ElementType;
}) {
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // No IntersectionObserver (or an element already on screen at mount):
    // show it rather than risk leaving content invisible.
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setVisible(true);
        observer.disconnect();
      },
      { rootMargin: "0px 0px -10% 0px" },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      ref={ref}
      className={cn("reveal", visible && "is-visible", className)}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </Tag>
  );
}

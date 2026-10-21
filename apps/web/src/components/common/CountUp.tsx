import * as React from "react";
import { animate, useInView, useReducedMotion } from "framer-motion";

interface CountUpProps {
  value: number;
  /** Formats the animating number for display. Defaults to a rounded integer string. */
  format?: (n: number) => string;
  /** Animation length in milliseconds. */
  durationMs?: number;
  className?: string;
}

/**
 * Counts a number up to `value` — from 0 the first time the element scrolls
 * into view, then smoothly from the figure currently shown whenever `value`
 * changes (e.g. a new period is selected), so a filter change tweens rather
 * than snapping. Honours prefers-reduced-motion by showing the final value at
 * once. Pass `format` (e.g. formatCurrency) to control how it renders.
 */
export function CountUp({
  value,
  format = (n) => String(Math.round(n)),
  durationMs = 900,
  className,
}: CountUpProps) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduceMotion = useReducedMotion();
  const fromRef = React.useRef(0);
  const [display, setDisplay] = React.useState(0);

  React.useEffect(() => {
    // Reduced motion, or a non-finite value: skip the tween, show it as-is.
    if (reduceMotion || !Number.isFinite(value)) {
      fromRef.current = Number.isFinite(value) ? value : 0;
      setDisplay(fromRef.current);
      return;
    }
    if (!inView) return;
    const controls = animate(fromRef.current, value, {
      duration: durationMs / 1000,
      ease: "easeOut",
      onUpdate: (v) => {
        fromRef.current = v;
        setDisplay(v);
      },
    });
    return () => controls.stop();
  }, [value, inView, durationMs, reduceMotion]);

  return (
    <span ref={ref} className={className}>
      {format(display)}
    </span>
  );
}

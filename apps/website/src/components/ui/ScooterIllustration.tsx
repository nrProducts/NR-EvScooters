/**
 * The product shot used across the marketing site (Hero, Vehicles). Kept as a
 * component rather than a bare <img> so every call site shares the same asset,
 * framing and alt text — swap `/scooter.png` in apps/website/public to change
 * it everywhere.
 */
export function ScooterIllustration({
  className,
  priority = false,
}: {
  className?: string;
  /**
   * Set on the Hero's copy only — that's the one instance that's almost
   * certainly the page's LCP element, so lazy-loading it (the default,
   * correct choice everywhere else it's used further down the page) would
   * delay the exact paint Core Web Vitals measures.
   */
  priority?: boolean;
}) {
  return (
    <img
      src="/scooter.png"
      alt="Swapngo electric scooter available for rent in Chennai"
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      {...(priority ? { fetchPriority: "high" as const } : {})}
      className={`object-contain ${className ?? ""}`}
    />
  );
}

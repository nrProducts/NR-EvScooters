/**
 * The product shot used across the marketing site (Hero, Vehicles). Kept as a
 * component rather than a bare <img> so every call site shares the same asset,
 * framing and alt text — swap `/scooter.png` in apps/website/public to change
 * it everywhere.
 */
export function ScooterIllustration({ className }: { className?: string }) {
  return (
    <img
      src="/scooter.png"
      alt="Swapngo electric scooter available for rent in Chennai"
      loading="lazy"
      decoding="async"
      className={`object-contain ${className ?? ""}`}
    />
  );
}

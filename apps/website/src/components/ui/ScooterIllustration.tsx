/**
 * The product shot used across the marketing site (Hero, Vehicles). Kept as a
 * component rather than a bare <img> so every call site shares the same asset,
 * framing and alt text — swap the files in apps/website/public to change it
 * everywhere.
 *
 * The source PNG is ~1.3MB at 1374px, which is far more than any layout here
 * asks for, so two WebP renditions are offered first and the PNG is left as
 * the fallback for anything that cannot take WebP. `sizes` describes the real
 * layout (roughly full width on a phone, capped around 40rem on desktop) so a
 * phone downloads the 760px file — about 81KB — rather than the original.
 *
 * <picture> is `display: contents` so it leaves no box of its own: the <img>
 * keeps behaving exactly as it did when it was the call site's direct child,
 * and every existing aspect/width class still applies to it.
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
    <picture className="contents">
      <source
        type="image/webp"
        srcSet="/scooter-760.webp 760w, /scooter-1200.webp 1200w"
        sizes="(min-width: 1024px) 40rem, 92vw"
      />
      <img
        src="/scooter.png"
        alt="Swapngo electric scooter available for rent in Chennai"
        width={1374}
        height={1145}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        {...(priority ? { fetchPriority: "high" as const } : {})}
        className={`object-contain ${className ?? ""}`}
      />
    </picture>
  );
}

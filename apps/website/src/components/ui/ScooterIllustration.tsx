/**
 * The product shot used across the marketing site (Hero, Vehicles). Kept as a
 * component rather than a bare <img> so every call site shares the same
 * asset, framing and alt text.
 *
 * Points at the actual fleet vehicle's own catalog photo — the same file the
 * rider app reads via vehicle_model_media (My Scooter tab, Browse Vehicles) —
 * from Supabase's public `vehicle-model-images` bucket, rather than a
 * separate static file maintained only on the website. One real photo, one
 * place it lives; update the vehicle's photo in the admin console and both
 * apps and the site pick it up without a deploy. The bucket is genuinely
 * public (see supabase/migrations/20260820100600_storage_buckets.sql) — no
 * signing needed, safe to reference directly from an unauthenticated page.
 *
 * No responsive srcset here (unlike the old locally-hosted version): this is
 * one fixed file at a fixed size, not a build-time asset with pre-generated
 * renditions. If this becomes a real weight concern, the move is a resizing
 * proxy in front of the bucket, not hand-rolled breakpoints again.
 */
const FLEET_VEHICLE_PHOTO_URL =
  "https://cndqvdskrcmivqflbttl.supabase.co/storage/v1/object/public/vehicle-model-images/Light_Blue_Bike_MotovoltMvs7.webp";

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
      src={FLEET_VEHICLE_PHOTO_URL}
      alt="Swapngo electric scooter available for rent in Chennai"
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      {...(priority ? { fetchPriority: "high" as const } : {})}
      className={`object-contain ${className ?? ""}`}
    />
  );
}

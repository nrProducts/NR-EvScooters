/**
 * The single global texture pass. Rendered once at the app root; everything
 * else on the page sits under it. See `.grain-overlay` in index.css for the
 * feTurbulence source.
 */
export function GrainOverlay() {
  return <div className="grain-overlay" aria-hidden />;
}

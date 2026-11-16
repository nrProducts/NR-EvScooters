import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import App from "./App";
import { initAnalytics } from "@/lib/analytics";
import { isLegacyRentalUrl, normalizePath } from "@/lib/router";
import { findPage } from "@/seo/Seo";
import "./index.css";

initAnalytics();

const root = document.getElementById("root")!;
const app = (
  <StrictMode>
    <App />
  </StrictMode>
);

// The HTML file for a known page already contains that page's content
// (scripts/prerender.mjs), so React attaches to it instead of rebuilding it.
// Anything else (an unknown URL served by the SPA fallback, or an old
// "/#pricing" link that is about to be redirected) is not what the file
// contains, so it is rendered fresh.
const path = normalizePath(window.location.pathname);
const matchesPrerender =
  root.hasChildNodes() &&
  !isLegacyRentalUrl() &&
  !!findPage(path) &&
  document.documentElement.getAttribute("data-ssr-path") === path;

if (matchesPrerender) {
  hydrateRoot(root, app);
} else {
  root.replaceChildren();
  createRoot(root).render(app);
  // The guard in <head> hid the wrong page's content; the right page is now rendering.
  window.setTimeout(() => document.documentElement.removeAttribute("data-ssr-mismatch"), 0);
}

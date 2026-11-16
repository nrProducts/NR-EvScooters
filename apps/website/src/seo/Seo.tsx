import { useEffect } from "react";
import site from "@/seo/pages.json";
import fleetFaq from "@/seo/fleetFaq.json";
import { absoluteUrl, buildGraph } from "@/seo/schema.js";

export interface PageMeta {
  path: string;
  section: "home" | "rental" | "fleet";
  title: string;
  description: string;
  keywords?: string;
  ogTitle?: string;
  ogImage?: string;
  [key: string]: unknown;
}

export const PAGES = site.pages as PageMeta[];

export function findPage(pathname: string): PageMeta | undefined {
  return PAGES.find((p) => p.path === pathname);
}

/** Sets (or creates) one <meta>/<link> in <head>. Returns nothing — head tags are global, not owned. */
function setMeta(selector: string, create: () => HTMLElement, attr: string, value: string) {
  let el = document.head.querySelector<HTMLElement>(selector);
  if (!el) {
    el = create();
    document.head.appendChild(el);
  }
  el.setAttribute(attr, value);
}

const meta = (name: string) => () => {
  const el = document.createElement("meta");
  el.setAttribute("name", name);
  return el;
};
const prop = (property: string) => () => {
  const el = document.createElement("meta");
  el.setAttribute("property", property);
  return el;
};

/**
 * Keeps <title>, description, canonical, Open Graph, Twitter card and JSON-LD
 * in step with the current page during client-side navigation.
 *
 * Crawlers and link-preview bots that do not run JavaScript never see this —
 * they read the per-page HTML that scripts/prerender.mjs writes at build time
 * from the SAME pages.json. This component exists so the live tab (and
 * Googlebot's rendered DOM) stays consistent when a visitor navigates.
 */
export function Seo({ path, noindex = false, override }: { path: string; noindex?: boolean; override?: Partial<PageMeta> }) {
  useEffect(() => {
    const page = { ...(findPage(path) ?? PAGES[0]), ...override } as PageMeta;
    const origin = site.origin;
    const url = absoluteUrl(origin, page.path);
    const image = `${origin}${page.ogImage ?? site.defaultImage}`;
    const ogTitle = page.ogTitle ?? page.title;

    document.title = page.title;
    setMeta('meta[name="description"]', meta("description"), "content", page.description);
    if (page.keywords) setMeta('meta[name="keywords"]', meta("keywords"), "content", page.keywords);
    setMeta('meta[name="robots"]', meta("robots"), "content", noindex ? "noindex, follow" : "index, follow");
    setMeta('link[rel="canonical"]', () => {
      const el = document.createElement("link");
      el.setAttribute("rel", "canonical");
      return el;
    }, "href", url);

    setMeta('meta[property="og:title"]', prop("og:title"), "content", ogTitle);
    setMeta('meta[property="og:description"]', prop("og:description"), "content", page.description);
    setMeta('meta[property="og:url"]', prop("og:url"), "content", url);
    setMeta('meta[property="og:image"]', prop("og:image"), "content", image);
    setMeta('meta[property="og:image:alt"]', prop("og:image:alt"), "content", ogTitle);
    setMeta('meta[name="twitter:title"]', meta("twitter:title"), "content", ogTitle);
    setMeta('meta[name="twitter:description"]', meta("twitter:description"), "content", page.description);
    setMeta('meta[name="twitter:image"]', meta("twitter:image"), "content", image);
    setMeta('meta[name="twitter:image:alt"]', meta("twitter:image:alt"), "content", ogTitle);

    // Structured data: replace the single JSON-LD block rather than stacking one per visited page.
    let ld = document.head.querySelector<HTMLScriptElement>('script[type="application/ld+json"][data-seo]')
      ?? document.head.querySelector<HTMLScriptElement>('script[type="application/ld+json"]');
    if (!ld) {
      ld = document.createElement("script");
      ld.type = "application/ld+json";
      document.head.appendChild(ld);
    }
    ld.setAttribute("data-seo", "");
    ld.textContent = noindex ? "" : JSON.stringify(buildGraph(site, page, fleetFaq));
  }, [path, noindex, override]);

  return null;
}

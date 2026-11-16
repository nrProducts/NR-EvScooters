/**
 * Post-build step: gives every route its own real HTML file.
 *
 * WHY: the site is a client-rendered SPA. Without this, /fleet-management would
 * be served the home page's <head> — the wrong title, description, canonical and
 * Open Graph tags — AND an empty body, to anything that doesn't run JavaScript
 * (WhatsApp / LinkedIn / Slack link previews, most SEO audit tools, and
 * Googlebot's first, un-rendered pass). So each route's file now carries its
 * own head AND its real page content (headings, copy, links). The browser
 * hydrates that content (src/main.tsx) and the app behaves exactly as before.
 *
 * WHAT IT DOES (reads dist/index.html, the Vite output, and .ssr-build/, the
 * server bundle from `vite build --ssr`, which it deletes when done):
 *   1. For each page in src/seo/pages.json, writes dist/<path>/index.html with
 *      that page's <title>, description, keywords, robots, canonical, Open
 *      Graph, Twitter card and JSON-LD substituted into <head>, and the page's
 *      server-rendered content inside <div id="root">.
 *   2. Rewrites dist/index.html itself for the home page.
 *   3. Writes dist/sitemap.xml from the same list (so it can never drift).
 *   4. Verifies robots.txt and fails the build on duplicate titles,
 *      descriptions or canonicals, or an over-long title/description.
 *
 * It shares src/seo/schema.js with the in-browser <Seo> component so the JSON-LD
 * is identical in both.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildGraph, absoluteUrl } from "../src/seo/schema.js";

const here = dirname(fileURLToPath(import.meta.url));
const dist = resolve(here, "../dist");
const site = JSON.parse(readFileSync(resolve(here, "../src/seo/pages.json"), "utf8"));
const fleetFaq = JSON.parse(readFileSync(resolve(here, "../src/seo/fleetFaq.json"), "utf8"));

const template = readFileSync(join(dist, "index.html"), "utf8");

const ssrDir = resolve(here, "../.ssr-build");
const ssrEntry = join(ssrDir, "entry-server.js");
if (!existsSync(ssrEntry)) {
  console.error("prerender: .ssr-build/entry-server.js is missing. Run `vite build --ssr src/entry-server.tsx --outDir .ssr-build` first.");
  process.exit(1);
}
const { render: renderApp } = await import(pathToFileURL(ssrEntry).href);

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Remove every head tag this script owns so the template's own copy can't duplicate. */
function stripOwnedTags(html) {
  return html
    .replace(/<title>[\s\S]*?<\/title>\s*/i, "")
    .replace(/<meta\s+name="(?:description|keywords|robots|twitter:[^"]+)"[^>]*>\s*/gi, "")
    .replace(/<meta\s+property="og:[^"]+"[^>]*>\s*/gi, "")
    .replace(/<link\s+rel="canonical"[^>]*>\s*/gi, "")
    .replace(/<script type="application\/ld\+json"[\s\S]*?<\/script>\s*/gi, "")
    // Our own <noscript> bits and previously rendered content, so running this script twice on one dist/ stays idempotent.
    .replace(/\s*<noscript><main style="font-family:system-ui[\s\S]*?<\/noscript>/i, "")
    .replace(/\s*<noscript data-seo>[\s\S]*?<\/noscript>/i, "")
    .replace(/\s*<script data-ssr-guard>[\s\S]*?<\/script>/i, "")
    .replace(/ data-ssr-path="[^"]*"/, "")
    .replace(/<div id="root">[\s\S]*<!--ssr-end-->/, '<div id="root"></div>');
}

function headBlock(page) {
  const url = absoluteUrl(site.origin, page.path);
  const image = `${site.origin}${page.ogImage ?? site.defaultImage}`;
  const ogTitle = page.ogTitle ?? page.title;
  const graph = JSON.stringify(buildGraph(site, page, fleetFaq));
  return [
    `<title>${esc(page.title)}</title>`,
    `<meta name="description" content="${esc(page.description)}" />`,
    page.keywords ? `<meta name="keywords" content="${esc(page.keywords)}" />` : "",
    `<meta name="robots" content="index, follow" />`,
    `<link rel="canonical" href="${esc(url)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${esc(site.siteName)}" />`,
    `<meta property="og:title" content="${esc(ogTitle)}" />`,
    `<meta property="og:description" content="${esc(page.description)}" />`,
    `<meta property="og:url" content="${esc(url)}" />`,
    `<meta property="og:image" content="${esc(image)}" />`,
    `<meta property="og:image:alt" content="${esc(ogTitle)}" />`,
    `<meta property="og:locale" content="en_IN" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(ogTitle)}" />`,
    `<meta name="twitter:description" content="${esc(page.description)}" />`,
    `<meta name="twitter:image" content="${esc(image)}" />`,
    `<meta name="twitter:image:alt" content="${esc(ogTitle)}" />`,
    `<script type="application/ld+json" data-seo>${graph.replace(/</g, "\\u003c")}</script>`,
    // If a host serves THIS file for a different URL (e.g. the SPA fallback for "/about"), hide the content
    // that does not belong to that URL until the app has rendered the right page. Runs before first paint.
    `<script data-ssr-guard>(function(){var s=document.documentElement.getAttribute("data-ssr-path"),p=location.pathname.replace(/\\/+$/,"")||"/";if(s&&(s!==p||(p==="/"&&/^#(how-it-works|why|pricing|battery-swap|faq|get-app|showcase)$/.test(location.hash))))document.documentElement.setAttribute("data-ssr-mismatch","")})()</script>`,
    // The content is visible without JavaScript: scroll-reveal starts hidden and needs JS to release it.
    `<noscript data-seo><style>.reveal{opacity:1!important;transform:none!important}</style></noscript>`,
  ]
    .filter(Boolean)
    .join("\n    ");
}

/** The route's real content, rendered by the app itself (src/entry-server.tsx). */
async function render(page) {
  const body = await renderApp(page.path);
  const h1s = (body.match(/<h1[\s>]/g) ?? []).length;
  if (h1s !== 1) problems.push(`${page.path}: rendered content has ${h1s} <h1> elements (expected exactly 1)`);
  if (body.length < 4000) problems.push(`${page.path}: rendered content is suspiciously short (${body.length} chars)`);
  let html = stripOwnedTags(template);
  html = html.replace("<html ", () => `<html data-ssr-path="${page.path}" `);
  html = html.replace("</head>", () => `    ${headBlock(page)}\n  </head>`);
  // A function replacer: the content contains "$" characters that a string replacement would interpret.
  html = html.replace('<div id="root"></div>', () => `<div id="root">${body}</div><!--ssr-end-->`);
  return html;
}

// --- Validation --------------------------------------------------------------
const problems = [];
const seen = { title: new Map(), description: new Map(), canonical: new Map() };
for (const page of site.pages) {
  const canonical = absoluteUrl(site.origin, page.path);
  for (const [key, value] of [["title", page.title], ["description", page.description], ["canonical", canonical]]) {
    if (seen[key].has(value)) problems.push(`duplicate ${key} on ${page.path} and ${seen[key].get(value)}`);
    seen[key].set(value, page.path);
  }
  if (page.title.length > 75) problems.push(`${page.path}: title is ${page.title.length} chars (keep ≤ 75)`);
  if (page.description.length > 190) problems.push(`${page.path}: description is ${page.description.length} chars (keep ≤ 190)`);
  if (page.description.length < 70) problems.push(`${page.path}: description is only ${page.description.length} chars`);
  // The two businesses must not leak keywords into each other's pages.
  if (page.section === "fleet" && /scooter rental|bike rental chennai|battery swap/i.test(`${page.title} ${page.description} ${page.keywords ?? ""}`)) {
    problems.push(`${page.path}: fleet page metadata contains rental keywords`);
  }
}

// --- Write pages -------------------------------------------------------------
for (const page of site.pages) {
  const out = page.path === "/" ? join(dist, "index.html") : join(dist, page.path.slice(1), "index.html");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, await render(page));
}
rmSync(ssrDir, { recursive: true, force: true });

// --- Sitemap -----------------------------------------------------------------
const today = new Date().toISOString().slice(0, 10);
const urlEntries = [
  ...site.pages.map((p) => ({ loc: absoluteUrl(site.origin, p.path), changefreq: p.changefreq, priority: p.priority })),
  ...site.legalPages.map((p) => ({ loc: `${site.origin}${p.path}`, changefreq: p.changefreq, priority: p.priority })),
];
const sitemap =
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  urlEntries
    .map(
      (u) =>
        `  <url>\n    <loc>${u.loc}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`,
    )
    .join("\n") +
  `\n</urlset>\n`;
writeFileSync(join(dist, "sitemap.xml"), sitemap);

// --- robots.txt --------------------------------------------------------------
const robotsPath = join(dist, "robots.txt");
if (!existsSync(robotsPath)) problems.push("dist/robots.txt is missing");
else {
  const robots = readFileSync(robotsPath, "utf8");
  if (!/Sitemap:\s*https:\/\/swapngo\.in\/sitemap\.xml/i.test(robots)) problems.push("robots.txt does not reference the sitemap");
  if (/^\s*Disallow:\s*\/\s*$/im.test(robots)) problems.push("robots.txt disallows the whole site");
}

if (problems.length) {
  console.error("\nprerender: SEO checks failed:\n - " + problems.join("\n - "));
  process.exit(1);
}
console.log(`prerender: wrote ${site.pages.length} pages + sitemap.xml (${urlEntries.length} URLs); robots.txt OK`);

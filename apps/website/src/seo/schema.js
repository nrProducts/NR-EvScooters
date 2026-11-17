// Shared by the runtime <Seo> component (TypeScript, via schema.d.ts) AND the
// build-time prerender script (plain Node) — which is why this is dependency-free
// ESM JavaScript. One implementation means the structured data a crawler reads
// from the prerendered HTML is byte-for-byte what the browser would inject.

/** @param {string} origin @param {string} path */
export function absoluteUrl(origin, path) {
  // Every page is a directory on disk (dist/about/index.html), so the canonical form ends in a slash.
  // That form resolves to the page's own file on any static host; the bare "/about" form depends on the host.
  if (path === "/") return `${origin}/`;
  return `${origin}${path.replace(/\/+$/, "")}/`;
}

/**
 * Builds the JSON-LD @graph for one page.
 *
 * @param {any} site  the parsed pages.json
 * @param {any} page  one entry of site.pages
 * @param {{question: string, answer: string}[]} fleetFaq
 */
export function buildGraph(site, page, fleetFaq) {
  const origin = site.origin;
  const url = absoluteUrl(origin, page.path);
  const graph = [site.organization];

  if (page.path === "/") {
    graph.push({
      "@type": "WebSite",
      "@id": `${origin}/#website`,
      url: `${origin}/`,
      name: site.siteName,
      description: "EV scooter rental in Chennai and fleet management software",
      publisher: { "@id": site.organization["@id"] },
      inLanguage: "en-IN",
    });
  }

  if (page.localBusiness) graph.push(site.rentalBusiness);

  if (page.software) graph.push(site.software);

  graph.push({
    "@type": page.type ?? "WebPage",
    "@id": `${url}#webpage`,
    url,
    name: page.name ?? page.title,
    description: page.description,
    inLanguage: "en-IN",
    isPartOf: { "@id": `${origin}/#website` },
    publisher: { "@id": site.organization["@id"] },
    ...(page.software ? { about: { "@id": site.software["@id"] } } : {}),
    ...(page.localBusiness ? { about: { "@id": site.rentalBusiness["@id"] } } : {}),
  });

  if (page.path === "/") {
    graph.push({
      "@type": "ItemList",
      "@id": `${origin}/#offerings`,
      name: "Swapngo offerings",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "EV Scooter Rental",
          url: absoluteUrl(origin, "/ev-scooter-rental"),
        },
        {
          "@type": "ListItem",
          position: 2,
          name: "SwapNgo Fleet: Fleet Management Software",
          url: absoluteUrl(origin, "/fleet-management"),
        },
      ],
    });
  }

  if (page.breadcrumb && page.breadcrumb.length > 1) {
    graph.push({
      "@type": "BreadcrumbList",
      "@id": `${url}#breadcrumb`,
      itemListElement: page.breadcrumb.map((crumb, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: crumb.name,
        item: absoluteUrl(origin, crumb.path),
      })),
    });
  }

  if (page.faq) {
    graph.push({
      "@type": "FAQPage",
      "@id": `${url}#faq`,
      mainEntity: fleetFaq.map((f) => ({
        "@type": "Question",
        name: f.question,
        acceptedAnswer: { "@type": "Answer", text: f.answer },
      })),
    });
  }

  return { "@context": "https://schema.org", "@graph": graph };
}

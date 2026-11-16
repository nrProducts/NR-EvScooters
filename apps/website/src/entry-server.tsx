import type { ReactNode } from "react";
import * as ReactDOMStatic from "react-dom/static";
import App from "./App";

/**
 * react-dom/static is a CommonJS module, and its Node build differs by React
 * version: 19.1 exports only `prerenderToNodeStream`, while `prerender` (the
 * web-streams one) first appeared in 19.2. The lockfile pins 19.1, which is what
 * Render installs, so this uses the function both versions have. The namespace
 * import (with a `default` fallback) is because Node's ESM loader does not
 * always detect a CommonJS module's named exports.
 */
type PrerenderToNodeStream = (
  children: ReactNode,
  options?: { progressiveChunkSize?: number },
) => Promise<{ prelude: AsyncIterable<Uint8Array | string> }>;

const staticModule = ReactDOMStatic as unknown as {
  prerenderToNodeStream?: PrerenderToNodeStream;
  default?: { prerenderToNodeStream?: PrerenderToNodeStream };
};
const prerenderToNodeStream = staticModule.prerenderToNodeStream ?? staticModule.default?.prerenderToNodeStream;

/**
 * Build-time render. scripts/prerender.mjs calls this once per route and writes
 * the result into that route's HTML, so the page's real content (headings,
 * copy, links) is in the file a search engine downloads, instead of appearing
 * only after JavaScript has run. The browser then hydrates it (see main.tsx),
 * so visitors get exactly the same interactive app as before.
 *
 * Nothing here runs in the browser or on the live server.
 */
export async function render(url: string): Promise<string> {
  if (!prerenderToNodeStream) {
    throw new Error("react-dom/static does not export prerenderToNodeStream; check the installed react-dom version.");
  }
  // progressiveChunkSize: by default React moves any large page section into a hidden block at
  // the end of the HTML and swaps it in with a script. That hides the content from crawlers and
  // breaks hydration, so ask for everything inline, in the visible place it belongs.
  const { prelude } = await prerenderToNodeStream(<App url={url} />, {
    progressiveChunkSize: Number.MAX_SAFE_INTEGER,
  });
  const decoder = new TextDecoder();
  let html = "";
  for await (const chunk of prelude) {
    html += typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true });
  }
  return html + decoder.decode();
}

import { prerender } from "react-dom/static";
import App from "./App";

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
  // progressiveChunkSize: by default React moves any large page section into a hidden block at
  // the end of the HTML and swaps it in with a script. That hides the content from crawlers and
  // breaks hydration, so ask for everything inline, in the visible place it belongs.
  const { prelude } = await prerender(<App url={url} />, { progressiveChunkSize: Number.MAX_SAFE_INTEGER });
  const reader = prelude.getReader();
  const decoder = new TextDecoder();
  let html = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    html += decoder.decode(value, { stream: true });
  }
  return html + decoder.decode();
}

/**
 * Renders docs/legal/*.md into hostable pages under apps/website/public/.
 *
 * Why a script rather than two hand-written HTML files: these documents have
 * to be reviewed by a lawyer, and a lawyer reviews the markdown. If the HTML
 * were maintained separately it would drift from the reviewed text, and the
 * page a rider actually reads would stop being the page anyone approved.
 * One source, regenerated.
 *
 * TWO THINGS THIS DELIBERATELY DOES:
 *
 *   1. STRIPS HTML COMMENTS. Both source files carry internal notes — the
 *      "needs legal review" banner, the checklist of questions for the
 *      lawyer, comments naming the code that enforces each money rule. None
 *      of that belongs on a public page.
 *
 *   2. REFUSES TO BUILD WHILE [PLACEHOLDERS] REMAIN, unless you pass
 *      --allow-placeholders. Publishing a privacy policy that still says
 *      [GRIEVANCE EMAIL] is worse than publishing nothing: Google Play reads
 *      it, and so does anyone deciding whether to trust you with their
 *      Aadhaar.
 *
 * Usage:
 *   node scripts/build-legal.mjs                        # from apps/website
 *   node scripts/build-legal.mjs --allow-placeholders   # preview a draft
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const outDir = resolve(here, "../public");
const allowPlaceholders = process.argv.includes("--allow-placeholders");

const DOCS = [
    { src: "docs/legal/privacy-policy.md", out: "privacy.html", title: "Privacy Policy — Swapngo" },
    { src: "docs/legal/terms-and-conditions.md", out: "terms.html", title: "Terms & Conditions — Swapngo" },
];

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Inline markdown: `code`, **bold**, *italic*, [text](href). Escaped first. */
function inline(text) {
    return esc(text)
        .replace(/`([^`]+)`/g, "<code>$1</code>")
        .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
        .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>")
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}

/**
 * A deliberately small markdown subset — headings, paragraphs, lists, tables,
 * blockquotes, rules. That is everything these two documents use. If a future
 * edit needs more, add it here rather than hand-editing the generated HTML.
 */
function render(md) {
    const lines = md.replace(/<!--[\s\S]*?-->/g, "").split(/\r?\n/);
    const out = [];
    let i = 0;

    const isTableRow = (l) => /^\s*\|.*\|\s*$/.test(l);
    const cells = (l) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

    while (i < lines.length) {
        const line = lines[i];

        if (!line.trim()) { i++; continue; }

        if (/^---+$/.test(line.trim())) { out.push("<hr>"); i++; continue; }

        const h = line.match(/^(#{1,6})\s+(.*)$/);
        if (h) {
            const level = h[1].length;
            out.push(`<h${level}>${inline(h[2])}</h${level}>`);
            i++; continue;
        }

        // Table: header row, separator, then body rows.
        if (isTableRow(line) && isTableRow(lines[i + 1] ?? "") && /^[\s|:-]+$/.test(lines[i + 1])) {
            const head = cells(line);
            i += 2;
            const body = [];
            while (i < lines.length && isTableRow(lines[i])) { body.push(cells(lines[i])); i++; }
            out.push(
                '<div class="tscroll"><table><thead><tr>' +
                head.map((c) => `<th>${inline(c)}</th>`).join("") +
                "</tr></thead><tbody>" +
                body.map((r) => "<tr>" + r.map((c) => `<td>${inline(c)}</td>`).join("") + "</tr>").join("") +
                "</tbody></table></div>",
            );
            continue;
        }

        if (/^\s*>\s?/.test(line)) {
            const buf = [];
            while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
                buf.push(lines[i].replace(/^\s*>\s?/, "")); i++;
            }
            out.push(`<blockquote>${buf.map((b) => inline(b)).join("<br>")}</blockquote>`);
            continue;
        }

        const listMatch = line.match(/^\s*([-*]|\d+\.)\s+/);
        if (listMatch) {
            const ordered = /\d/.test(listMatch[1]);
            const items = [];
            while (i < lines.length) {
                const m = lines[i].match(/^\s*(?:[-*]|\d+\.)\s+(.*)$/);
                if (!m) break;
                let text = m[1];
                i++;
                // Continuation lines of the same bullet.
                while (i < lines.length && lines[i].trim() && !/^\s*(?:[-*]|\d+\.)\s+/.test(lines[i]) && /^\s{2,}/.test(lines[i])) {
                    text += " " + lines[i].trim(); i++;
                }
                items.push(`<li>${inline(text)}</li>`);
            }
            out.push(`<${ordered ? "ol" : "ul"}>${items.join("")}</${ordered ? "ol" : "ul"}>`);
            continue;
        }

        const para = [];
        while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|\s*[-*]\s|\s*\d+\.\s|\s*>|---+$)/.test(lines[i]) && !isTableRow(lines[i])) {
            para.push(lines[i].trim()); i++;
        }
        if (para.length) out.push(`<p>${inline(para.join(" "))}</p>`);
    }
    return out.join("\n");
}

const PAGE = (title, body) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="robots" content="index, follow">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<style>
  :root {
    --ground:#ffffff; --ink:#0f1c16; --ink-2:#3d4f46; --muted:#6b7c73;
    --line:#e2e8e4; --accent:#17924a; --surface:#f7faf8;
  }
  @media (prefers-color-scheme: dark) {
    :root { --ground:#0d1310; --ink:#e9efeb; --ink-2:#c0cdc5; --muted:#8b9c92;
            --line:#243029; --accent:#3fd37a; --surface:#141d18; }
  }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--ground); color:var(--ink);
         font:16px/1.7 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
         -webkit-font-smoothing:antialiased; }
  .wrap { max-width:760px; margin:0 auto; padding:56px 24px 96px; }
  a { color:var(--accent); }
  h1 { font-size:32px; line-height:1.15; letter-spacing:-.02em; margin:0 0 8px; }
  h2 { font-size:21px; margin:44px 0 12px; letter-spacing:-.01em;
       padding-bottom:8px; border-bottom:1px solid var(--line); }
  h3 { font-size:17px; margin:28px 0 8px; }
  p, li { color:var(--ink-2); }
  ul, ol { padding-left:22px; }
  li { margin-bottom:6px; }
  strong { color:var(--ink); font-weight:600; }
  hr { border:none; border-top:1px solid var(--line); margin:36px 0; }
  code { background:var(--surface); border:1px solid var(--line);
         padding:1px 5px; border-radius:4px; font-size:.88em; }
  blockquote { margin:18px 0; padding:14px 18px; background:var(--surface);
               border-left:3px solid var(--accent); border-radius:0 8px 8px 0; color:var(--ink-2); }
  .tscroll { overflow-x:auto; margin:18px 0; border:1px solid var(--line); border-radius:10px; }
  table { border-collapse:collapse; width:100%; min-width:440px; font-size:14.5px; }
  th { text-align:left; background:var(--surface); padding:10px 14px;
       border-bottom:1px solid var(--line); font-size:12px; text-transform:uppercase;
       letter-spacing:.06em; color:var(--muted); }
  td { padding:10px 14px; border-bottom:1px solid var(--line); color:var(--ink-2); vertical-align:top; }
  tr:last-child td { border-bottom:none; }
  .home { display:inline-block; margin-bottom:28px; font-size:14px; text-decoration:none; color:var(--muted); }
  .home:hover { color:var(--accent); }
</style>
</head>
<body>
<div class="wrap">
<a class="home" href="/">&larr; Swapngo</a>
${body}
</div>
</body>
</html>
`;

let failed = false;

for (const doc of DOCS) {
    const srcPath = resolve(repoRoot, doc.src);
    if (!existsSync(srcPath)) {
        console.error(`[legal] missing source: ${doc.src}`);
        failed = true;
        continue;
    }

    const md = readFileSync(srcPath, "utf8");
    const withoutComments = md.replace(/<!--[\s\S]*?-->/g, "");
    const placeholders = [...new Set(withoutComments.match(/\[[A-Z][A-Z0-9 ,.\/&—-]{2,}\]/g) ?? [])];

    if (placeholders.length && !allowPlaceholders) {
        console.error(
            `\n[legal] ${doc.src} still has ${placeholders.length} placeholder(s):\n` +
            placeholders.map((p) => `    ${p}`).join("\n") +
            `\n\n  Fill these in before publishing. To preview anyway:\n` +
            `    node scripts/build-legal.mjs --allow-placeholders\n`,
        );
        failed = true;
        continue;
    }

    const outPath = resolve(outDir, doc.out);
    writeFileSync(outPath, PAGE(doc.title, render(md)), "utf8");
    const warn = placeholders.length ? `  (DRAFT — ${placeholders.length} placeholder(s) still present)` : "";
    console.log(`[legal] ${doc.src} -> public/${doc.out}${warn}`);
}

if (failed && !allowPlaceholders) process.exit(1);

#!/usr/bin/env node
/**
 * Verify every PostgREST select string in the backend against the live schema.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────
 *
 * `supabaseAdmin` is typed over the generated `Database`, so in principle a
 * wrong table or column name is a compile error. In practice it is not, and
 * the final system audit found three modules shipping queries that PostgREST
 * answers with a 400:
 *
 *   invoices.service.ts   asked for booking_id, payment_type, amount_due,
 *                         due_date, payment_status, payment_method,
 *                         gateway_ref, paid_at — eight columns that do not
 *                         exist — plus a `rentals(vehicles(...))` embed over
 *                         a foreign key that does not exist.
 *   audit.service.ts      asked pii_access_log for actor_roles, ip, path;
 *                         the columns are actor_role_snapshot, ip_address,
 *                         request_path.
 *   vehicles.service.ts   asked rental_returns for reason and feedback; the
 *                         columns are requested_reason and rider_notes.
 *
 * All three passed `tsc` cleanly. Two ways a select escapes type checking:
 *
 *   1. INTERPOLATION. `const DETAIL = \`${LIST}, more\`` is typed `string`,
 *      not a string literal, and supabase-js can only parse a literal.
 *   2. PARSER GIVE-UP. Deeply nested embeds and `alias:table!fk_name(...)`
 *      hints defeat the select-string parser, which then falls back to a
 *      permissive type rather than failing.
 *
 * Neither is going away, so the type checker cannot be the guarantee here.
 * This script is: it resolves every select string in the source and asks the
 * real PostgREST whether it parses.
 *
 * ── WHY THE ANON KEY IS ENOUGH ───────────────────────────────────────────
 *
 * PostgREST parses and plans the select BEFORE row-level security filters
 * anything, so a malformed column or a missing relationship is a 400 whether
 * or not the caller can see a single row. RLS returning `[]` is a PASS here —
 * the query was valid. That means this needs no service-role key and is safe
 * to run in CI.
 *
 *   node scripts/verify-selects.mjs
 *
 * Reads SUPABASE_URL and SUPABASE_ANON_KEY from the environment (or .env).
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const SRC = join(ROOT, "src");

// --- config ---------------------------------------------------------------
function loadEnv() {
    let url = process.env.SUPABASE_URL;
    let key = process.env.SUPABASE_ANON_KEY;
    try {
        const raw = readFileSync(join(ROOT, ".env"), "utf8");
        for (const line of raw.split("\n")) {
            const m = line.match(/^\s*(SUPABASE_URL|SUPABASE_ANON_KEY)\s*=\s*(.*)\s*$/);
            if (!m) continue;
            const v = m[2].trim().replace(/^["']|["']$/g, "");
            if (!v) continue;
            if (m[1] === "SUPABASE_URL") url ??= v;
            else key ??= v;
        }
    } catch { /* no .env — environment only */ }
    return { url, key };
}

// --- collect source -------------------------------------------------------
function walk(dir) {
    const out = [];
    for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) out.push(...walk(p));
        else if (p.endsWith(".ts")) out.push(p);
    }
    return out;
}

/**
 * Resolves `${CONST}` interpolation inside a select string, since that is one
 * of the two ways a select escapes the type checker and therefore exactly
 * what has to be checked here.
 */
function resolveInterpolation(text, consts) {
    let out = text;
    for (let i = 0; i < 6; i += 1) {
        const next = out.replace(/\$\{(\w+)\}/g, (whole, name) => consts[name] ?? whole);
        if (next === out) break;
        out = next;
    }
    return out;
}

function collectSelects() {
    const found = [];
    for (const file of walk(SRC)) {
        const src = readFileSync(file, "utf8");

        const consts = {};
        for (const m of src.matchAll(/const (\w+)\s*=\s*`([^`]*)`/g)) consts[m[1]] = m[2];

        for (const m of src.matchAll(/\.from\("(\w+)"\)\s*(?:\n\s*)?\.select\(\s*(`[^`]*`|\w+)/g)) {
            const table = m[1];
            const raw = m[2];
            let text = raw.startsWith("`") ? raw.slice(1, -1) : consts[raw];
            if (text === undefined) continue;          // select(someVariable) — not statically known
            text = resolveInterpolation(text, consts);
            if (text.includes("${")) continue;         // unresolved; nothing to assert
            found.push({ file: relative(ROOT, file), table, select: text });
        }
    }
    // De-duplicate on (table, select) so a constant used five times is one request.
    const seen = new Set();
    return found.filter((f) => {
        // Match what supabase-js sends: it strips whitespace from the columns
        // string before building the query.
        f.select = f.select.replace(/\s+/g, "");
        const k = `${f.table}::${f.select}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
    });
}

// --- run ------------------------------------------------------------------
const { url, key } = loadEnv();
if (!url || !key) {
    console.error("SUPABASE_URL / SUPABASE_ANON_KEY are not set — cannot verify against a live schema.");
    process.exit(2);
}

const selects = collectSelects();
const failures = [];

for (const s of selects) {
    const qs = new URLSearchParams({ select: s.select, limit: "1" });
    const res = await fetch(`${url}/rest/v1/${s.table}?${qs}`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
    });

    if (res.ok) {
        console.log(`  PASS  ${s.table.padEnd(32)} ${s.file.split(sep).pop()}`);
        continue;
    }
    // 401/403 would mean the key is wrong, not the query — surface it as such
    // rather than reporting every select as broken.
    const body = await res.text();
    if (res.status === 401 || res.status === 403) {
        console.error(`\nAuth failed (${res.status}). Check SUPABASE_ANON_KEY.\n${body}`);
        process.exit(2);
    }
    console.log(`  FAIL  ${s.table.padEnd(32)} ${s.file.split(sep).pop()}`);
    failures.push({ ...s, body });
}

console.log(`\n${selects.length} select strings checked, ${failures.length} failing.`);
for (const f of failures) {
    console.log(`\n  ${f.file}\n    from("${f.table}")\n    ${f.body}`);
}
process.exit(failures.length === 0 ? 0 : 1);

#!/usr/bin/env node
/**
 * Runs each tsconfig slice in its own `tsc` process, sequentially.
 *
 * Sequential, not parallel, on purpose: the whole reason the slices exist is
 * that memory is the binding constraint, and running them at once would put
 * the peak back where it was. Each slice gets a fresh process so its heap is
 * returned before the next one starts.
 *
 * Slices overlap, so the same error can surface from several of them; they are
 * de-duplicated before printing. Exit code is non-zero if any slice reported a
 * type error, and slices keep running after one fails so a single broken area
 * does not hide the rest.
 */
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const backend = resolve(here, "..");
const tsc = resolve(backend, "../../node_modules/typescript/lib/tsc.js");

const only = process.argv[2];
const slices = readdirSync(here)
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .map((f) => f.replace(/\.json$/, ""))
    // *.ci slices need more heap than a small dev box has. They are skipped
    // by default and run only when named outright, or in CI.
    .filter((name) => (only ? name === only : !name.endsWith(".ci")))
    .sort();

if (slices.length === 0) {
    console.error(only ? `No slice named "${only}".` : "No slices found.");
    process.exit(1);
}

const errors = new Set();
let failed = false;

for (const slice of slices) {
    process.stderr.write(`· ${slice} … `);
    const started = Date.now();
    const result = spawnSync(
        process.execPath,
        ["--max-old-space-size=2048", tsc, "-p", join(here, `${slice}.json`), "--noEmit", "--pretty", "false"],
        { cwd: backend, encoding: "utf8" },
    );
    const seconds = ((Date.now() - started) / 1000).toFixed(0);

    const lines = `${result.stdout ?? ""}${result.stderr ?? ""}`
        .split("\n")
        .filter((l) => l.trim().length > 0);
    const sliceErrors = lines.filter((l) => /error TS\d+:/.test(l));
    sliceErrors.forEach((l) => errors.add(l));

    if (result.status !== 0 && sliceErrors.length === 0) {
        // A crash, not a type error — an OOM looks like this. Say so loudly;
        // the fix is to split the slice, not to raise the heap.
        failed = true;
        process.stderr.write(`CRASHED after ${seconds}s\n`);
        console.error(lines.slice(-15).join("\n"));
        continue;
    }

    if (sliceErrors.length > 0) failed = true;
    process.stderr.write(`${sliceErrors.length} error(s), ${seconds}s\n`);
}

if (errors.size > 0) {
    console.log([...errors].sort().join("\n"));
    console.error(`\n${errors.size} unique error(s) across ${slices.length} slice(s).`);
}

process.exit(failed ? 1 : 0);

#!/usr/bin/env node
/**
 * Removes Storage files whose owner no longer exists — the second half of
 * supabase/scripts/beta-reset-user-data.sql, which cannot do this itself
 * (storage.protect_objects_delete blocks DELETE on storage.objects from SQL).
 *
 * A file is an orphan when the first segment of its path names a row that is
 * gone:
 *   kyc-documents   {userId}/{docType}/{file}   → public.users
 *   profile-photos  {userId}/{file}             → public.users
 *   damage-photos   {damageId}/{file}           → public.damages
 * vehicle-model-images, vehicle-photos and vehicle-documents are master data
 * and are never touched. Files at a bucket's root are reported, not removed.
 *
 *   node scripts/beta-clean-storage.mjs           # dry run: lists, deletes nothing
 *   node scripts/beta-clean-storage.mjs --apply   # deletes the listed files
 *
 * Uses SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY from apps/backend/.env — the
 * project it will act on is printed first. Run the SQL script before this
 * one; run before it, every owner still exists and nothing is an orphan.
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const apply = process.argv.includes("--apply");
const url = process.env.SUPABASE_URL ?? "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const red = (s) => `\x1b[31m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;

if (!url || !key) {
    console.log(red("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in apps/backend/.env"));
    process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const BUCKETS = [
    { name: process.env.KYC_BUCKET ?? "kyc-documents", owner: "users" },
    { name: process.env.PROFILE_PHOTO_BUCKET ?? "profile-photos", owner: "users" },
    { name: "damage-photos", owner: "damages" },
];
const PAGE = 1000;

/** Every id in a table, paged — a short read would make real files look orphaned. */
async function loadIds(table) {
    const ids = new Set();
    for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase.from(table).select("id").range(from, from + PAGE - 1);
        if (error) throw new Error(`reading ${table}: ${error.message}`);
        data.forEach((r) => ids.add(r.id));
        if (data.length < PAGE) return ids;
    }
}

/** One directory level, paged. Folders come back with id === null. */
async function listLevel(bucket, prefix) {
    const out = [];
    for (let offset = 0; ; offset += PAGE) {
        const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: PAGE, offset });
        if (error) throw new Error(`listing ${bucket}/${prefix}: ${error.message}`);
        out.push(...data);
        if (data.length < PAGE) return out;
    }
}

async function listFilesUnder(bucket, prefix) {
    const files = [];
    for (const entry of await listLevel(bucket, prefix)) {
        const path = `${prefix}/${entry.name}`;
        if (entry.id === null) files.push(...(await listFilesUnder(bucket, path)));
        else files.push(path);
    }
    return files;
}

console.log(`\nStorage orphan cleanup  ${dim(`(${new URL(url).host})`)}  ${apply ? red("APPLY") : green("dry run")}\n`);

const owners = { users: await loadIds("users"), damages: await loadIds("damages") };

// Same guard as the SQL script: with no users at all this is the wrong
// project or a failed read, and every file would look like an orphan.
const { count: staffCount, error: staffError } = await supabase
    .from("users").select("id", { count: "exact", head: true }).neq("role", "rider");
if (staffError) throw new Error(`reading users: ${staffError.message}`);
if (!staffCount) {
    console.log(red("  No admin/staff account found — refusing to run."));
    process.exit(1);
}

let total = 0;
for (const { name, owner } of BUCKETS) {
    let top;
    try {
        top = await listLevel(name, "");
    } catch (e) {
        console.log(`  ${name}: ${dim(`skipped — ${e.message}`)}`);
        continue;
    }

    const orphans = [];
    for (const entry of top) {
        if (entry.id !== null) {
            console.log(`  ${name}/${entry.name}  ${dim("root-level file, left alone")}`);
            continue;
        }
        if (!owners[owner].has(entry.name)) orphans.push(...(await listFilesUnder(name, entry.name)));
    }

    console.log(`  ${name}: ${orphans.length} orphaned file(s)`);
    orphans.forEach((p) => console.log(dim(`    ${p}`)));
    total += orphans.length;

    if (apply) {
        for (let i = 0; i < orphans.length; i += 100) {
            const { error } = await supabase.storage.from(name).remove(orphans.slice(i, i + 100));
            if (error) throw new Error(`removing from ${name}: ${error.message}`);
        }
    }
}

console.log(
    `\n${total} file(s) ${apply ? green("removed") : "would be removed"}.` +
        (apply || total === 0 ? "" : `  Re-run with ${green("--apply")} to delete them.`) + "\n",
);

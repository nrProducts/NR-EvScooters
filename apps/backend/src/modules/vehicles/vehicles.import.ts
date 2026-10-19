import type { Request } from "express";
import type { Workbook, Worksheet, CellValue } from "exceljs";
import { supabaseAdmin } from "../../config/supabase";
import { badRequest, businessRule, conflict } from "../../common/AppError";
import { writeAudit } from "../../common/audit";
import { AuthContext } from "../../types";
import { createVehicleBody } from "./vehicles.validation";
import type { CreateVehicleInput } from "./vehicles.types";

/**
 * Bulk vehicle import for the admin console: download a template, fill it in
 * Excel, upload it to PREVIEW (nothing written), confirm, COMMIT.
 *
 * Every row is held to exactly the rules of the single "Add vehicle" form —
 * it runs through the same `createVehicleBody` schema — plus the two checks a
 * batch adds: duplicates inside the file, and duplicates against the fleet
 * already in the database. Commit re-runs all of it server-side rather than
 * trusting the preview the browser saw, and inserts in ONE statement, so a
 * file lands completely or not at all.
 */

export const IMPORT_SHEET = "Vehicles";
export const MAX_IMPORT_ROWS = 500;

/** The template's columns, in order. `key` is what a row is parsed into. */
export const IMPORT_COLUMNS = [
    { key: "registration_number", header: "Registration number *", width: 22, required: true },
    { key: "vin", header: "VIN *", width: 24, required: true },
    { key: "model", header: "Model *", width: 22, required: true },
    { key: "name", header: "Display name", width: 20, required: false },
    { key: "hub_code", header: "Hub code", width: 14, required: false },
    { key: "color", header: "Colour", width: 14, required: false },
    { key: "qr_code", header: "QR code", width: 18, required: false },
    { key: "imei", header: "IMEI", width: 20, required: false },
    { key: "purchase_date", header: "Purchase date (YYYY-MM-DD)", width: 26, required: false },
    { key: "batch_number", header: "Batch number", width: 16, required: false },
] as const;

type ColumnKey = (typeof IMPORT_COLUMNS)[number]["key"];

/** One spreadsheet row, as typed — every value a trimmed string or null. */
export type RawImportRow = { row: number } & Record<ColumnKey, string | null>;

export interface ImportRowResult extends RawImportRow {
    /** Resolved from `model` / `hub_code`; null when they could not be. */
    vehicle_model_id: string | null;
    hub_id: string | null;
    errors: string[];
}

export interface ImportPreview {
    total: number;
    valid: number;
    invalid: number;
    rows: ImportRowResult[];
}

/** What the lookups resolve against — loaded once per preview/commit. */
export interface ImportLookups {
    /** lower(model name) → ids of live models with that name (more than one = ambiguous). */
    models: Map<string, string[]>;
    /** lower(hub code) → hub id. */
    hubs: Map<string, string>;
    /** lower(value) of each unique field already used in the fleet. */
    existing: Record<"registration_number" | "vin" | "qr_code" | "imei", Set<string>>;
}

const FIELD_LABELS: Record<string, string> = Object.fromEntries(
    IMPORT_COLUMNS.map((c) => [c.key, c.header.replace(/\s*\*$/, "").replace(/\s*\(.*\)$/, "")]),
);
FIELD_LABELS.vehicle_model_id = "Model";
FIELD_LABELS.hub_id = "Hub code";

const UNIQUE_FIELDS = ["registration_number", "vin", "qr_code", "imei"] as const;

// ---------------------------------------------------------------------------
// Parsing (pure)
// ---------------------------------------------------------------------------

/** "Registration number *" → "registrationnumber", so headers match however they're cased or starred. */
function headerKey(text: string): string {
    return text.toLowerCase().replace(/\(.*\)/, "").replace(/[^a-z0-9]/g, "");
}

const HEADER_TO_KEY = new Map<string, ColumnKey>([
    ...IMPORT_COLUMNS.map((c) => [headerKey(c.header), c.key] as [string, ColumnKey]),
    ["color", "color"], ["registrationno", "registration_number"], ["regno", "registration_number"],
    ["name", "name"], ["hub", "hub_code"], ["modelname", "model"],
]);

function isoDate(d: Date): string {
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** Any ExcelJS cell value → trimmed text, or null when blank. Dates become YYYY-MM-DD. */
export function cellText(value: CellValue | undefined): string | null {
    if (value === null || value === undefined) return null;
    if (value instanceof Date) return isoDate(value);
    if (typeof value === "object") {
        const v = value as unknown as Record<string, unknown>;
        if (Array.isArray(v.richText)) return cellText((v.richText as Array<{ text: string }>).map((p) => p.text).join(""));
        if ("result" in v) return cellText(v.result as CellValue);     // formula
        if ("text" in v) return cellText(v.text as CellValue);         // hyperlink
        if ("error" in v) return null;                                 // #N/A and friends
        return null;
    }
    // Numbers keep every digit (an IMEI typed into a General cell arrives as a number).
    const text = typeof value === "number" ? (Number.isInteger(value) ? value.toFixed(0) : String(value)) : String(value);
    const trimmed = text.trim();
    return trimmed === "" ? null : trimmed;
}

/** DD-MM-YYYY / DD/MM/YYYY → YYYY-MM-DD; anything else is passed through for the schema to judge. */
export function normaliseDate(text: string | null): string | null {
    if (!text) return null;
    const dmy = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
    if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
    return text;
}

/**
 * Reads the Vehicles sheet into raw rows. Columns are found by their header
 * text, not their position, so a reordered or extra column still works.
 * Blank rows are skipped; the row number is the spreadsheet's own, so an
 * error can say "row 7" and mean the row the admin sees.
 */
export function parseVehicleSheet(sheet: Worksheet): RawImportRow[] {
    const columnOf = new Map<ColumnKey, number>();
    sheet.getRow(1).eachCell((cell, col) => {
        const key = HEADER_TO_KEY.get(headerKey(cellText(cell.value) ?? ""));
        if (key && !columnOf.has(key)) columnOf.set(key, col);
    });
    const missing = IMPORT_COLUMNS.filter((c) => c.required && !columnOf.has(c.key)).map((c) => c.header);
    if (missing.length > 0) {
        throw badRequest(`The file is missing these columns: ${missing.join(", ")}. Download the template and use it as-is.`);
    }

    const rows: RawImportRow[] = [];
    for (let r = 2; r <= sheet.rowCount; r++) {
        const sheetRow = sheet.getRow(r);
        const raw = { row: r } as RawImportRow;
        let hasValue = false;
        for (const { key } of IMPORT_COLUMNS) {
            const col = columnOf.get(key);
            const value = col ? sheetRow.getCell(col).value : null;
            if (key === "purchase_date") {
                // A date typed into a text-formatted cell can come back as
                // Excel's day serial (46313 = 2026-10-18) rather than a Date.
                raw[key] = typeof value === "number" && value > 20000 && value < 80000
                    ? isoDate(new Date(Math.round((value - 25569) * 86_400_000)))
                    : normaliseDate(cellText(value));
            } else {
                raw[key] = cellText(value);
            }
            if (raw[key] !== null) hasValue = true;
        }
        if (hasValue) rows.push(raw);
    }
    if (rows.length === 0) throw badRequest("The Vehicles sheet has no rows to import.");
    if (rows.length > MAX_IMPORT_ROWS) {
        throw badRequest(`A file can hold at most ${MAX_IMPORT_ROWS} vehicles; this one has ${rows.length}. Split it into smaller files.`);
    }
    return rows;
}

// ---------------------------------------------------------------------------
// Validation (pure)
// ---------------------------------------------------------------------------

/**
 * Checks every row and returns the full picture — every problem on every
 * row, not just the first — so the admin fixes the file in one pass.
 */
export function validateImportRows(rows: RawImportRow[], lookups: ImportLookups): ImportPreview {
    // Within-file duplicates: value → rows that use it.
    const seen: Record<(typeof UNIQUE_FIELDS)[number], Map<string, number[]>> = {
        registration_number: new Map(), vin: new Map(), qr_code: new Map(), imei: new Map(),
    };
    for (const raw of rows) {
        for (const field of UNIQUE_FIELDS) {
            const v = raw[field]?.toLowerCase();
            if (v) seen[field].set(v, [...(seen[field].get(v) ?? []), raw.row]);
        }
    }

    const results = rows.map((raw): ImportRowResult => {
        const errors: string[] = [];

        let vehicleModelId: string | null = null;
        if (raw.model) {
            const ids = lookups.models.get(raw.model.toLowerCase()) ?? [];
            if (ids.length === 1) vehicleModelId = ids[0];
            else if (ids.length > 1) errors.push(`Model: more than one model is called "${raw.model}". Ask an admin to rename one.`);
            else errors.push(`Model: no model called "${raw.model}". Pick one from the list in the template.`);
        }

        let hubId: string | null = null;
        if (raw.hub_code) {
            hubId = lookups.hubs.get(raw.hub_code.toLowerCase()) ?? null;
            if (!hubId) errors.push(`Hub code: no hub with code "${raw.hub_code}".`);
        }

        // The single-vehicle form's own schema, field for field.
        const candidate: Record<string, string> = {};
        const put = (key: string, value: string | null) => { if (value !== null) candidate[key] = value; };
        put("name", raw.name);
        put("registration_number", raw.registration_number ?? "");
        put("vin", raw.vin ?? "");
        if (vehicleModelId) candidate.vehicle_model_id = vehicleModelId;
        put("hub_id", hubId);
        put("color", raw.color);
        put("qr_code", raw.qr_code);
        put("imei", raw.imei);
        put("purchase_date", raw.purchase_date);
        put("batch_number", raw.batch_number);
        const parsed = createVehicleBody.safeParse(candidate);
        if (!parsed.success) {
            for (const issue of parsed.error.issues) {
                const field = String(issue.path[0] ?? "");
                // A missing model id means the lookup above already explained why.
                if (field === "vehicle_model_id" && raw.model) continue;
                if (field === "vehicle_model_id") { errors.push("Model: enter the model name."); continue; }
                errors.push(`${FIELD_LABELS[field] ?? field}: ${issue.message}`);
            }
        }

        for (const field of UNIQUE_FIELDS) {
            const value = raw[field];
            if (!value) continue;
            const others = (seen[field].get(value.toLowerCase()) ?? []).filter((r) => r !== raw.row);
            if (others.length > 0) {
                errors.push(`${FIELD_LABELS[field]}: "${value}" is also used on row ${others.join(", ")} of this file.`);
            }
            if (lookups.existing[field].has(value.toLowerCase())) {
                errors.push(`${FIELD_LABELS[field]}: "${value}" is already used by a vehicle in the fleet.`);
            }
        }

        return { ...raw, vehicle_model_id: vehicleModelId, hub_id: hubId, errors };
    });

    const invalid = results.filter((r) => r.errors.length > 0).length;
    return { total: results.length, valid: results.length - invalid, invalid, rows: results };
}

/** A valid row → exactly what createVehicle would insert. */
export function toVehicleInsert(row: ImportRowResult): Record<string, unknown> {
    const input: CreateVehicleInput = {
        name: row.name ?? undefined,
        registration_number: row.registration_number!,
        vin: row.vin!,
        vehicle_model_id: row.vehicle_model_id!,
        hub_id: row.hub_id ?? undefined,
        color: row.color ?? undefined,
        qr_code: row.qr_code ?? undefined,
        imei: row.imei ?? undefined,
        purchase_date: row.purchase_date ?? undefined,
        batch_number: row.batch_number ?? undefined,
    };
    return {
        display_name: input.name ?? null,
        registration_number: input.registration_number,
        vin: input.vin,
        vehicle_model_id: input.vehicle_model_id,
        hub_id: input.hub_id ?? null,
        colour: input.color ?? null,
        qr_code: input.qr_code ?? null,
        imei: input.imei ?? null,
        purchased_on: input.purchase_date ?? null,
        batch_number: input.batch_number ?? null,
        // No `status` — same as createVehicle: recompute_vehicle_status() owns it.
    };
}

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

async function loadExcelJS(): Promise<typeof import("exceljs")> {
    const mod = await import("exceljs");
    return (mod as unknown as { default?: typeof mod }).default ?? mod;
}

async function liveModels(): Promise<Array<{ id: string; name: string }>> {
    const { data, error } = await supabaseAdmin
        .from("vehicle_models")
        .select("id, name")
        .is("deleted_at", null)
        .order("name");
    if (error) throw error;
    return data ?? [];
}

async function liveHubs(): Promise<Array<{ id: string; code: string; name: string }>> {
    const { data, error } = await supabaseAdmin
        .from("hubs")
        .select("id, code, name")
        .is("deleted_at", null)
        .eq("is_active", true)
        .order("code");
    if (error) throw error;
    return data ?? [];
}

/** Which of these values the fleet already uses, per unique field (chunked `in` lists). */
async function existingValues(rows: RawImportRow[]): Promise<ImportLookups["existing"]> {
    const existing: ImportLookups["existing"] = {
        registration_number: new Set(), vin: new Set(), qr_code: new Set(), imei: new Set(),
    };
    for (const field of UNIQUE_FIELDS) {
        const values = [...new Set(rows.map((r) => r[field]).filter((v): v is string => !!v))];
        // Case variants too: the column is compared as typed, a duplicate plate is not.
        const probes = [...new Set(values.flatMap((v) => [v, v.toUpperCase(), v.toLowerCase()]))];
        for (let i = 0; i < probes.length; i += 150) {
            const { data, error } = await supabaseAdmin
                .from("vehicles")
                .select(field)
                .in(field, probes.slice(i, i + 150));
            if (error) throw error;
            for (const row of (data ?? []) as unknown as Array<Record<string, string | null>>) {
                const v = row[field];
                if (v) existing[field].add(v.toLowerCase());
            }
        }
    }
    return existing;
}

async function loadLookups(rows: RawImportRow[]): Promise<ImportLookups> {
    const [models, hubs, existing] = await Promise.all([liveModels(), liveHubs(), existingValues(rows)]);
    const modelMap = new Map<string, string[]>();
    for (const m of models) modelMap.set(m.name.toLowerCase(), [...(modelMap.get(m.name.toLowerCase()) ?? []), m.id]);
    return {
        models: modelMap,
        hubs: new Map(hubs.map((h) => [h.code.toLowerCase(), h.id])),
        existing,
    };
}

/** The template, with live model names and hub codes as dropdowns. */
export async function buildImportTemplate(): Promise<Buffer> {
    const ExcelJS = await loadExcelJS();
    const [models, hubs] = await Promise.all([liveModels(), liveHubs()]);

    const wb: Workbook = new ExcelJS.Workbook();
    wb.creator = "Swapngo";
    const GREEN = "FF21C45D";

    const sheet = wb.addWorksheet(IMPORT_SHEET, { views: [{ state: "frozen", ySplit: 1 }] });
    sheet.columns = IMPORT_COLUMNS.map((c) => ({
        header: c.header, key: c.key, width: c.width,
        // Text format everywhere: an IMEI or a numeric QR code must not turn into 3.5E+14.
        style: { numFmt: "@" },
    }));
    const header = sheet.getRow(1);
    header.height = 22;
    header.eachCell((cell, col) => {
        cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: IMPORT_COLUMNS[col - 1].required ? GREEN : "FF4B5563" } };
        cell.alignment = { vertical: "middle" };
    });

    const lists = wb.addWorksheet("Lists");
    lists.columns = [
        { header: "Model", key: "model", width: 26 },
        { header: "Hub code", key: "hub_code", width: 14 },
        { header: "Hub name", key: "hub_name", width: 30 },
    ];
    lists.getRow(1).font = { bold: true };
    const listLength = Math.max(models.length, hubs.length);
    for (let i = 0; i < listLength; i++) {
        lists.addRow({ model: models[i]?.name ?? null, hub_code: hubs[i]?.code ?? null, hub_name: hubs[i]?.name ?? null });
    }

    const modelCol = IMPORT_COLUMNS.findIndex((c) => c.key === "model") + 1;
    const hubCol = IMPORT_COLUMNS.findIndex((c) => c.key === "hub_code") + 1;
    for (let r = 2; r <= MAX_IMPORT_ROWS + 1; r++) {
        if (models.length > 0) {
            sheet.getCell(r, modelCol).dataValidation = {
                type: "list", allowBlank: true, formulae: [`Lists!$A$2:$A$${models.length + 1}`],
                showErrorMessage: true, errorTitle: "Unknown model", error: "Pick a model from the list.",
            };
        }
        if (hubs.length > 0) {
            sheet.getCell(r, hubCol).dataValidation = {
                type: "list", allowBlank: true, formulae: [`Lists!$B$2:$B$${hubs.length + 1}`],
                showErrorMessage: true, errorTitle: "Unknown hub", error: "Pick a hub code from the list, or leave it blank.",
            };
        }
    }

    const help = wb.addWorksheet("Instructions");
    help.getColumn(1).width = 30;
    help.getColumn(2).width = 80;
    const lines: Array<[string, string]> = [
        ["How to use this file", ""],
        ["1", `Fill one vehicle per row on the "${IMPORT_SHEET}" sheet, starting at row 2. Keep the header row as it is.`],
        ["2", "Columns marked * are required. Leave optional columns blank if you don't have the value."],
        ["3", `Model and Hub code have dropdowns. The valid values are listed on the "Lists" sheet.`],
        ["4", "Registration number, VIN, QR code and IMEI must be unique, in this file and across the fleet."],
        ["5", "Purchase date: YYYY-MM-DD (e.g. 2026-10-18). DD-MM-YYYY is also accepted."],
        ["6", `Up to ${MAX_IMPORT_ROWS} vehicles per file. Upload it in the admin console under Vehicles → Bulk import.`],
        ["7", "You'll see every row checked before anything is saved, and confirm the import yourself."],
        ["", ""],
        ["Example row", ""],
    ];
    for (const [a, b] of lines) help.addRow([a, b]);
    help.getRow(1).font = { bold: true, size: 13 };
    help.getRow(10).font = { bold: true };
    const exampleHeader = help.addRow(IMPORT_COLUMNS.map((c) => c.header));
    exampleHeader.font = { bold: true };
    help.addRow([
        "TN22AB0009", "MD9MVS7A1RN000009", models[0]?.name ?? "MVS7", "Scoot 09", hubs[0]?.code ?? "",
        "Blue", "QR-0009", "356938035643809", "2026-10-18", "B-2026-10",
    ]);

    return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Reads an uploaded workbook into raw rows. */
export async function readImportFile(buffer: Buffer): Promise<RawImportRow[]> {
    const ExcelJS = await loadExcelJS();
    const wb: Workbook = new ExcelJS.Workbook();
    try {
        await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    } catch {
        throw badRequest("That file could not be read. Upload the .xlsx template (not .xls or .csv).");
    }
    const sheet = wb.getWorksheet(IMPORT_SHEET) ?? wb.worksheets[0];
    if (!sheet) throw badRequest("The file has no sheets.");
    return parseVehicleSheet(sheet);
}

/** Upload → checked rows. Writes nothing. */
export async function previewImport(buffer: Buffer): Promise<ImportPreview> {
    const rows = await readImportFile(buffer);
    return validateImportRows(rows, await loadLookups(rows));
}

/**
 * Confirmed rows → vehicles. Re-validates from scratch: the preview is what
 * the admin agreed to, not something to trust, and the fleet may have changed
 * since (another admin added the same plate a minute ago). Any invalid row
 * fails the whole import with the reasons, and the insert is one statement —
 * it is never half-done.
 */
export async function commitImport(
    rows: RawImportRow[],
    actor: AuthContext,
    req?: Request,
): Promise<{ created: number; vehicles: Array<{ id: string; registration_number: string }> }> {
    if (rows.length === 0) throw businessRule("There are no vehicles to import.");
    if (rows.length > MAX_IMPORT_ROWS) throw businessRule(`Import at most ${MAX_IMPORT_ROWS} vehicles at a time.`);

    const checked = validateImportRows(rows, await loadLookups(rows));
    if (checked.invalid > 0) {
        const first = checked.rows.filter((r) => r.errors.length > 0).slice(0, 5)
            .map((r) => `Row ${r.row}: ${r.errors.join("; ")}`);
        throw conflict(
            `${checked.invalid} row${checked.invalid === 1 ? " is" : "s are"} no longer valid, so nothing was imported. ${first.join(" ")}`,
        );
    }

    const { data, error } = await supabaseAdmin
        .from("vehicles")
        .insert(checked.rows.map(toVehicleInsert) as never)
        .select("id, registration_number");
    if (error) {
        if ((error as { code?: string }).code === "23505") {
            throw conflict("One of these vehicles was added by someone else just now, so nothing was imported. Check the file again.");
        }
        throw error;
    }

    const vehicles = (data ?? []) as Array<{ id: string; registration_number: string }>;
    await writeAudit({
        actorId: actor.id,
        targetUserId: null,
        action: "vehicle.bulk_imported",
        entityType: "vehicle",
        entityId: vehicles[0]?.id ?? "bulk",
        after: {
            count: vehicles.length,
            vehicle_ids: vehicles.map((v) => v.id),
            registration_numbers: vehicles.map((v) => v.registration_number),
        },
        req,
    });

    return { created: vehicles.length, vehicles };
}

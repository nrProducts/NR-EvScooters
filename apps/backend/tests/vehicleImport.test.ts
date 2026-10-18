import { beforeEach, describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";
import { createFakeSupabase, FakeSupabase } from "./helpers/fakeSupabase";

const h = vi.hoisted(() => ({
    fake: null as unknown as FakeSupabase,
    writeAudit: vi.fn(async () => undefined),
    /** Values the "fleet" already holds, per unique column. */
    taken: {} as Record<string, string[]>,
}));

vi.mock("../src/config/supabase", () => ({
    supabaseAdmin: { from: (table: string) => h.fake.from(table) },
}));
vi.mock("../src/common/audit", () => ({ writeAudit: h.writeAudit }));

import {
    buildImportTemplate, commitImport, previewImport, validateImportRows,
    type ImportLookups, type RawImportRow,
} from "../src/modules/vehicles/vehicles.import";

const MODEL_ID = "11111111-1111-4111-8111-111111111111";
const HUB_ID = "22222222-2222-4222-8222-222222222222";
const ADMIN = { id: "admin-1", role: "admin", permissions: new Set(), status: "active", kycStatus: "verified", isDeleted: false } as never;

beforeEach(() => {
    vi.clearAllMocks();
    h.taken = {};
    h.fake = createFakeSupabase((q) => {
        if (q.table === "vehicle_models") return { data: [{ id: MODEL_ID, name: "MVS7" }] };
        if (q.table === "hubs") return { data: [{ id: HUB_ID, code: "CHN01", name: "Chennai Central" }] };
        if (q.table === "vehicles" && q.op === "select") {
            const [, column, values] = q.filters.find(([op]) => op === "in") ?? [];
            const taken = h.taken[column as string] ?? [];
            return { data: (values as string[]).filter((v) => taken.includes(v)).map((v) => ({ [column as string]: v })) };
        }
        if (q.table === "vehicles" && q.op === "insert") {
            const rows = q.payload as unknown as Array<{ registration_number: string }>;
            return { data: rows.map((r, i) => ({ id: `v-${i}`, registration_number: r.registration_number })) };
        }
        return { data: null };
    });
});

/** The real template, filled in the way an admin would in Excel. */
async function filledTemplate(rows: unknown[][]): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await buildImportTemplate() as unknown as ArrayBuffer);
    const sheet = wb.getWorksheet("Vehicles")!;
    rows.forEach((values, i) => sheet.getRow(i + 2).values = values as ExcelJS.CellValue[]);
    return Buffer.from(await wb.xlsx.writeBuffer());
}

function raw(overrides: Partial<RawImportRow> = {}): RawImportRow {
    return {
        row: 2, registration_number: "TN22AB0001", vin: "VIN0001", model: "MVS7", name: null, hub_code: null,
        color: null, qr_code: null, imei: null, purchase_date: null, batch_number: null, ...overrides,
    };
}

const LOOKUPS: ImportLookups = {
    models: new Map([["mvs7", [MODEL_ID]]]),
    hubs: new Map([["chn01", HUB_ID]]),
    existing: { registration_number: new Set(), vin: new Set(), qr_code: new Set(), imei: new Set() },
};

describe("template", () => {
    it("has the Vehicles, Lists and Instructions sheets, with live models and hubs listed", async () => {
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(await buildImportTemplate() as unknown as ArrayBuffer);

        expect(wb.worksheets.map((s) => s.name)).toEqual(["Vehicles", "Lists", "Instructions"]);
        expect(wb.getWorksheet("Vehicles")!.getRow(1).getCell(1).value).toBe("Registration number *");
        expect(wb.getWorksheet("Lists")!.getCell("A2").value).toBe("MVS7");
        expect(wb.getWorksheet("Lists")!.getCell("B2").value).toBe("CHN01");
        expect(wb.getWorksheet("Vehicles")!.getCell("C2").dataValidation?.formulae).toEqual(["Lists!$A$2:$A$2"]);
    });
});

describe("previewImport — reading a filled template", () => {
    it("reads every filled row, skips blank ones, and resolves model and hub", async () => {
        const file = await filledTemplate([
            ["TN22AB0001", "VIN0001", "MVS7", "Scoot 01", "CHN01", "Blue", "QR-1", 356938035643809, new Date(Date.UTC(2026, 9, 18)), "B-1"],
            [],
            ["TN22AB0002", "VIN0002", "mvs7", null, null, null, null, null, "18-10-2026", null],
        ]);

        const preview = await previewImport(file);

        expect(preview.rows.flatMap((r) => r.errors)).toEqual([]);
        expect(preview).toMatchObject({ total: 2, valid: 2, invalid: 0 });
        expect(preview.rows[0]).toMatchObject({
            row: 2, vehicle_model_id: MODEL_ID, hub_id: HUB_ID,
            imei: "356938035643809",        // every digit kept, no 3.5E+14
            purchase_date: "2026-10-18",     // an Excel date cell
        });
        expect(preview.rows[1]).toMatchObject({ row: 4, purchase_date: "2026-10-18" }); // DD-MM-YYYY accepted
    });

    it("writes nothing", async () => {
        await previewImport(await filledTemplate([["TN22AB0001", "VIN0001", "MVS7"]]));
        expect(h.fake.on("vehicles", "insert")).toHaveLength(0);
    });

    it("rejects a file without the required columns", async () => {
        const wb = new ExcelJS.Workbook();
        wb.addWorksheet("Vehicles").addRow(["Plate", "Something"]);
        const file = Buffer.from(await wb.xlsx.writeBuffer());
        await expect(previewImport(file)).rejects.toThrow(/missing these columns/);
    });

    it("rejects something that is not an xlsx", async () => {
        await expect(previewImport(Buffer.from("plate,vin\nTN1,V1"))).rejects.toThrow(/could not be read/);
    });
});

describe("validateImportRows — same rules as Add vehicle, plus batch checks", () => {
    it("reports every problem on a row, not just the first", () => {
        const result = validateImportRows([raw({ registration_number: null, vin: null, model: "Nope", purchase_date: "2026-13-45" })], LOOKUPS);
        const errors = result.rows[0].errors.join(" | ");

        expect(result.invalid).toBe(1);
        expect(errors).toMatch(/Registration number/);
        expect(errors).toMatch(/VIN/);
        expect(errors).toMatch(/no model called "Nope"/);
        expect(errors).toMatch(/Purchase date/);
    });

    it("flags duplicates inside the file, naming the other row", () => {
        const result = validateImportRows([
            raw({ row: 2 }),
            raw({ row: 3, registration_number: "tn22ab0001", vin: "VIN0002" }),
        ], LOOKUPS);
        expect(result.rows[1].errors).toContain('Registration number: "tn22ab0001" is also used on row 2 of this file.');
    });

    it("flags a value the fleet already uses", () => {
        const result = validateImportRows([raw({ imei: "111" })], {
            ...LOOKUPS, existing: { ...LOOKUPS.existing, imei: new Set(["111"]) },
        });
        expect(result.rows[0].errors).toContain('IMEI: "111" is already used by a vehicle in the fleet.');
    });

    it("flags an unknown hub code and an ambiguous model name", () => {
        const result = validateImportRows([raw({ hub_code: "XX9" })], {
            ...LOOKUPS, models: new Map([["mvs7", [MODEL_ID, "other-id"]]]),
        });
        const errors = result.rows[0].errors.join(" | ");
        expect(errors).toMatch(/no hub with code "XX9"/);
        expect(errors).toMatch(/more than one model is called "MVS7"/);
    });
});

describe("commitImport", () => {
    it("inserts every row in one statement and audits the batch", async () => {
        const result = await commitImport([raw({ row: 2 }), raw({ row: 3, registration_number: "TN22AB0002", vin: "VIN0002" })], ADMIN);

        expect(result.created).toBe(2);
        const inserts = h.fake.on("vehicles", "insert");
        expect(inserts).toHaveLength(1);
        expect(inserts[0].payload).toEqual([
            expect.objectContaining({ registration_number: "TN22AB0001", vehicle_model_id: MODEL_ID }),
            expect.objectContaining({ registration_number: "TN22AB0002" }),
        ]);
        expect(inserts[0].payload).not.toEqual(expect.arrayContaining([expect.objectContaining({ status: expect.anything() })]));
        expect(h.writeAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "vehicle.bulk_imported" }));
    });

    it("imports nothing when any row has become invalid since the preview", async () => {
        h.taken = { registration_number: ["TN22AB0002"] }; // someone added it meanwhile
        await expect(commitImport(
            [raw({ row: 2 }), raw({ row: 3, registration_number: "TN22AB0002", vin: "VIN0002" })], ADMIN,
        )).rejects.toThrow(/nothing was imported/);
        expect(h.fake.on("vehicles", "insert")).toHaveLength(0);
    });
});

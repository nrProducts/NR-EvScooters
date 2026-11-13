import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * "Change status" on the Vehicles list (vehicleStatus.service.ts). The
 * maintenance and rental actions it orchestrates have their own tests; these
 * pin down which of them run, in what order, and what is refused before
 * anything changes. Same per-table queue idiom as tests/referrals.test.ts.
 */
type Result = { data: unknown; error: unknown };

class TableStub {
    constructor(private result: Result) {}
    select = () => this;
    eq = () => this;
    in = () => this;
    is = () => this;
    maybeSingle = () => Promise.resolve(this.result);
    then(onFulfilled: (v: Result) => unknown) {
        return Promise.resolve(this.result).then(onFulfilled);
    }
}

let queues: Record<string, Result[]>;
function queue(table: string, result: Result) {
    (queues[table] ??= []).push(result);
}

vi.mock("../src/config/supabase", () => ({
    supabaseAdmin: {
        from: (table: string) => {
            const next = queues[table]?.shift();
            if (!next) throw new Error(`No queued result for table "${table}"`);
            return new TableStub(next);
        },
    },
}));

const order: string[] = [];
const endPlan = vi.fn(async () => { order.push("end_plan"); return null; });
const resolveTicket = vi.fn(async () => { order.push("resolve"); return {}; });
const createTicket = vi.fn(async () => { order.push("create_ticket"); return { id: "ticket-1" }; });
const tempVehicle = vi.fn(async () => { order.push("temp_vehicle"); return {}; });
const pausePlan = vi.fn(async () => { order.push("pause"); return {}; });

vi.mock("../src/modules/rentals/rentals.service", () => ({ adminEndPlanNow: endPlan }));
vi.mock("../src/modules/maintenance/maintenance.service", () => ({
    updateMaintenanceTicket: resolveTicket,
    createMaintenanceTicket: createTicket,
    assignTempVehicle: tempVehicle,
    triagePausePlan: pausePlan,
}));
vi.mock("../src/modules/vehicles/vehicles.service", () => ({
    getVehicleById: vi.fn(async (id: string) => ({ id })),
}));

const { changeVehicleStatus } = await import("../src/modules/vehicles/vehicleStatus.service");
const actor = { id: "admin-1", role: "admin" } as never;

const vehicle = (status: string) => queue("vehicles", { data: { id: "v1", status }, error: null });
const riderOn = (rentalStatus: string | null) =>
    queue("rental_vehicle_assignments", {
        data: rentalStatus ? { rental_id: "r1", rentals: { status: rentalStatus, user_id: "rider-1" } } : null,
        error: null,
    });

beforeEach(() => {
    queues = {};
    order.length = 0;
    vi.clearAllMocks();
});

describe("Available", () => {
    it("closes open maintenance first, then ends the plan of whoever is still on the scooter", async () => {
        vehicle("maintenance");
        queue("maintenance_tickets", { data: [{ id: "t1" }, { id: "t2" }], error: null });

        await changeVehicleStatus("v1", { status: "available" }, actor);

        expect(order).toEqual(["resolve", "resolve", "end_plan"]);
        expect(resolveTicket).toHaveBeenCalledWith("t1", { status: "resolved" }, actor);
    });

    it("refuses a scooter held for a booking, changing nothing", async () => {
        vehicle("reserved");

        await expect(changeVehicleStatus("v1", { status: "available" }, actor)).rejects.toThrow(/held for a booking/);
        expect(order).toEqual([]);
    });
});

describe("Maintenance", () => {
    const toMaintenance = { status: "maintenance" as const, description: "Brake noise" };

    it("opens a ticket straight away when nobody is riding the scooter", async () => {
        vehicle("available");
        riderOn(null);

        await changeVehicleStatus("v1", toMaintenance, actor);

        expect(order).toEqual(["create_ticket"]);
    });

    it("requires a choice for the rider before changing anything", async () => {
        vehicle("assigned");
        riderOn("active");

        await expect(changeVehicleStatus("v1", toMaintenance, actor)).rejects.toThrow(/what happens to the rider/);
        expect(order).toEqual([]);
    });

    it("hands the rider a temp scooter on the new ticket", async () => {
        vehicle("assigned");
        riderOn("active");
        queue("vehicles", { data: { status: "available" }, error: null }); // the temp scooter

        await changeVehicleStatus("v1", { ...toMaintenance, rider_action: "temp_vehicle", temp_vehicle_id: "v2" }, actor);

        expect(order).toEqual(["create_ticket", "temp_vehicle"]);
        expect(tempVehicle).toHaveBeenCalledWith("ticket-1", { temp_vehicle_id: "v2" }, actor);
    });

    it("refuses a temp scooter that isn't available, before opening a ticket", async () => {
        vehicle("assigned");
        riderOn("active");
        queue("vehicles", { data: { status: "assigned" }, error: null });

        await expect(
            changeVehicleStatus("v1", { ...toMaintenance, rider_action: "temp_vehicle", temp_vehicle_id: "v2" }, actor),
        ).rejects.toThrow(/isn't available/);
        expect(order).toEqual([]);
    });

    it("pauses the plan on the new ticket", async () => {
        vehicle("assigned");
        riderOn("active");

        await changeVehicleStatus("v1", { ...toMaintenance, rider_action: "pause" }, actor);

        expect(order).toEqual(["create_ticket", "pause"]);
    });

    it("ends the plan before opening the ticket, so the ticket displaces nobody", async () => {
        vehicle("assigned");
        riderOn("active");

        await changeVehicleStatus("v1", { ...toMaintenance, rider_action: "end_plan" }, actor);

        expect(order).toEqual(["end_plan", "create_ticket"]);
    });

    it("refuses a scooter already in maintenance", async () => {
        vehicle("maintenance");

        await expect(changeVehicleStatus("v1", toMaintenance, actor)).rejects.toThrow(/already in maintenance/);
    });
});

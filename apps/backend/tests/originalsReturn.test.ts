import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Completing a return: if original documents are held, staff must answer
 * "returned?" — and the answer is applied only to what is still held.
 */
const state = {
    held: [] as { id: string; doc_type: string; other_label: string | null }[],
    updates: [] as Record<string, unknown>[],
    audits: [] as Record<string, unknown>[],
    heldError: false,
};

vi.mock("../src/config/supabase", () => {
    const from = () => {
        const chain: Record<string, unknown> = {};
        let isUpdate = false;
        let payload: Record<string, unknown> = {};
        chain.select = () => chain;
        chain.update = (p: Record<string, unknown>) => { isUpdate = true; payload = p; return chain; };
        chain.eq = () => {
            if (isUpdate) {
                // update(...).eq(rental).eq(status) — resolved on the second eq
                return Object.assign(Promise.resolve({ error: null }), {
                    eq: () => { state.updates.push(payload); return Promise.resolve({ error: null }); },
                });
            }
            return Object.assign(chain, {
                eq: () => Promise.resolve(state.heldError ? { data: null, error: { message: "missing" } } : { data: state.held, error: null }),
            });
        };
        return chain;
    };
    return { supabaseAdmin: { from } };
});

vi.mock("../src/common/audit", () => ({
    writeAudit: async (entry: Record<string, unknown>) => { state.audits.push(entry); },
}));

import {
    applyOriginalsAnswer, assertOriginalsAnswered, heldDocumentsForRental,
} from "../src/modules/originals/originals.service";

const actor = { id: "staff-1", role: "staff" } as never;

beforeEach(() => {
    state.held = [];
    state.updates = [];
    state.audits = [];
    state.heldError = false;
});

describe("heldDocumentsForRental", () => {
    it("labels what is held, using the typed text for 'other'", async () => {
        state.held = [
            { id: "a", doc_type: "driving_licence", other_label: null },
            { id: "b", doc_type: "other", other_label: "Ration card" },
        ];
        expect(await heldDocumentsForRental("r1")).toEqual([
            { id: "a", label: "Driving licence" },
            { id: "b", label: "Ration card" },
        ]);
    });

    it("treats an unreadable table (not migrated yet) as 'nothing held' so returns are never blocked", async () => {
        state.heldError = true;
        expect(await heldDocumentsForRental("r1")).toEqual([]);
    });
});

describe("assertOriginalsAnswered", () => {
    it("lets a return through when nothing is held, answered or not", async () => {
        await expect(assertOriginalsAnswered("r1", undefined)).resolves.toEqual([]);
    });

    it("REFUSES to complete a return with originals held and no answer", async () => {
        state.held = [{ id: "a", doc_type: "voter_id", other_label: null }];
        await expect(assertOriginalsAnswered("r1", undefined)).rejects.toThrow(/original documents returned/i);
    });

    it("accepts yes and no", async () => {
        state.held = [{ id: "a", doc_type: "voter_id", other_label: null }];
        await expect(assertOriginalsAnswered("r1", true)).resolves.toHaveLength(1);
        await expect(assertOriginalsAnswered("r1", false)).resolves.toHaveLength(1);
    });
});

describe("applyOriginalsAnswer", () => {
    const held = [{ id: "a", label: "Voter ID" }];

    it("YES marks the held originals returned (by this staff member) and audits it", async () => {
        await applyOriginalsAnswer({ rentalId: "r1", userId: "u1", held, answer: true, actor });
        expect(state.updates).toHaveLength(1);
        expect(state.updates[0]).toMatchObject({ status: "returned", returned_by: "staff-1" });
        expect(state.updates[0].returned_at).toBeTruthy();
        expect(state.audits[0]).toMatchObject({ action: "rental.originals_returned", entityId: "r1" });
    });

    it("NO changes nothing but records that the originals were kept", async () => {
        await applyOriginalsAnswer({ rentalId: "r1", userId: "u1", held, answer: false, actor });
        expect(state.updates).toHaveLength(0);
        expect(state.audits[0]).toMatchObject({ action: "rental.originals_not_returned" });
    });

    it("does nothing when nothing was held or no answer was given", async () => {
        await applyOriginalsAnswer({ rentalId: "r1", userId: "u1", held: [], answer: true, actor });
        await applyOriginalsAnswer({ rentalId: "r1", userId: "u1", held, answer: undefined, actor });
        expect(state.updates).toHaveLength(0);
        expect(state.audits).toHaveLength(0);
    });
});

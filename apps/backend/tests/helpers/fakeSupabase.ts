import { vi } from "vitest";

/**
 * A minimal stand-in for the PostgREST query builder.
 *
 * The payment service talks to Supabase through long fluent chains
 * (`.from(t).select(c).eq(a, b).maybeSingle()`), so a test that wants to
 * exercise the real control flow — signature rejection, idempotent
 * reprocessing, the amount checks — needs something chainable rather than a
 * per-call `vi.fn()`.
 *
 * The chain is RECORDED and handed to one handler the test supplies, which
 * decides what the query returns. That keeps the assertions about behaviour
 * ("did it insert a webhook event with is_signature_valid false?") rather
 * than about call ordering, and it means a refactor that adds a column does
 * not break every test.
 */

export interface QueryRecord {
    table: string;
    /** The mutating verb, or "select" for a read. */
    op: "select" | "insert" | "update" | "delete";
    /** Payload passed to insert()/update(). */
    payload?: Record<string, unknown>;
    /** Filters, in call order: ["eq", "status", "created"]. */
    filters: Array<[string, string, unknown]>;
    /** True when the chain ended in .single() or .maybeSingle(). */
    single: boolean;
}

export type QueryHandler = (q: QueryRecord) => { data?: unknown; error?: unknown };

export interface FakeSupabase {
    from: ReturnType<typeof vi.fn>;
    rpc: ReturnType<typeof vi.fn>;
    /** Everything the code under test ran, in order. */
    queries: QueryRecord[];
    /** Queries matching a table, for concise assertions. */
    on(table: string, op?: QueryRecord["op"]): QueryRecord[];
}

export function createFakeSupabase(
    handler: QueryHandler,
    rpcHandler: (fn: string, args: unknown) => { data?: unknown; error?: unknown } = () => ({ data: null }),
): FakeSupabase {
    const queries: QueryRecord[] = [];

    const from = vi.fn((table: string) => {
        const record: QueryRecord = { table, op: "select", filters: [], single: false };
        queries.push(record);

        const settle = () => {
            const result = handler(record);
            return { data: result.data ?? null, error: result.error ?? null };
        };

        const builder: Record<string, unknown> = {};

        // Terminal-but-still-chainable filters and modifiers.
        for (const method of ["eq", "neq", "in", "gt", "gte", "lt", "lte", "not", "or", "order", "limit", "range"]) {
            builder[method] = (a?: unknown, b?: unknown) => {
                record.filters.push([method, String(a), b]);
                return builder;
            };
        }

        builder.select = (_columns?: string) => builder;

        for (const [method, op] of [["insert", "insert"], ["update", "update"], ["upsert", "insert"]] as const) {
            builder[method] = (payload: Record<string, unknown>) => {
                record.op = op;
                record.payload = payload;
                return builder;
            };
        }
        builder.delete = () => {
            record.op = "delete";
            return builder;
        };

        builder.single = () => {
            record.single = true;
            return Promise.resolve(settle());
        };
        builder.maybeSingle = () => {
            record.single = true;
            return Promise.resolve(settle());
        };
        // A chain awaited without .single() — resolves to the array form.
        builder.then = (
            onFulfilled: (v: unknown) => unknown,
            onRejected?: (e: unknown) => unknown,
        ) => Promise.resolve(settle()).then(onFulfilled, onRejected);

        return builder;
    });

    return {
        from,
        rpc: vi.fn((fn: string, args: unknown) => {
            const r = rpcHandler(fn, args);
            return Promise.resolve({ data: r.data ?? null, error: r.error ?? null });
        }),
        queries,
        on(table, op) {
            return queries.filter((q) => q.table === table && (op ? q.op === op : true));
        },
    };
}

/** Convenience: the value a payload column was written with. */
export function written(q: QueryRecord | undefined, column: string): unknown {
    return q?.payload?.[column];
}

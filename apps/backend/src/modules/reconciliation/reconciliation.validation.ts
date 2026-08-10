import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use the format YYYY-MM-DD.");

export const reconciliationQuery = z.object({
    from: isoDate,
    to: isoDate,
});

export type ReconciliationQuery = z.infer<typeof reconciliationQuery>;

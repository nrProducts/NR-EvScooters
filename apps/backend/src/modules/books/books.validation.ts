import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date.");

export const rangeQuery = z
    .object({ from: isoDate, to: isoDate })
    .refine((q) => q.from <= q.to, { message: "`from` must be on or before `to`.", path: ["from"] });
export type RangeQuery = z.infer<typeof rangeQuery>;

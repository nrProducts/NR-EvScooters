import { z } from "zod";

export const replaceCancellationTiersBody = z.object({
    tiers: z.array(z.object({
        upto_minutes: z.number().int().min(1).max(1_000_000),
        penalty_percent: z.number().min(0).max(100),
    })).max(20),
});

export type ReplaceCancellationTiersBody = z.infer<typeof replaceCancellationTiersBody>;

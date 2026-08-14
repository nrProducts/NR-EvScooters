import { z } from "zod";

export const searchAreasQuery = z.object({
    q: z.string().trim().min(2, "Enter at least two characters.").max(120),
    // Optional: the rider may decline location and still search by name.
    lat: z.coerce.number().min(-90).max(90).optional(),
    lng: z.coerce.number().min(-180).max(180).optional(),
});

export type SearchAreasQuery = z.infer<typeof searchAreasQuery>;

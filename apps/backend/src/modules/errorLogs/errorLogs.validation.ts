import { z } from "zod";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../../common/pagination";

export const listErrorLogsQuery = z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
    client: z.enum(["mobile", "web", "website", "unknown"]).optional(),
    search: z.string().trim().min(1).max(200).optional(),
    minStatus: z.coerce.number().int().min(100).max(599).optional(),
});

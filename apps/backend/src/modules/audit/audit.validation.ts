import { z } from "zod";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../../common/pagination";

export const listAuditLogsQuery = z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
    action: z.string().trim().min(1).max(60).optional(),
    entityType: z.string().trim().min(1).max(60).optional(),
});

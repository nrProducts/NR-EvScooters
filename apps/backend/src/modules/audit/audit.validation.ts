import { z } from "zod";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../../common/pagination";
import { PII_ACCESS_REASONS } from "../../common/piiAccess";

export const listAuditLogsQuery = z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
    action: z.string().trim().min(1).max(60).optional(),
    entityType: z.string().trim().min(1).max(60).optional(),
});

export const listPiiAccessQuery = z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
    actorId: z.string().uuid().optional(),
    targetUserId: z.string().uuid().optional(),
    resource: z.string().trim().min(1).max(60).optional(),
    reason: z.enum(PII_ACCESS_REASONS as unknown as [string, ...string[]]).optional(),
    since: z.string().datetime().optional(),
});

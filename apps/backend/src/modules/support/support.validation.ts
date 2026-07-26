import { z } from "zod";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../../common/pagination";

const SUPPORT_STATUSES = ["open", "in_progress", "resolved", "closed"] as const;
const SUPPORT_PRIORITIES = ["low", "medium", "high", "urgent"] as const;

export const createSupportBody = z.object({
    subject: z.string().trim().min(3, "Give your request a short subject (at least 3 characters).").max(120),
    description: z.string().trim().min(10, "Tell us a bit more — at least 10 characters.").max(2000),
});

export const supportHistoryQuery = z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

export const supportQueueQuery = z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
    status: z.enum(SUPPORT_STATUSES).optional(),
});

export const supportIdParam = z.object({
    id: z.string().uuid("A valid support request id is required."),
});

export const updateSupportBody = z
    .object({
        status: z.enum(SUPPORT_STATUSES).optional(),
        priority: z.enum(SUPPORT_PRIORITIES).optional(),
        assigned_to: z.string().uuid().optional(),
    })
    .refine(
        (v) => Object.keys(v).length > 0,
        "Provide a status, priority or assignee to update.",
    );

export type CreateSupportBody = z.infer<typeof createSupportBody>;
export type SupportHistoryQuery = z.infer<typeof supportHistoryQuery>;
export type SupportQueueQuery = z.infer<typeof supportQueueQuery>;
export type UpdateSupportBody = z.infer<typeof updateSupportBody>;

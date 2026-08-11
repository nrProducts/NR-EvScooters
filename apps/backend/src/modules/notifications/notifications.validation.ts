import { z } from "zod";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../../common/pagination";
import { NOTIFICATION_STATUSES } from "../../types";

export const uuidParam = z.object({ id: z.string().uuid("A valid notification id is required.") });

export const listNotificationsQuery = z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

export const listAdminNotificationsQuery = z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
    status: z.enum(NOTIFICATION_STATUSES as [string, ...string[]]).optional(),
    userId: z.string().uuid().optional(),
    sortBy: z.enum(["created_at"]).default("created_at"),
    sortDir: z.enum(["asc", "desc"]).default("desc"),
});

export const broadcastBody = z.object({
    title: z.string().trim().min(1, "Enter a title.").max(120),
    body: z.string().trim().min(1, "Enter a message.").max(500),
    screen: z.string().trim().max(200).optional(),
    user_ids: z.array(z.string().uuid()).max(5000).optional(),
});

// =========================================================================
// _shared/audit — an audit row from a scheduled function
//
// Mirrors writeAudit() in apps/backend/src/common/audit.ts. Two column
// renames matter here: `actor_id` is now `actor_user_id`, and `entity_id` is
// NOT NULL — an audit record that cannot say what it is about is not one.
//
// `actor_user_id` is null on purpose in every caller: a cron job is not a
// person, and inventing a system user would put a name on decisions nobody
// made. `request_context.source` names the function instead.
// =========================================================================

import type { Admin } from "./client.ts";

export interface AuditInput {
    targetUserId?: string | null;
    action: string;
    entityType: string;
    entityId: string;
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
    /** The function name, e.g. "payment-overdue-sweep". */
    source: string;
}

/** Never throws — an audit failure must not roll back the business change. */
export async function writeAudit(admin: Admin, input: AuditInput): Promise<void> {
    const { error } = await admin.from("audit_logs").insert({
        actor_user_id: null,
        target_user_id: input.targetUserId ?? null,
        action: input.action,
        entity_type: input.entityType,
        entity_id: input.entityId,
        before_data: input.before ?? null,
        after_data: input.after ?? null,
        request_context: { source: input.source },
    });
    if (error) {
        console.error(`[${input.source}] audit write failed`, {
            action: input.action,
            entityId: input.entityId,
            error: error.message,
        });
    }
}

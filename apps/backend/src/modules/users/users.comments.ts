import { supabaseAdmin } from "../../config/supabase";
import { forbidden, notFound } from "../../common/AppError";
import { writeAudit } from "../../common/audit";
import type { AuthContext } from "../../types";

/**
 * Staff comments on a user (`user_comments`) — internal notes the team keeps
 * about a rider: a call made, a promise to pay, a complaint. Riders never see
 * them. The author or an admin may delete one; the audit log keeps the text.
 */
export interface UserComment {
    id: string;
    user_id: string;
    body: string;
    author: { id: string; full_name: string } | null;
    created_at: string;
}

/** What the user list shows per row. */
export interface UserCommentSummary {
    count: number;
    latest: { body: string; created_at: string; author_name: string | null } | null;
}

const COLUMNS = "id, user_id, body, created_at, author:users!user_comments_author_user_id_fkey(id, full_name)";

type Person = { id: string; full_name: string };
type RawComment = {
    id: string; user_id: string; body: string; created_at: string;
    author: Person | Person[] | null;
};

function toComment(row: RawComment): UserComment {
    const author = Array.isArray(row.author) ? row.author[0] ?? null : row.author;
    return {
        id: row.id,
        user_id: row.user_id,
        body: row.body,
        author: author ? { id: author.id, full_name: author.full_name } : null,
        created_at: row.created_at,
    };
}

/** Newest first. */
export async function listUserComments(userId: string): Promise<UserComment[]> {
    const { data, error } = await supabaseAdmin
        .from("user_comments")
        .select(COLUMNS)
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
    if (error) throw error;
    return ((data ?? []) as unknown as RawComment[]).map(toComment);
}

export async function addUserComment(userId: string, body: string, actor: AuthContext): Promise<UserComment> {
    const { data: user, error: userError } = await supabaseAdmin
        .from("users").select("id").eq("id", userId).maybeSingle();
    if (userError) throw userError;
    if (!user) throw notFound("User not found.");

    const text = body.trim();
    const { data, error } = await supabaseAdmin
        .from("user_comments")
        .insert({ user_id: userId, body: text, author_user_id: actor.id })
        .select(COLUMNS)
        .single();
    if (error) throw error;

    await writeAudit({
        actorId: actor.id,
        targetUserId: userId,
        action: "user.comment_added",
        entityType: "user_comment",
        entityId: data.id,
        before: null,
        after: { body: text },
    });
    return toComment(data as unknown as RawComment);
}

/** Only the comment's author or an admin. */
export async function deleteUserComment(commentId: string, actor: AuthContext): Promise<void> {
    const { data: existing, error: readError } = await supabaseAdmin
        .from("user_comments")
        .select("id, user_id, body, author_user_id")
        .eq("id", commentId)
        .maybeSingle();
    if (readError) throw readError;
    if (!existing) throw notFound("Comment not found.");
    if (existing.author_user_id !== actor.id && actor.role !== "admin") {
        throw forbidden("Only the person who wrote this comment, or an admin, can delete it.");
    }

    const { error } = await supabaseAdmin.from("user_comments").delete().eq("id", commentId);
    if (error) throw error;

    await writeAudit({
        actorId: actor.id,
        targetUserId: existing.user_id,
        action: "user.comment_deleted",
        entityType: "user_comment",
        entityId: commentId,
        before: { body: existing.body },
        after: null,
    });
}

/** Comment count and the newest comment for each of these users (one page of the list). */
export async function commentSummaryByUser(userIds: string[]): Promise<Map<string, UserCommentSummary>> {
    const map = new Map<string, UserCommentSummary>();
    if (userIds.length === 0) return map;

    const { data, error } = await supabaseAdmin
        .from("user_comments")
        .select("user_id, body, created_at, author:users!user_comments_author_user_id_fkey(full_name)")
        .in("user_id", userIds)
        .order("created_at", { ascending: false });
    if (error) throw error;

    type Row = { user_id: string; body: string; created_at: string; author: { full_name: string } | { full_name: string }[] | null };
    for (const row of (data ?? []) as unknown as Row[]) {
        const entry = map.get(row.user_id);
        if (entry) {
            entry.count++;
            continue;
        }
        const author = Array.isArray(row.author) ? row.author[0] ?? null : row.author;
        map.set(row.user_id, {
            count: 1,
            latest: { body: row.body, created_at: row.created_at, author_name: author?.full_name ?? null },
        });
    }
    return map;
}

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { useAddUserComment, useDeleteUserComment, useUserComments } from "@/hooks/useUsers";
import type { UserComment } from "@/services/api/users";
import { useAuthStore } from "@/store/authStore";
import { toastError, toastSuccess } from "@/lib/toastHelpers";
import { formatDateTime, timeAgo } from "@/lib/utils";

/**
 * Staff comments on one user: a box to add one, then the thread, newest
 * first. Internal — riders never see these. The author or an admin can
 * delete a comment. Used in the user list's Comments dialog and on the
 * user's details page.
 */
export function UserCommentsThread({ userId }: { userId: string }) {
  const me = useAuthStore((s) => s.user);
  const { data: comments, isLoading, isError, refetch } = useUserComments(userId);
  const addComment = useAddUserComment();
  const deleteComment = useDeleteUserComment();
  const [body, setBody] = useState("");
  const [deleting, setDeleting] = useState<UserComment | null>(null);

  const text = body.trim();
  const save = () => {
    if (!text) return;
    addComment.mutate({ userId, body: text }, {
      onSuccess: () => {
        toastSuccess("Comment added");
        setBody("");
      },
      onError: (err) => toastError(err, "Could not add the comment"),
    });
  };

  const canDelete = (c: UserComment) => me?.role === "admin" || (!!me && c.author?.id === me.id);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor={`comment-${userId}`}>Add a comment</Label>
        <Textarea
          id={`comment-${userId}`}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) save();
          }}
          placeholder="e.g. Called on 7 Nov, promised to pay the pending amount by Monday"
          maxLength={1000}
          rows={3}
        />
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">Only staff can see comments. Ctrl+Enter to save.</p>
          <Button size="sm" onClick={save} disabled={!text || addComment.isPending}>
            {addComment.isPending ? "Saving…" : "Add comment"}
          </Button>
        </div>
      </div>

      <div className="space-y-3 text-sm">
        {isLoading ? (
          <Skeleton className="h-14 w-full" />
        ) : isError ? (
          <p className="text-xs text-muted-foreground">
            Could not load comments.{" "}
            <button type="button" className="text-primary underline-offset-2 hover:underline" onClick={() => refetch()}>
              Retry
            </button>
          </p>
        ) : !comments || comments.length === 0 ? (
          <p className="text-xs text-muted-foreground">No comments yet.</p>
        ) : (
          comments.map((c) => (
            <div key={c.id} className="flex items-start justify-between gap-2 border-t pt-3">
              <div className="min-w-0">
                <p className="whitespace-pre-wrap break-words">{c.body}</p>
                <p className="mt-0.5 text-xs text-muted-foreground" title={formatDateTime(c.created_at)}>
                  {c.author?.full_name ?? "Former staff member"} · {timeAgo(c.created_at)}
                </p>
              </div>
              {canDelete(c) && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => setDeleting(c)}
                  title="Delete comment"
                  aria-label="Delete comment"
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              )}
            </div>
          ))
        )}
      </div>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete this comment?"
        description="It will be removed from this user's comments."
        confirmLabel="Delete"
        destructive
        loading={deleteComment.isPending}
        onConfirm={() =>
          deleting &&
          deleteComment.mutate(deleting.id, {
            onSuccess: () => {
              toastSuccess("Comment deleted");
              setDeleting(null);
            },
            onError: (err) => toastError(err, "Could not delete the comment"),
          })
        }
      />
    </div>
  );
}

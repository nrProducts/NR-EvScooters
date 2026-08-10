import { ShieldAlert } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export interface ApprovalRequest {
  title: string;
  message: string;
  /** Route to send the admin to when they act on this. */
  reviewPath: string;
  reviewLabel?: string;
}

/**
 * Center-screen, blocking popup for events that need a staff decision (e.g.
 * a rider submitting KYC documents) — unlike the corner toast stack, this
 * stays open until the admin dismisses it or navigates to review it.
 */
export function ApprovalPopup({
  request,
  onReview,
  onDismiss,
}: {
  request: ApprovalRequest | null;
  onReview: (request: ApprovalRequest) => void;
  onDismiss: () => void;
}) {
  return (
    <Dialog open={!!request} onOpenChange={(o) => !o && onDismiss()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-warning" />
            <DialogTitle>{request?.title}</DialogTitle>
          </div>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{request?.message}</p>
        <DialogFooter>
          <Button variant="outline" onClick={onDismiss}>
            Dismiss
          </Button>
          <Button onClick={() => request && onReview(request)}>
            {request?.reviewLabel ?? "Review Now"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

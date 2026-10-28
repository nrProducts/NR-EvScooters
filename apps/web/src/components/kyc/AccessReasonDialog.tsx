import { useState } from "react";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { PII_ACCESS_REASON_LABELS, type PiiAccessReason } from "@/types";

/** Staff can never claim "rider_self" — the server sets that one. */
export type StaffAccessReason = Exclude<PiiAccessReason, "rider_self">;

/**
 * Captures WHY a staff member is about to open a rider's identity documents.
 *
 * A free-text reference is optional but strongly encouraged: "support ticket"
 * with no ticket number is only marginally better than nothing when someone
 * is later asked to justify the access.
 */
export function AccessReasonDialog({
  open,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: (reason: StaffAccessReason, contextRef: string) => void;
}) {
  const [reason, setReason] = useState<StaffAccessReason>("kyc_review");
  const [contextRef, setContextRef] = useState("");

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4" /> Why are you opening this?
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            You are about to view a rider's identity documents. This is recorded against your
            name, and the rider can see it in their own privacy screen.
          </p>
          <div className="space-y-1.5">
            <Label>Reason</Label>
            <Select value={reason} onValueChange={(v) => setReason(v as StaffAccessReason)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(PII_ACCESS_REASON_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Ticket or case reference (optional)</Label>
            <Input
              value={contextRef}
              onChange={(e) => setContextRef(e.target.value)}
              placeholder="Ticket or case reference"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button onClick={() => onConfirm(reason, contextRef.trim())}>
            Continue and record
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

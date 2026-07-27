import { useState } from "react";
import { CheckCircle2, XCircle, FileImage } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/common/StatusBadge";
import { EmptyState } from "@/components/common/EmptyState";
import { LoadingSkeletonRows } from "@/components/common/LoadingSkeletonRows";
import { useKycQueue, useApproveKyc, useRejectKyc } from "@/hooks/useKyc";
import { formatDate } from "@/lib/utils";
import type { KycDocument, KycStatus } from "@/types";

const TABS: { value: KycStatus | "all"; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

export default function KycQueuePage() {
  const [tab, setTab] = useState<KycStatus | "all">("pending");
  const { data: docs, isLoading } = useKycQueue(tab);
  const approveKyc = useApproveKyc();
  const [rejectTarget, setRejectTarget] = useState<KycDocument | null>(null);
  const [reason, setReason] = useState("");
  const rejectKyc = useRejectKyc();

  return (
    <div className="space-y-4 animate-fade-in">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">KYC Management</h1>
        <p className="text-sm text-muted-foreground">Review rider identity documents before approving fleet access</p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as KycStatus)}>
        <TabsList>
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={tab}>
          {isLoading ? (
            <Card>
              <LoadingSkeletonRows rows={4} cols={3} />
            </Card>
          ) : !docs || docs.length === 0 ? (
            <Card>
              <EmptyState title="No documents here" description="Nothing to review in this queue right now." />
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {docs.map((doc) => (
                <Card key={doc.id}>
                  <CardContent className="space-y-3 p-4">
                    <div className="flex items-center justify-between">
                      <p className="font-medium">{doc.riderName}</p>
                      <StatusBadge status={doc.status} />
                    </div>
                    <p className="text-xs text-muted-foreground">Submitted {formatDate(doc.submittedOn)}</p>

                    <div className="grid grid-cols-3 gap-2">
                      {["Front", "Back", "Selfie"].map((label) => (
                        <div
                          key={label}
                          className="flex flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border py-4 text-muted-foreground"
                        >
                          <FileImage className="h-5 w-5" />
                          <span className="text-[10px]">{label}</span>
                        </div>
                      ))}
                    </div>

                    {doc.rejectionReason && (
                      <p className="rounded-md bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
                        {doc.rejectionReason}
                      </p>
                    )}

                    {doc.status === "pending" && (
                      <div className="flex gap-2 pt-1">
                        <Button
                          size="sm"
                          className="flex-1"
                          onClick={() => approveKyc.mutate(doc.id)}
                          disabled={approveKyc.isPending}
                        >
                          <CheckCircle2 className="h-4 w-4" /> Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 text-destructive hover:text-destructive"
                          onClick={() => {
                            setRejectTarget(doc);
                            setReason("");
                          }}
                        >
                          <XCircle className="h-4 w-4" /> Reject
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={!!rejectTarget} onOpenChange={(o) => !o && setRejectTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject KYC for {rejectTarget?.riderName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Reason</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Document image is blurred or expired"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!reason || rejectKyc.isPending}
              onClick={() => {
                if (rejectTarget) {
                  rejectKyc.mutate(
                    { id: rejectTarget.id, reason },
                    { onSuccess: () => setRejectTarget(null) },
                  );
                }
              }}
            >
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useState } from "react";
import { CheckCircle2, XCircle, FileText, ExternalLink, AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/common/StatusBadge";
import { EmptyState } from "@/components/common/EmptyState";
import { LoadingSkeletonRows } from "@/components/common/LoadingSkeletonRows";
import { SearchBar } from "@/components/common/SearchBar";
import { Pagination } from "@/components/common/Pagination";
import {
  useKycQueue, useApproveKyc, useRejectKyc, useKycDetail, useVerifyDocument, useRejectDocument, useOpenDocument,
} from "@/hooks/useKyc";
import { formatDate } from "@/lib/utils";
import type { KycQueueItem, KycStatus } from "@/types";

const TABS: { value: KycStatus | "all"; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "partially_verified", label: "Partial" },
  { value: "verified", label: "Verified" },
  { value: "rejected", label: "Rejected" },
];

export default function KycQueuePage() {
  const [tab, setTab] = useState<KycStatus | "all">("pending");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const { data, isLoading } = useKycQueue({ status: tab, search, page, pageSize: 9 });
  const approveKyc = useApproveKyc();
  const [rejectTarget, setRejectTarget] = useState<KycQueueItem | null>(null);
  const [reason, setReason] = useState("");
  const rejectKyc = useRejectKyc();
  const [detailTarget, setDetailTarget] = useState<KycQueueItem | null>(null);

  return (
    <div className="space-y-4 animate-fade-in">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">KYC Management</h1>
        <p className="text-sm text-muted-foreground">Review rider identity documents before approving fleet access</p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={tab} onValueChange={(v) => { setTab(v as KycStatus); setPage(1); }}>
          <TabsList className="flex-wrap">
            {TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <SearchBar
          value={search}
          onChange={(v) => { setSearch(v); setPage(1); }}
          placeholder="Search by name, email or phone..."
          className="sm:max-w-xs"
        />
      </div>

      {isLoading ? (
        <Card><LoadingSkeletonRows rows={4} cols={3} /></Card>
      ) : !data || data.data.length === 0 ? (
        <Card><EmptyState title="No riders here" description="Nothing to review in this queue right now." /></Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.data.map((item) => (
              <Card key={item.user_id}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-center justify-between">
                    <p className="font-medium">{item.full_name || "Unnamed"}</p>
                    <StatusBadge status={item.kyc_status} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {item.phone ?? item.email ?? "No contact on file"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {item.document_count} document{item.document_count === 1 ? "" : "s"} · {item.completion_percent}% complete
                    {item.earliest_submitted_at ? ` · submitted ${formatDate(item.earliest_submitted_at)}` : ""}
                  </p>

                  {item.has_expired_document && (
                    <p className="flex items-center gap-1 rounded-md bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
                      <AlertTriangle className="h-3.5 w-3.5" /> Has an expired document
                    </p>
                  )}

                  <Button size="sm" variant="outline" className="w-full" onClick={() => setDetailTarget(item)}>
                    <FileText className="h-3.5 w-3.5" /> View documents
                  </Button>

                  {(item.kyc_status === "pending" || item.kyc_status === "partially_verified") && (
                    <div className="flex gap-2 pt-1">
                      <Button
                        size="sm"
                        className="flex-1"
                        onClick={() => approveKyc.mutate(item.user_id)}
                        disabled={approveKyc.isPending}
                      >
                        <CheckCircle2 className="h-4 w-4" /> Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 text-destructive hover:text-destructive"
                        onClick={() => { setRejectTarget(item); setReason(""); }}
                      >
                        <XCircle className="h-4 w-4" /> Reject
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
          <Pagination page={page} pageSize={9} total={data.total} onPageChange={setPage} />
        </>
      )}

      <Dialog open={!!rejectTarget} onOpenChange={(o) => !o && setRejectTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject KYC for {rejectTarget?.full_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Reason (at least 10 characters)</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Document image is blurred or expired"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectTarget(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={reason.trim().length < 10 || rejectKyc.isPending}
              onClick={() => {
                if (rejectTarget) {
                  rejectKyc.mutate(
                    { userId: rejectTarget.user_id, reason },
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

      <KycDetailDialog target={detailTarget} onClose={() => setDetailTarget(null)} />
    </div>
  );
}

/** Signed URLs keep the original file extension before the query string, so it's a reliable type hint. */
function isPdfUrl(url: string): boolean {
  return url.split("?")[0].toLowerCase().endsWith(".pdf");
}

function KycDetailDialog({ target, onClose }: { target: KycQueueItem | null; onClose: () => void }) {
  const { data: detail, isLoading } = useKycDetail(target?.user_id);
  const verifyDocument = useVerifyDocument();
  const rejectDocument = useRejectDocument();
  const openDocument = useOpenDocument();
  const [rejectDocId, setRejectDocId] = useState<string | null>(null);
  const [docReason, setDocReason] = useState("");
  const [preview, setPreview] = useState<{ url: string; title: string } | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);

  const viewDocument = (documentId: string, side: "front" | "back", label: string) => {
    setOpenError(null);
    openDocument.mutate(
      { documentId, side },
      {
        onSuccess: (data) => setPreview({ url: data.url, title: `${label} — ${side}` }),
        onError: (err) => setOpenError((err as Error)?.message ?? "Couldn't open that document."),
      },
    );
  };

  return (
    <>
      <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{target?.full_name ?? "Rider"}'s documents</DialogTitle>
          </DialogHeader>
          {isLoading ? (
            <LoadingSkeletonRows rows={3} cols={1} />
          ) : !detail || detail.documents.length === 0 ? (
            <EmptyState title="No documents uploaded" />
          ) : (
            <div className="space-y-3">
              {openError && (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{openError}</p>
              )}
              {detail.documents.map((doc) => (
                <div key={doc.id} className="space-y-2 rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium capitalize">{doc.doc_type.replace(/_/g, " ")}</p>
                    <StatusBadge status={doc.verification_status} />
                  </div>
                  {doc.expiry_date && (
                    <p className="text-xs text-muted-foreground">Expires {formatDate(doc.expiry_date)}</p>
                  )}
                  {doc.rejection_reason && (
                    <p className="rounded-md bg-destructive/10 px-2 py-1 text-xs text-destructive">{doc.rejection_reason}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={openDocument.isPending}
                      onClick={() => viewDocument(doc.id, "front", doc.doc_type.replace(/_/g, " "))}
                    >
                      <ExternalLink className="h-3.5 w-3.5" /> Front
                    </Button>
                    {doc.has_back_side ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={openDocument.isPending}
                        onClick={() => viewDocument(doc.id, "back", doc.doc_type.replace(/_/g, " "))}
                      >
                        <ExternalLink className="h-3.5 w-3.5" /> Back
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">No back side uploaded</span>
                    )}
                    {doc.verification_status === "pending" && (
                      <>
                        <Button size="sm" onClick={() => verifyDocument.mutate(doc.id)} disabled={verifyDocument.isPending}>
                          Verify
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-destructive hover:text-destructive"
                          onClick={() => { setRejectDocId(doc.id); setDocReason(""); }}
                        >
                          Reject
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!rejectDocId} onOpenChange={(o) => !o && setRejectDocId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject document</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Reason</Label>
            <Textarea value={docReason} onChange={(e) => setDocReason(e.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDocId(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={docReason.trim().length < 10 || rejectDocument.isPending}
              onClick={() => {
                if (rejectDocId) {
                  rejectDocument.mutate(
                    { documentId: rejectDocId, reason: docReason },
                    { onSuccess: () => setRejectDocId(null) },
                  );
                }
              }}
            >
              Reject document
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="capitalize">{preview?.title}</DialogTitle>
          </DialogHeader>
          {preview && (
            <div className="space-y-2">
              {isPdfUrl(preview.url) ? (
                <iframe
                  src={preview.url}
                  title={preview.title}
                  className="h-[75vh] w-full rounded-md border border-border bg-muted"
                />
              ) : (
                <div className="flex h-[75vh] items-center justify-center overflow-auto rounded-md border border-border bg-muted">
                  <img
                    src={preview.url}
                    alt={preview.title}
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
              )}
              <div className="flex justify-end">
                <a
                  href={preview.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                >
                  Open in new tab
                </a>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

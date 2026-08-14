import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, FileText, ExternalLink, AlertTriangle, RotateCcw, RotateCw, UserRound, ShieldAlert, Lock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
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
import { useOpenUserPhoto } from "@/hooks/useUsers";
import { ApiError } from "@/services/api/httpClient";
import { formatDate } from "@/lib/utils";
import { PII_ACCESS_REASON_LABELS, type KycQueueItem, type KycStatus, type PiiAccessReason } from "@/types";

/** Staff can never claim "rider_self" — the server sets that one. */
type StaffAccessReason = Exclude<PiiAccessReason, "rider_self">;
import { useAuthStore } from "@/store/authStore";

const TABS: { value: KycStatus | "all"; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "partially_verified", label: "Partial" },
  { value: "verified", label: "Verified" },
  { value: "rejected", label: "Rejected" },
];

const SORT_OPTIONS: { value: `${"submitted_at" | "full_name" | "kyc_status"}:${"asc" | "desc"}`; label: string }[] = [
  { value: "submitted_at:desc", label: "Newest submitted" },
  { value: "submitted_at:asc", label: "Oldest submitted" },
  { value: "full_name:asc", label: "Name (A–Z)" },
  { value: "full_name:desc", label: "Name (Z–A)" },
];

export default function KycQueuePage() {
  const [tab, setTab] = useState<KycStatus | "all">("pending");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<(typeof SORT_OPTIONS)[number]["value"]>("submitted_at:desc");
  const [sortBy, sortDir] = sort.split(":") as ["submitted_at" | "full_name" | "kyc_status", "asc" | "desc"];
  const { data, isLoading } = useKycQueue({ status: tab, search, page, pageSize: 9, sortBy, sortDir });
  const approveKyc = useApproveKyc();
  const [approveError, setApproveError] = useState<{ userId: string; message: string } | null>(null);
  const [rejectTarget, setRejectTarget] = useState<KycQueueItem | null>(null);
  const [reason, setReason] = useState("");
  const rejectKyc = useRejectKyc();
  const [detailTarget, setDetailTarget] = useState<KycQueueItem | null>(null);

  const handleApprove = (item: KycQueueItem) => {
    setApproveError(null);
    approveKyc.mutate(item.user_id, {
      onError: (err) =>
        setApproveError({
          userId: item.user_id,
          message: err instanceof ApiError ? err.message : "Could not approve this rider.",
        }),
    });
  };

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
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <SearchBar
            value={search}
            onChange={(v) => { setSearch(v); setPage(1); }}
            placeholder="Search by name, email or phone..."
            className="sm:max-w-xs"
          />
          <Select value={sort} onValueChange={(v) => { setSort(v as typeof sort); setPage(1); }}>
            <SelectTrigger className="sm:w-44">
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
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

                  {approveError?.userId === item.user_id && (
                    <p className="rounded-md bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
                      {approveError.message}
                    </p>
                  )}

                  {(item.kyc_status === "pending" || item.kyc_status === "partially_verified") && (
                    <div className="flex gap-2 pt-1">
                      <Button
                        size="sm"
                        className="flex-1"
                        onClick={() => handleApprove(item)}
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
          {rejectKyc.isError && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {rejectKyc.error instanceof ApiError ? rejectKyc.error.message : "Could not reject this rider."}
            </p>
          )}
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
  const openUserPhoto = useOpenUserPhoto();
  const [rejectDocId, setRejectDocId] = useState<string | null>(null);
  const [docReason, setDocReason] = useState("");
  const [preview, setPreview] = useState<{ url: string; title: string } | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const [rotation, setRotation] = useState(0);

  // Whether this staff member may see identity documents at all. The backend
  // enforces the same thing on every one of these routes — hiding the controls
  // is so people are not offered actions that will 403, not the control itself.
  const canReview = useAuthStore((st) => st.user?.capabilities.includes("kyc_reviewer") ?? false);

  // Asked once per opened rider, not once per document: a reviewer working
  // through one rider's file is doing one task, and re-prompting per click
  // trains people to click through the prompt without reading it.
  const [access, setAccess] = useState<{ reason: StaffAccessReason; contextRef: string } | null>(null);
  const [pendingOpen, setPendingOpen] = useState<null | (() => void)>(null);

  // Reset the captured purpose whenever a different rider is opened.
  useEffect(() => {
    setAccess(null);
    setOpenError(null);
  }, [target?.user_id]);

  /** Runs `open` once a purpose has been captured for this rider. */
  const withPurpose = (open: () => void) => {
    if (access) return open();
    setPendingOpen(() => open);
  };

  const viewDocument = (documentId: string, side: "front" | "back", label: string) => {
    withPurpose(() => {
      setOpenError(null);
      openDocument.mutate(
        { documentId, side, reason: access?.reason, contextRef: access?.contextRef || undefined },
        {
          onSuccess: (data) => {
            setRotation(0);
            setPreview({ url: data.url, title: `${label} — ${side}` });
          },
          onError: (err) => setOpenError((err as Error)?.message ?? "Couldn't open that document."),
        },
      );
    });
  };

  const viewRiderPhoto = () => {
    if (!target) return;
    withPurpose(() => {
      setOpenError(null);
      openUserPhoto.mutate(target.user_id, {
        onSuccess: (data) => {
          setRotation(0);
          setPreview({ url: data.url, title: "Rider photo" });
        },
        onError: (err) => setOpenError((err as Error)?.message ?? "No profile photo has been uploaded yet."),
      });
    });
  };

  return (
    <>
      <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{target?.full_name ?? "Rider"}'s documents</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {!canReview && (
              <div className="flex gap-2 rounded-lg border border-border bg-muted/50 p-3 text-xs">
                <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <p className="text-muted-foreground">
                  Viewing identity documents requires the <strong>KYC reviewer</strong> capability.
                  You can see this rider's progress, but not their Aadhaar, driving licence or photo.
                  An administrator can grant it in Settings &rarr; Capabilities.
                </p>
              </div>
            )}
            {canReview && (
              <Button
                size="sm"
                variant="outline"
                disabled={openUserPhoto.isPending}
                onClick={viewRiderPhoto}
              >
                <UserRound className="h-3.5 w-3.5" /> Rider photo
              </Button>
            )}
            {access && (
              <p className="text-xs text-muted-foreground">
                Access recorded as: {PII_ACCESS_REASON_LABELS[access.reason]}
                {access.contextRef ? ` (${access.contextRef})` : ""}
              </p>
            )}
            {openError && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{openError}</p>
            )}
            {isLoading ? (
              <LoadingSkeletonRows rows={3} cols={1} />
            ) : !detail || detail.documents.length === 0 ? (
              <EmptyState title="No documents uploaded" />
            ) : (
              detail.documents.map((doc) => (
                <div key={doc.id} className="space-y-2 rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium capitalize">{doc.doc_type.replace(/_/g, " ")}</p>
                    <StatusBadge status={doc.verification_status} />
                  </div>
                  {doc.doc_number_masked && (
                    <p className="font-mono text-xs text-muted-foreground">
                      {doc.doc_number_masked}
                      {/* Only the last four digits are stored. Cross-check
                          these against the document image; there is no full
                          number to compare against. */}
                    </p>
                  )}
                  {doc.expiry_date && (
                    <p className="text-xs text-muted-foreground">Expires {formatDate(doc.expiry_date)}</p>
                  )}
                  {doc.rejection_reason && (
                    <p className="rounded-md bg-destructive/10 px-2 py-1 text-xs text-destructive">{doc.rejection_reason}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {canReview && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={openDocument.isPending}
                        onClick={() => viewDocument(doc.id, "front", doc.doc_type.replace(/_/g, " "))}
                      >
                        <ExternalLink className="h-3.5 w-3.5" /> Front
                      </Button>
                    )}
                    {canReview && (doc.has_back_side ? (
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
                    ))}
                    {/* Verify and Reject are gated on the same capability: you
                        cannot responsibly decide on a document you are not
                        allowed to look at. */}
                    {canReview && doc.verification_status === "pending" && (
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
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Purpose capture. Asked before the first document of a rider's file is
          opened, and recorded against every access in that session. Without it
          the access log can say a scan was opened but not why, which is the
          difference between evidence and a list. */}
      <AccessReasonDialog
        open={!!pendingOpen}
        onCancel={() => setPendingOpen(null)}
        onConfirm={(reason, contextRef) => {
          setAccess({ reason, contextRef });
          const run = pendingOpen;
          setPendingOpen(null);
          // Deferred so the mutation reads the state we just set.
          if (run) setTimeout(run, 0);
        }}
      />

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

      <Dialog
        open={!!preview}
        onOpenChange={(o) => { if (!o) { setPreview(null); setRotation(0); } }}
      >
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
                <>
                  <div className="flex justify-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => setRotation((r) => r - 90)}>
                      <RotateCcw className="h-3.5 w-3.5" /> Rotate left
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setRotation((r) => r + 90)}>
                      <RotateCw className="h-3.5 w-3.5" /> Rotate right
                    </Button>
                  </div>
                  <div className="flex h-[75vh] items-center justify-center overflow-auto rounded-md border border-border bg-muted">
                    <img
                      src={preview.url}
                      alt={preview.title}
                      className="max-h-full max-w-full object-contain transition-transform duration-200"
                      style={{
                        transform: `rotate(${rotation}deg)`,
                        ...(rotation % 180 !== 0 ? { maxHeight: "75%", maxWidth: "75%" } : {}),
                      }}
                    />
                  </div>
                </>
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

/**
 * Captures WHY a staff member is about to open a rider's identity documents.
 *
 * A free-text reference is optional but strongly encouraged: "support ticket"
 * with no ticket number is only marginally better than nothing when someone
 * is later asked to justify the access.
 */
function AccessReasonDialog({
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
              placeholder="e.g. SUP-1042 or DPR-2026-000031"
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

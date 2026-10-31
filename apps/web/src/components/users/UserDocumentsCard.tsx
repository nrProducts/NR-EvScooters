import { useEffect, useState } from "react";
import { FileText, Lock, UserRound, Eye, IdCard } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/common/StatusBadge";
import { AccessReasonDialog, type StaffAccessReason } from "@/components/kyc/AccessReasonDialog";
import { DocumentPreviewDialog, type DocumentPreview } from "@/components/kyc/DocumentPreviewDialog";
import { useOpenDocument } from "@/hooks/useKyc";
import { useOpenUserPhoto } from "@/hooks/useUsers";
import { useAuthStore } from "@/store/authStore";
import { hasAction } from "@/lib/permissions";
import { formatDate } from "@/lib/utils";
import { PII_ACCESS_REASON_LABELS, type AppUserDocument } from "@/types";

/**
 * The rider's photo and identity documents (Aadhaar, licence, …) on their detail page.
 *
 * Each image is opened on request, not pre-loaded: the backend hands out a 5-minute signed link and
 * records every opening against the staff member, so the first one asks WHY (once per visit) and
 * the rest reuse that answer. Staff without the KYC document permission see the list but no images.
 */
export function UserDocumentsCard({
  userId,
  fullName,
  hasPhoto,
  documents,
}: {
  userId: string;
  fullName: string;
  hasPhoto: boolean;
  documents: AppUserDocument[];
}) {
  const canView = useAuthStore((s) => hasAction(s.user, "kyc", "reveal_number"));
  const openDocument = useOpenDocument();
  const openPhoto = useOpenUserPhoto();
  const [preview, setPreview] = useState<DocumentPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [access, setAccess] = useState<{ reason: StaffAccessReason; contextRef: string } | null>(null);
  const [pendingOpen, setPendingOpen] = useState<null | (() => void)>(null);

  // A different rider means a different purpose.
  useEffect(() => {
    setAccess(null);
    setError(null);
  }, [userId]);

  const withPurpose = (open: () => void) => {
    if (access) return open();
    setPendingOpen(() => open);
  };

  const viewDocument = (doc: AppUserDocument, side: "front" | "back") => {
    const label = doc.doc_type.replace(/_/g, " ");
    withPurpose(() => {
      setError(null);
      openDocument.mutate(
        { documentId: doc.id, side, reason: access?.reason, contextRef: access?.contextRef || undefined },
        {
          onSuccess: (data) => setPreview({ url: data.url, title: `${label} — ${side}` }),
          onError: (err) =>
            setError(side === "back"
              ? `No back side on file for ${label}.`
              : (err as Error)?.message ?? "Couldn't open that document."),
        },
      );
    });
  };

  const viewPhoto = () =>
    withPurpose(() => {
      setError(null);
      openPhoto.mutate(userId, {
        onSuccess: (data) => setPreview({ url: data.url, title: `${fullName || "Rider"} — photo` }),
        onError: (err) => setError((err as Error)?.message ?? "No profile photo has been uploaded yet."),
      });
    });

  const busy = openDocument.isPending || openPhoto.isPending;

  return (
    <Card>
      <CardHeader className="p-4 pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <FileText className="h-4 w-4" /> Photo &amp; KYC documents
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 p-4 pt-1">
        {!canView && (
          <div className="flex gap-2 rounded-xl bg-muted/60 p-3 text-xs text-muted-foreground">
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <p>You can see each document&apos;s status, but opening the photo or ID images needs the KYC document permission.</p>
          </div>
        )}

        {access && (
          <p className="text-xs text-muted-foreground">
            Access recorded as: {PII_ACCESS_REASON_LABELS[access.reason]}
            {access.contextRef ? ` (${access.contextRef})` : ""}
          </p>
        )}
        {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}

        <div className="divide-y divide-border">
          <div className="flex items-center justify-between gap-3 py-2">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <UserRound className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium">Rider photo</p>
                <p className="text-xs text-muted-foreground">{hasPhoto ? "Uploaded" : "Not uploaded yet"}</p>
              </div>
            </div>
            {canView && hasPhoto && (
              <Button size="sm" variant="outline" disabled={busy} onClick={viewPhoto}>
                <Eye className="h-3.5 w-3.5" /> View
              </Button>
            )}
          </div>

          {documents.length === 0 ? (
            <p className="py-3 text-xs text-muted-foreground">
              No documents uploaded. This user hasn&apos;t submitted any KYC documents yet.
            </p>
          ) : (
            documents.map((doc) => (
              <div key={doc.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 py-2">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <IdCard className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium capitalize">{doc.doc_type.replace(/_/g, " ")}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {doc.doc_number_masked ?? "—"}
                      {doc.expires_on ? ` · expires ${formatDate(doc.expires_on)}` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={doc.verification_status} />
                  {canView && (
                    <>
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => viewDocument(doc, "front")}>
                        <Eye className="h-3.5 w-3.5" /> Front
                      </Button>
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => viewDocument(doc, "back")}>
                        <Eye className="h-3.5 w-3.5" /> Back
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>

      <AccessReasonDialog
        open={!!pendingOpen}
        onCancel={() => setPendingOpen(null)}
        onConfirm={(reason, contextRef) => {
          setAccess({ reason, contextRef });
          const run = pendingOpen;
          setPendingOpen(null);
          // Deferred so the mutation reads the state just set.
          if (run) setTimeout(run, 0);
        }}
      />
      <DocumentPreviewDialog preview={preview} onClose={() => setPreview(null)} />
    </Card>
  );
}

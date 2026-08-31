import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Upload, X, FileText, ShieldCheck, ChevronLeft, ChevronRight, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toastError, toastSuccess } from "@/lib/toastHelpers";
import { CenteredSpinner, DetailRow, StatusPill } from "@/rider/components/common";
import { useRiderAuthStore } from "@/store/riderAuthStore";
import { useMyKyc, riderKeys } from "@/rider/hooks/queries";
import { riderApi } from "@/rider/services/riderApi";
import { computeInitialKycStep } from "@/rider/lib/kycProgress";
import {
  DOC_TYPE_LABEL, KYC_STATUS_LABEL, KYC_STATUS_TONE, VERIFICATION_TONE, formatDate,
} from "@/rider/constants/status";
import type { ApiDocument, ApiKycSummary, KycDocType } from "@/rider/types/api";

const STEP_TITLES = ["Photo", "Contact", "Aadhaar", "Licence", "Review"];
const ALLOWED = ["image/jpeg", "image/png", "application/pdf"];
const MAX_BYTES = 10 * 1024 * 1024;

function validateFile(file: File): string | null {
  if (!ALLOWED.includes(file.type)) return "Use a JPG, PNG or PDF file.";
  if (file.size > MAX_BYTES) return "File must be under 10 MB.";
  return null;
}

export default function RiderKycWizard() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const profile = useRiderAuthStore((s) => s.profile);
  const refreshProfile = useRiderAuthStore((s) => s.refreshProfile);
  const { data: kyc, isLoading, isError, refetch } = useMyKyc();

  const [step, setStep] = useState(0);
  const [maxStep, setMaxStep] = useState(0);
  const seeded = useRef(false);

  useEffect(() => {
    if (seeded.current || isLoading || !kyc) return;
    seeded.current = true;
    const s = computeInitialKycStep(profile, kyc);
    setStep(s);
    setMaxStep(s);
  }, [isLoading, kyc, profile]);

  const goto = (s: number) => {
    setStep(s);
    setMaxStep((m) => Math.max(m, s));
  };
  const refresh = () => qc.invalidateQueries({ queryKey: riderKeys.kyc });

  if (isLoading) return <CenteredSpinner label="Loading your verification…" />;
  if (isError || !kyc) return <p className="py-16 text-center text-sm text-destructive">Could not load your KYC.</p>;

  if (kyc.kyc_status === "verified") {
    return (
      <div>
        <StatusHeader kyc={kyc} />
        <div className="rounded-lg border border-success/40 bg-success/10 p-6 text-center">
          <ShieldCheck className="mx-auto h-8 w-8 text-success" />
          <p className="mt-3 text-sm font-bold">You're verified</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Your documents are approved and your scooter can be unlocked.
          </p>
        </div>
      </div>
    );
  }

  const docOf = (t: KycDocType) => kyc.documents.find((d) => d.document_type === t);

  return (
    <div>
      <StatusHeader kyc={kyc} />

      <div className="mb-4 flex gap-1.5">
        {STEP_TITLES.map((t, i) => (
          <button
            key={t}
            disabled={i > maxStep}
            onClick={() => i <= maxStep && setStep(i)}
            className="flex-1"
          >
            <div className={`h-1.5 rounded-full ${i <= step ? "bg-primary" : "bg-border"}`} />
            <span className={`mt-1 block text-[9px] font-bold ${i === step ? "text-primary" : "text-muted-foreground"}`}>
              {t}
            </span>
          </button>
        ))}
      </div>

      <button
        onClick={() => navigate("/rider")}
        className="mb-3 block w-full text-right text-[11px] font-bold text-muted-foreground underline"
      >
        Skip for now
      </button>

      {step === 0 && (
        <PhotoStep
          currentUrl={profile?.profile_photo_url ?? null}
          onDone={async () => {
            await refreshProfile();
            goto(1);
          }}
        />
      )}
      {step === 1 && (
        <ContactStep
          initialName={profile?.emergency_contact_name ?? ""}
          initialPhone={profile?.emergency_contact_phone ?? ""}
          onBack={() => goto(0)}
          onNext={async () => {
            await refreshProfile();
            goto(2);
          }}
        />
      )}
      {step === 2 && (
        <DocStep
          type="aadhaar"
          doc={docOf("aadhaar")}
          requiresExpiry={false}
          onBack={() => goto(1)}
          onDone={() => {
            refresh();
            goto(3);
          }}
        />
      )}
      {step === 3 && (
        <DocStep
          type="driving_licence"
          doc={docOf("driving_licence")}
          requiresExpiry
          onBack={() => goto(2)}
          onDone={() => {
            refresh();
            goto(4);
          }}
        />
      )}
      {step === 4 && (
        <ReviewStep
          kyc={kyc}
          onBack={() => goto(3)}
          onSubmitted={async () => {
            await refreshProfile();
            toastSuccess("Submitted", "Your documents are with our team.");
            navigate("/rider", { replace: true });
          }}
        />
      )}
    </div>
  );
}

function ReviewStep({
  kyc, onBack, onSubmitted,
}: {
  kyc: ApiKycSummary;
  onBack: () => void;
  onSubmitted: () => void;
}) {
  const profile = useRiderAuthStore((s) => s.profile);
  const [declared, setDeclared] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!declared) return toastError(new Error("Confirm your details are true to submit."), "Confirmation needed");
    setSubmitting(true);
    try {
      await riderApi.submitMyKyc();
      onSubmitted();
    } catch (err) {
      toastError(err, "Could not submit");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardContent className="p-4">
        <p className="mb-3 text-sm font-bold">Review &amp; Declare</p>
        <div className="px-1">
          <DetailRow label="Full Name" value={profile?.full_name ?? "—"} />
          <DetailRow label="Date of Birth" value={profile?.date_of_birth ?? "—"} />
          <DetailRow label="Phone" value={profile?.phone ?? "—"} />
          <DetailRow label="Profile Photo" value={profile?.profile_photo_url ? "Uploaded" : "Not uploaded"} />
          <DetailRow
            label="Emergency Contact"
            value={
              profile?.emergency_contact_phone
                ? `${profile.emergency_contact_name || ""} ${profile.emergency_contact_phone}`.trim()
                : "—"
            }
          />
        </div>
        <div className="mt-3 space-y-2">
          {kyc.documents.map((d) => (
            <DocRow key={d.id} doc={d} />
          ))}
        </div>
        {kyc.missing_document_types.length > 0 && (
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-warning/10 p-2.5 text-xs font-medium text-warning">
            <AlertTriangle className="h-3.5 w-3.5" />
            Still needed: {kyc.missing_document_types.map((t) => DOC_TYPE_LABEL[t]).join(", ")}
          </div>
        )}
        <label className="mt-4 flex items-start gap-2 text-xs">
          <input type="checkbox" checked={declared} onChange={(e) => setDeclared(e.target.checked)} className="mt-0.5" />
          I declare the information and documents provided are true and belong to me.
        </label>
        <div className="mt-4 flex gap-2">
          <Button variant="outline" onClick={onBack}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button className="flex-1" disabled={submitting || !kyc.can_submit} onClick={submit}>
            <ShieldCheck className="h-4 w-4" /> {submitting ? "Submitting…" : "Submit for Review"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusHeader({ kyc }: { kyc: ApiKycSummary }) {
  return (
    <Card className="mb-4">
      <CardContent className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-bold">Identity Verification</p>
              <p className="text-[11px] text-muted-foreground">{kyc.completion_percent}% complete</p>
            </div>
          </div>
          <StatusPill tone={KYC_STATUS_TONE[kyc.kyc_status]}>{KYC_STATUS_LABEL[kyc.kyc_status]}</StatusPill>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-border">
          <div
            className={`h-full rounded-full ${kyc.kyc_status === "rejected" ? "bg-destructive" : "bg-primary"}`}
            style={{ width: `${kyc.completion_percent}%` }}
          />
        </div>
        {kyc.kyc_status === "rejected" && (
          <p className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-[11px] font-bold text-destructive">
            A document was rejected. Fix it below and resubmit.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function PhotoStep({ currentUrl, onDone }: { currentUrl: string | null; onDone: () => void }) {
  const [uploaded, setUploaded] = useState(!!currentUrl);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const pick = async (file: File) => {
    const err = validateFile(file);
    if (err) return toastError(new Error(err), "Invalid file");
    setBusy(true);
    try {
      await riderApi.uploadMyPhoto(file);
      setUploaded(true);
      await onDone();
    } catch (e) {
      toastError(e, "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardContent className="p-4">
        <p className="mb-1 text-sm font-bold">Profile Photo</p>
        <p className="mb-4 text-xs text-muted-foreground">
          Face the camera directly, use good lighting, remove sunglasses or hats, plain background.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png"
          hidden
          onChange={(e) => e.target.files?.[0] && pick(e.target.files[0])}
        />
        <Button variant="outline" className="w-full" disabled={busy} onClick={() => fileRef.current?.click()}>
          <Upload className="h-4 w-4" /> {uploaded ? "Retake or choose another" : "Choose a photo"}
        </Button>
        {uploaded && (
          <Button className="mt-3 w-full" onClick={onDone}>
            Continue <ChevronRight className="h-4 w-4" />
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function ContactStep({
  initialName, initialPhone, onBack, onNext,
}: {
  initialName: string;
  initialPhone: string;
  onBack: () => void;
  onNext: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState(initialPhone);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (name.trim() && !/^[A-Za-z\s'-]+$/.test(name.trim())) {
      return setError("Contact name can only contain letters, spaces, apostrophes and hyphens.");
    }
    if (!/^\+?[1-9]\d{7,14}$/.test(phone.trim())) {
      return setError("Enter a valid phone number, e.g. +919876543210.");
    }
    setError("");
    setSaving(true);
    try {
      await riderApi.updateMe({
        emergency_contact_name: name.trim() || undefined,
        emergency_contact_phone: phone.trim(),
      });
      onNext();
    } catch (err) {
      toastError(err, "Could not save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <p className="text-sm font-bold">Emergency Contact</p>
        <div className="space-y-1.5">
          <label className="text-sm font-semibold">Contact Name</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-semibold">Alternate Phone Number</label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Alternate phone number" inputMode="tel" />
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <div className="flex gap-2">
          <Button variant="outline" onClick={onBack}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button className="flex-1" disabled={saving} onClick={save}>
            {saving ? "Saving…" : "Save & Continue"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function DocStep({
  type, doc, requiresExpiry, onBack, onDone,
}: {
  type: KycDocType;
  doc?: ApiDocument;
  requiresExpiry: boolean;
  onBack: () => void;
  onDone: () => void;
}) {
  const rejected = doc?.verification_status === "rejected";
  const onFile = !!doc && !rejected;

  const [docNumber, setDocNumber] = useState("");
  const [expiresOn, setExpiresOn] = useState("");
  const [front, setFront] = useState<File | null>(null);
  const [back, setBack] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const upload = async () => {
    if (!docNumber.trim()) return setError("Enter the document number.");
    if (type === "aadhaar" && !/^\d{4}\s?\d{4}\s?\d{4}$/.test(docNumber.trim())) {
      return setError("Enter your 12-digit Aadhaar number.");
    }
    if (!front && !onFile) return setError("Add a photo or PDF of the front.");
    if (!back && !onFile) return setError("Add a photo or PDF of the back.");
    if (requiresExpiry && !expiresOn.trim()) return setError("A driving licence must include its expiry date.");
    for (const f of [front, back]) {
      if (f) {
        const v = validateFile(f);
        if (v) return setError(v);
      }
    }
    setError("");
    setBusy(true);
    try {
      const correcting = rejected ? doc!.id : undefined;
      if (correcting) {
        await riderApi.updateMyDocument(correcting, {
          doc_number: docNumber.trim(),
          expires_on: expiresOn.trim() || undefined,
          front: front ?? undefined,
          back: back ?? undefined,
        });
      } else {
        await riderApi.uploadMyDocument({
          doc_type: type,
          doc_number: docNumber.trim(),
          expires_on: expiresOn.trim() || undefined,
          front: front as File,
          back: back ?? undefined,
        });
      }
      onDone();
    } catch (err) {
      toastError(err, "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-1 flex items-center justify-between">
          <p className="text-sm font-bold">{DOC_TYPE_LABEL[type]}</p>
          {doc && <Badge variant={VERIFICATION_TONE[doc.verification_status] === "success" ? "success" : VERIFICATION_TONE[doc.verification_status] === "danger" ? "destructive" : "warning"}>{doc.verification_status}</Badge>}
        </div>

        {rejected && doc?.rejection_reason && (
          <p className="mb-3 rounded-lg bg-destructive/10 px-3 py-2 text-[11px] font-semibold text-destructive">
            Rejected: {doc.rejection_reason}
          </p>
        )}

        {onFile ? (
          <DocRow doc={doc!} />
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-sm font-semibold">
                {type === "aadhaar" ? "Aadhaar Number" : "Document Number"}
              </label>
              <Input
                value={docNumber}
                onChange={(e) => setDocNumber(e.target.value.toUpperCase())}
                placeholder={type === "aadhaar" ? "Aadhaar number" : "Document number"}
              />
            </div>
            {requiresExpiry && (
              <div className="space-y-1.5">
                <label className="text-sm font-semibold">Expiry Date</label>
                <Input type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} />
              </div>
            )}
            <FileSlot label="Front" file={front} onPick={setFront} />
            <FileSlot label="Back" file={back} onPick={setBack} />
            {error && <p className="text-xs text-destructive">{error}</p>}
            <Button className="w-full" disabled={busy} onClick={upload}>
              <Upload className="h-4 w-4" /> {rejected ? "Resubmit Document" : "Upload Document"}
            </Button>
          </div>
        )}

        <div className="mt-3 flex gap-2">
          <Button variant="outline" onClick={onBack}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          {onFile && (
            <Button variant="secondary" className="flex-1" onClick={onDone}>
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function FileSlot({ label, file, onPick }: { label: string; file: File | null; onPick: (f: File | null) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{label} *</p>
      <input
        ref={ref}
        type="file"
        accept="image/jpeg,image/png,application/pdf"
        hidden
        onChange={(e) => onPick(e.target.files?.[0] ?? null)}
      />
      {file ? (
        <div className="flex items-center gap-3 rounded-lg border border-primary/50 bg-secondary/40 p-2.5">
          <FileText className="h-5 w-5 text-primary" />
          <span className="flex-1 truncate text-xs font-bold">{file.name}</span>
          <button onClick={() => onPick(null)} className="text-destructive" aria-label={`Remove ${label}`}>
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => ref.current?.click()}
          className="flex w-full flex-col items-center gap-1.5 rounded-lg border border-dashed border-border py-5 text-xs font-bold text-muted-foreground"
        >
          <Upload className="h-5 w-5" />
          Add photo or PDF
        </button>
      )}
    </div>
  );
}

function DocRow({ doc }: { doc: ApiDocument }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border p-3">
      <FileText className="h-5 w-5 text-primary" />
      <div className="flex-1">
        <p className="text-[11px] font-bold">{DOC_TYPE_LABEL[doc.document_type]}</p>
        <p className="text-[10px] text-muted-foreground">
          {doc.doc_number_masked ?? "—"}
          {doc.expires_on ? ` • expires ${formatDate(doc.expires_on)}` : ""}
        </p>
        {doc.is_expired && <p className="text-[10px] font-bold text-destructive">Expired — upload a current one</p>}
      </div>
      <Badge
        variant={
          VERIFICATION_TONE[doc.verification_status] === "success"
            ? "success"
            : VERIFICATION_TONE[doc.verification_status] === "danger"
              ? "destructive"
              : "warning"
        }
      >
        {doc.verification_status}
      </Badge>
    </div>
  );
}

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Phone, Mail, LifeBuoy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/common/EmptyState";
import { toastError, toastSuccess } from "@/lib/toastHelpers";
import { CenteredSpinner, StatusPill } from "@/rider/components/common";
import { riderApi } from "@/rider/services/riderApi";
import { SUPPORT_EMAIL, SUPPORT_PHONE, SUPPORT_PHONE_DISPLAY } from "@/rider/constants/support";
import { SUPPORT_STATUS_LABEL, SUPPORT_STATUS_TONE, formatDate } from "@/rider/constants/status";

export default function RiderSupport() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["rider", "support"],
    queryFn: () => riderApi.mySupportRequests({ pageSize: 30 }),
  });

  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (subject.trim().length < 3) return setError("Subject must be at least 3 characters.");
    if (description.trim().length < 10) return setError("Please describe the issue in a little more detail.");
    setError(null);
    setSubmitting(true);
    try {
      await riderApi.createSupportRequest({ subject: subject.trim(), description: description.trim() });
      setSubject("");
      setDescription("");
      qc.invalidateQueries({ queryKey: ["rider", "support"] });
      toastSuccess("Message sent", "Our team will get back to you.");
    } catch (err) {
      toastError(err, "Could not send your message");
    } finally {
      setSubmitting(false);
    }
  };

  const requests = data?.data ?? [];

  return (
    <div>
      <h1 className="mb-4 text-lg font-bold">Support</h1>

      <div className="mb-5 grid grid-cols-2 gap-3">
        <a
          href={`tel:${SUPPORT_PHONE}`}
          className="flex flex-col items-center gap-1.5 rounded-lg border border-border p-4 text-center"
        >
          <Phone className="h-5 w-5 text-primary" />
          <span className="text-xs font-semibold">Call us</span>
          <span className="text-[10px] text-muted-foreground">{SUPPORT_PHONE_DISPLAY}</span>
        </a>
        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          className="flex flex-col items-center gap-1.5 rounded-lg border border-border p-4 text-center"
        >
          <Mail className="h-5 w-5 text-primary" />
          <span className="text-xs font-semibold">Email us</span>
          <span className="truncate text-[10px] text-muted-foreground">{SUPPORT_EMAIL}</span>
        </a>
      </div>

      <Card className="mb-6">
        <CardContent className="space-y-3 p-4">
          <p className="text-sm font-semibold">Send us a message</p>
          <Input placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
          <textarea
            className="min-h-[100px] w-full rounded-lg border border-input bg-background p-3 text-sm"
            placeholder="How can we help?"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
          <Button className="w-full" disabled={submitting} onClick={submit}>
            {submitting ? "Sending…" : "Send message"}
          </Button>
        </CardContent>
      </Card>

      <h2 className="mb-2 text-sm font-semibold">Your requests</h2>
      {isLoading ? (
        <CenteredSpinner />
      ) : requests.length === 0 ? (
        <EmptyState icon={LifeBuoy} title="No requests yet" />
      ) : (
        <div className="space-y-2">
          {requests.map((r) => (
            <Card key={r.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold">{r.subject}</p>
                  <StatusPill tone={SUPPORT_STATUS_TONE[r.status]}>{SUPPORT_STATUS_LABEL[r.status]}</StatusPill>
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{r.description}</p>
                <p className="mt-1.5 text-[11px] text-muted-foreground">{formatDate(r.created_at)}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

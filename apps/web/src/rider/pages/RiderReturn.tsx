import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Star, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/common/EmptyState";
import { toastSuccess, toastError } from "@/lib/toastHelpers";
import { CenteredSpinner, DetailRow } from "@/rider/components/common";
import { useCurrentRental, useOverdueLateFee, useReturnStage } from "@/rider/hooks/queries";
import { usePayOverdueLateFee, useRequestReturn } from "@/rider/hooks/mutations";
import { RETURN_REASONS, RETURN_REASON_LABEL, type ReturnReason } from "@/rider/lib/returnPolicy";
import { formatDate, formatMoney } from "@/rider/constants/status";

export default function RiderReturn() {
  const navigate = useNavigate();
  const { data: rental, isLoading } = useCurrentRental();
  const { data: lateFee, isLoading: lfLoading } = useOverdueLateFee(!!rental);
  const { data: stage } = useReturnStage(!!rental);
  const { pay: payLateFee, paying: payingLateFee, error: lateFeeError } = usePayOverdueLateFee();
  const { requestReturn, submitting } = useRequestReturn();

  const [reason, setReason] = useState<ReturnReason | "">("");
  const [feedback, setFeedback] = useState("");
  const [rating, setRating] = useState(0);
  const [formError, setFormError] = useState<string | null>(null);

  if (isLoading || (rental && lfLoading)) return <CenteredSpinner />;
  if (!rental) return <EmptyState title="No active rental" description="You have no scooter to return right now." />;

  const returnInProgress =
    !!rental.return_requested_at ||
    (!!stage && stage.status !== "return_requested" && stage.status !== "rejected");

  if (returnInProgress) {
    return (
      <div>
        <BackLink />
        <h1 className="mb-4 text-lg font-bold">Return status</h1>
        <div className="rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm">
          <p className="font-bold text-warning">
            {stage?.status === "payment_required"
              ? "Payment Required"
              : stage?.status === "payment_submitted"
                ? "Payment Submitted — awaiting verification"
                : stage?.status === "ready_for_approval"
                  ? "Payment Verified — completing your return"
                  : "Return requested"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {stage?.status === "payment_required"
              ? `An additional ${formatMoney(stage.additionalDue)} was found during inspection. Pay it from your Billing tab to continue.`
              : "Your scooter is waiting for staff confirmation. It stays yours until then."}
          </p>
        </div>
        {stage?.status === "payment_required" && (
          <Button className="mt-3 w-full" onClick={() => navigate("/rider/billing")}>
            Go to Billing
          </Button>
        )}
      </div>
    );
  }

  // Overdue renewal late fee must be settled before a return can be requested.
  if (lateFee && !lateFee.isSettled) {
    return (
      <div>
        <BackLink />
        <h1 className="mb-4 text-lg font-bold">Late fee payment required</h1>
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
          <p className="text-xs text-muted-foreground">
            Your plan has expired and a late fee is pending. Please pay it before returning the scooter.
          </p>
        </div>
        <Card className="mb-4 px-4">
          {rental.vehicle && <DetailRow label="Vehicle" value={rental.vehicle.registration_number} />}
          {lateFee.dueOn && <DetailRow label="Plan ended" value={formatDate(lateFee.dueOn)} />}
          <DetailRow label="Overdue" value={`${lateFee.daysLate} day${lateFee.daysLate > 1 ? "s" : ""}`} />
          <DetailRow label="Late fee" value={<span className="text-destructive">{formatMoney(lateFee.lateFee)}</span>} />
        </Card>
        <Button
          variant="destructive"
          className="h-12 w-full text-base"
          disabled={payingLateFee}
          onClick={payLateFee}
        >
          {payingLateFee ? "Processing…" : `Pay late fee — ${formatMoney(lateFee.lateFee)}`}
        </Button>
        {lateFeeError && <p className="mt-2 text-center text-xs text-destructive">{lateFeeError}</p>}
      </div>
    );
  }

  const submit = async () => {
    const errs: string[] = [];
    if (!reason) errs.push("Pick a reason.");
    if (!rating) errs.push("Rate your ride.");
    if (reason === "other" && !feedback.trim()) errs.push("Tell us a bit more.");
    if (errs.length) {
      setFormError(errs[0]);
      return;
    }
    setFormError(null);
    const res = await requestReturn(rental.id, {
      reason: reason as ReturnReason,
      feedback: feedback.trim() || undefined,
      rating,
    });
    if (res.ok) {
      toastSuccess("Return requested", res.message);
      navigate("/rider/scooter", { replace: true });
    } else {
      toastError(new Error(res.message), "Could not request return");
    }
  };

  return (
    <div>
      <BackLink />
      <h1 className="mb-4 text-lg font-bold">Return scooter</h1>

      <p className="mb-2 text-sm font-semibold">Why are you returning?</p>
      <div className="mb-4 flex flex-wrap gap-2">
        {RETURN_REASONS.map((r) => (
          <button
            key={r}
            onClick={() => setReason(r)}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
              reason === r ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
            }`}
          >
            {RETURN_REASON_LABEL[r]}
          </button>
        ))}
      </div>

      <p className="mb-2 text-sm font-semibold">
        Anything you'd like us to know?{reason === "other" ? " *" : ""}
      </p>
      <textarea
        className="mb-4 min-h-[80px] w-full rounded-lg border border-input bg-background p-3 text-sm"
        placeholder="Tell us how the ride went"
        value={feedback}
        onChange={(e) => setFeedback(e.target.value)}
      />

      <p className="mb-2 text-sm font-semibold">Rate your ride *</p>
      <div className="mb-4 flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} onClick={() => setRating(n)} aria-label={`${n} stars`}>
            <Star className={`h-8 w-8 ${n <= rating ? "fill-warning text-warning" : "text-muted-foreground"}`} />
          </button>
        ))}
      </div>

      <div className="mb-4 rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs text-muted-foreground">
        The rental stays active — and the scooter stays yours — until our team confirms the physical handover at the
        station.
        {rental.late_return_fee_per_day > 0 &&
          ` Each day past the deadline adds a ${formatMoney(rental.late_return_fee_per_day)} late fee.`}
      </div>

      {formError && <p className="mb-3 text-xs font-medium text-destructive">{formError}</p>}

      <Button className="h-12 w-full text-base" disabled={submitting} onClick={submit}>
        {submitting ? "Submitting…" : "Request Return"}
      </Button>
    </div>
  );
}

function BackLink() {
  const navigate = useNavigate();
  return (
    <button onClick={() => navigate(-1)} className="mb-3 flex items-center gap-1 text-sm text-muted-foreground">
      <ChevronLeft className="h-4 w-4" /> Back
    </button>
  );
}

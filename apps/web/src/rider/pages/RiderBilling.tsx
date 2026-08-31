import { useState } from "react";
import { CreditCard, ShieldCheck, Receipt, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/common/EmptyState";
import { CenteredSpinner, SectionTitle } from "@/rider/components/common";
import { PaymentTrustRow } from "@/rider/components/payment";
import {
  useCurrentBooking, useCurrentRental, useBookingWithPlan, useMyInvoices, useReturnStage,
} from "@/rider/hooks/queries";
import { usePayInvoice, usePayBooking } from "@/rider/hooks/mutations";
import { riderApi } from "@/rider/services/riderApi";
import { getRenewalEligibility } from "@/rider/lib/returnPolicy";
import { BILLING_CYCLE_LABEL, formatDate, formatMoney } from "@/rider/constants/status";
import type { ApiEarlyRecharge, ApiInvoice } from "@/rider/types/api";
import { ApiError } from "@/services/api/httpClient";

const PURPOSE_LABEL: Record<string, string> = {
  initial: "Plan & Deposit",
  subscription_period: "Plan Renewal",
  settlement: "Return Settlement",
  adhoc: "Payment",
};

function invoiceLabel(inv: ApiInvoice): string {
  if (inv.purpose === "subscription_period" && inv.items.some((i) => i.item_type === "deposit")) {
    return PURPOSE_LABEL.initial;
  }
  if (inv.purpose === "adhoc") return inv.items[0]?.description || "Additional charge";
  return PURPOSE_LABEL[inv.purpose] ?? "Payment";
}

export default function RiderBilling() {
  const { data: booking } = useCurrentBooking();
  const { data: rental } = useCurrentRental();
  const bookingId = booking?.id ?? rental?.booking_id ?? undefined;
  const { data: planBooking, isLoading: pbLoading } = useBookingWithPlan(bookingId);
  const { data: invoicesPage, isLoading: invLoading } = useMyInvoices();
  const { data: returnStage } = useReturnStage(!!rental);

  const { pay: payInvoice, payingId, error: invError } = usePayInvoice();
  const { pay: payBooking, paying: payingBooking, error: bookingPayError } = usePayBooking();

  const [expanded, setExpanded] = useState<string | null>(null);
  const [recharge, setRecharge] = useState<ApiEarlyRecharge | null>(null);
  const [rechargeLoading, setRechargeLoading] = useState(false);
  const [rechargeError, setRechargeError] = useState<string | null>(null);

  if (pbLoading || invLoading) return <CenteredSpinner />;

  const invoices = invoicesPage?.data ?? [];
  const outstanding = invoices.filter((i) => i.status !== "void" && i.payment_state !== "paid");
  const history = [...invoices].sort((a, b) => {
    const ad = a.paid_at ?? a.due_on ?? a.created_at;
    const bd = b.paid_at ?? b.due_on ?? b.created_at;
    return ad < bd ? 1 : -1;
  });

  const plan = planBooking?.plan ?? null;
  const isPendingBookingPayment = planBooking?.status === "pending_payment";
  const hasActiveReturn =
    !!returnStage && returnStage.status !== "return_completed" && returnStage.status !== "rejected";
  const eligibility = getRenewalEligibility(
    planBooking?.plan_status ?? null,
    planBooking?.next_due_at ?? null,
    planBooking?.renewal_status ?? null,
  );
  const canRechargeEarly = eligibility.canRenew && outstanding.length === 0 && !hasActiveReturn;

  const startRecharge = async () => {
    if (!bookingId) return;
    setRechargeError(null);
    setRechargeLoading(true);
    try {
      setRecharge(await riderApi.requestEarlyRecharge(bookingId));
    } catch (err) {
      setRechargeError(err instanceof ApiError ? err.message : "Could not load your renewal details.");
    } finally {
      setRechargeLoading(false);
    }
  };

  const confirmRecharge = async () => {
    if (!recharge) return;
    const ok = await payInvoice(recharge.invoiceId, "Plan Renewal");
    if (ok) setRecharge(null);
  };

  if (!bookingId && outstanding.length === 0 && history.length === 0) {
    return (
      <EmptyState icon={CreditCard} title="No active plan" description="Book a scooter to see your billing details here." />
    );
  }

  const renderOutstanding = () => (
    <>
      <PaymentTrustRow className="mb-4 mt-1" />
      {outstandingCards()}
    </>
  );

  const outstandingCards = () =>
    outstanding.map((inv) => {
      const total = inv.total_due ?? inv.balance_amount;
      return (
        <Card key={inv.id} className="mb-3">
          <CardContent className="p-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold">{invoiceLabel(inv)}</p>
              <p className="text-[11px] text-muted-foreground">Due {formatDate(inv.due_on)}</p>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Amount</span>
              <span>{formatMoney(inv.total_amount)}</span>
            </div>
            {inv.allocated_amount > 0 && (
              <div className="flex items-center justify-between text-sm text-success">
                <span>Already paid</span>
                <span>-{formatMoney(inv.allocated_amount)}</span>
              </div>
            )}
            {!!inv.late_fee && (
              <div className="flex items-center justify-between text-sm text-warning">
                <span>Late fee ({inv.days_late} day{inv.days_late === 1 ? "" : "s"})</span>
                <span>{formatMoney(inv.late_fee)}</span>
              </div>
            )}
            <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
              <span className="text-sm font-semibold">Total</span>
              <span className="text-xl font-bold">{formatMoney(total)}</span>
            </div>
            <Button
              className="mt-3 w-full"
              disabled={payingId === inv.id}
              onClick={() => payInvoice(inv.id, invoiceLabel(inv))}
            >
              <CreditCard className="h-4 w-4" />
              {payingId === inv.id ? "Processing…" : `Pay ${formatMoney(total)}`}
            </Button>
          </CardContent>
        </Card>
      );
    });

  return (
    <div>
      <h1 className="mb-4 text-lg font-bold">Billing</h1>

      {plan && (
        <div className="mb-6 rounded-lg border border-primary/25 bg-primary/5 p-5">
          {planBooking?.plan_status && (
            <Badge variant="info" className="mb-2">{planBooking.plan_status.replace("_", " ")}</Badge>
          )}
          <p className="text-lg font-bold">{plan.name}</p>
          <p className="text-3xl font-bold">
            {formatMoney(plan.price)}
            <span className="text-sm font-medium text-muted-foreground">
              {" "}/ {BILLING_CYCLE_LABEL[plan.billing_cycle] ?? plan.billing_cycle}
            </span>
          </p>
          <div className="mt-3 flex items-center justify-between border-t border-primary/20 pt-3 text-xs">
            <div>
              <p className="font-bold">{formatDate(planBooking?.current_period_start ?? null)}</p>
              <p className="uppercase tracking-wider text-muted-foreground">Started</p>
            </div>
            <div className="text-right">
              <p className="font-bold">{formatDate(planBooking?.next_due_at ?? null)}</p>
              <p className="uppercase tracking-wider text-muted-foreground">Ends</p>
            </div>
          </div>
        </div>
      )}

      {bookingId && (
        <>
          <SectionTitle>Amount Due</SectionTitle>
          {isPendingBookingPayment ? (
            <Card className="mb-6">
              <CardContent className="p-4">
                <p className="text-sm font-semibold">Booking Payment</p>
                <p className="mb-3 mt-1 text-xs text-muted-foreground">
                  Your last payment attempt didn't go through. Your reservation is still held — complete the payment
                  to confirm your booking.
                </p>
                <div className="flex items-center justify-between border-t border-border pt-2 text-sm font-semibold">
                  <span>Total</span>
                  <span>{formatMoney((plan?.price ?? 0) + (plan?.deposit_amount ?? 0))}</span>
                </div>
                <Button
                  className="mt-3 w-full"
                  disabled={payingBooking}
                  onClick={() => payBooking(bookingId, plan?.name ?? "Scooter Booking")}
                >
                  <CreditCard className="h-4 w-4" />
                  {payingBooking ? "Processing…" : "Complete Payment"}
                </Button>
                {bookingPayError && <p className="mt-2 text-xs text-destructive">{bookingPayError}</p>}
              </CardContent>
            </Card>
          ) : outstanding.length > 0 ? (
            <>
              {renderOutstanding()}
              {invError && <p className="mb-3 text-center text-xs text-destructive">{invError}</p>}
            </>
          ) : hasActiveReturn ? (
            <div className="mb-6 rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm">
              <p className="font-semibold">Return in Progress</p>
              <p className="text-xs text-muted-foreground">Your return is awaiting staff review.</p>
            </div>
          ) : canRechargeEarly ? (
            <Card className="mb-6">
              <CardContent className="p-4">
                <p className="text-sm font-semibold">
                  {eligibility.isLate ? "Your plan has expired" : `Plan ends ${formatDate(planBooking?.next_due_at ?? null)}`}
                </p>
                <p className="mb-3 mt-1 text-xs text-muted-foreground">
                  {eligibility.isLate
                    ? "Renew now — a late fee applies, shown below before you pay."
                    : "Renew now to keep riding without interruption."}
                </p>
                {recharge ? (
                  <>
                    <div className="rounded-lg bg-secondary/50 p-3 text-sm">
                      {recharge.items.map((it, i) => (
                        <div key={i} className="flex justify-between py-0.5">
                          <span className={it.amount < 0 ? "text-success" : "text-muted-foreground"}>{it.label}</span>
                          <span>{it.amount < 0 ? "-" : ""}{formatMoney(Math.abs(it.amount))}</span>
                        </div>
                      ))}
                      {recharge.isLate && (
                        <div className="flex justify-between py-0.5 text-warning">
                          <span>Late fee ({recharge.daysLate} day{recharge.daysLate === 1 ? "" : "s"})</span>
                          <span>{formatMoney(recharge.lateFee)}</span>
                        </div>
                      )}
                      <div className="mt-2 flex justify-between border-t border-border pt-2 font-semibold">
                        <span>Total payable</span>
                        <span>{formatMoney(recharge.total)}</span>
                      </div>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <Button variant="outline" className="flex-1" onClick={() => setRecharge(null)}>Cancel</Button>
                      <Button className="flex-1" disabled={!!payingId} onClick={confirmRecharge}>
                        {payingId ? "Processing…" : `Pay ${formatMoney(recharge.total)}`}
                      </Button>
                    </div>
                  </>
                ) : (
                  <Button className="w-full" disabled={rechargeLoading} onClick={startRecharge}>
                    {rechargeLoading ? "Loading…" : "Review & Renew"}
                  </Button>
                )}
                {rechargeError && <p className="mt-2 text-xs text-destructive">{rechargeError}</p>}
              </CardContent>
            </Card>
          ) : eligibility.alreadyScheduled ? (
            <div className="mb-6 flex items-center gap-3 rounded-lg border border-success/30 bg-success/10 p-4 text-sm">
              <ShieldCheck className="h-5 w-5 text-success" />
              <p>Renewal scheduled — your current plan stays active until then.</p>
            </div>
          ) : (
            <div className="mb-6 flex items-center gap-3 rounded-lg border border-success/30 bg-success/10 p-4 text-sm">
              <ShieldCheck className="h-5 w-5 text-success" />
              <p>All payments are clear — no amount due.</p>
            </div>
          )}
        </>
      )}

      {!bookingId && outstanding.length > 0 && (
        <>
          <SectionTitle>Amount Due</SectionTitle>
          {renderOutstanding()}
        </>
      )}

      <SectionTitle>Payment History</SectionTitle>
      {history.length === 0 ? (
        <EmptyState icon={Receipt} title="No payments yet" />
      ) : (
        <div className="space-y-2">
          {history.map((inv) => {
            const open = expanded === inv.id;
            return (
              <Card key={inv.id}>
                <button
                  className="flex w-full items-center justify-between p-4 text-left"
                  onClick={() => setExpanded(open ? null : inv.id)}
                >
                  <div>
                    <p className="text-sm font-semibold">{invoiceLabel(inv)}</p>
                    <p className="text-[11px] text-muted-foreground">{formatDate(inv.paid_at ?? inv.due_on)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold">{formatMoney(inv.total_amount)}</span>
                    <Badge variant={inv.payment_state === "paid" ? "success" : "warning"}>
                      {inv.payment_state === "paid" ? "Paid" : "Due"}
                    </Badge>
                    {inv.items.length > 0 && (open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />)}
                  </div>
                </button>
                {open && inv.items.length > 0 && (
                  <div className="border-t border-border px-4 py-3 text-xs">
                    {inv.items.map((it) => (
                      <div key={it.id} className="flex justify-between py-1">
                        <span className={it.amount < 0 ? "text-success" : "text-muted-foreground"}>{it.description}</span>
                        <span>{it.amount < 0 ? "-" : ""}{formatMoney(Math.abs(it.amount))}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

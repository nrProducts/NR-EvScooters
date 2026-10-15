import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle, ArrowRight, Banknote, Bike, ChevronDown, Circle, Clock, ClipboardCheck,
  Landmark, ShieldCheck, Wrench,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/common/StatusBadge";
import { cn, formatCurrency, formatDate, formatFullDateTime } from "@/lib/utils";
import type {
  DepositJourney, JourneyRental, JourneyTimelineEvent, JourneyTone, Refund,
} from "@/types";

/**
 * One deposit, start to end, as a tree.
 *
 * Six stages hang off the root in the order money moves — payment, deposit
 * held, rental & return, damage, deposit outcome, refund — and each stage's
 * children are the exact records behind it, with date AND time. A stage that
 * has not happened yet is drawn faded so "not yet" reads differently from
 * "nothing there".
 */

type StageState = "done" | "active" | "todo" | "bad";

const STATE_STYLE: Record<StageState, { ring: string; icon: string; text: string }> = {
  done: { ring: "border-success bg-success/10", icon: "text-success", text: "Done" },
  active: { ring: "border-warning bg-warning/10", icon: "text-warning", text: "In progress" },
  todo: { ring: "border-border bg-muted/40", icon: "text-muted-foreground", text: "Not yet" },
  bad: { ring: "border-destructive bg-destructive/10", icon: "text-destructive", text: "Stopped" },
};

const TONE_DOT: Record<JourneyTone, string> = {
  success: "bg-success",
  info: "bg-primary",
  warning: "bg-warning",
  danger: "bg-destructive",
  muted: "bg-muted-foreground/50",
};

const REFUND_LABEL: Record<Refund["refund_type"], string> = {
  deposit_release: "Deposit release",
  booking_cancellation: "Booking cancellation",
  settlement: "Return settlement",
  goodwill: "Goodwill",
};

const money = (n: number) => formatCurrency(n);
const when = (v: string | null | undefined) => (v ? formatFullDateTime(v) : null);

/** Registration plate(s) of every scooter this deposit's rentals used, or null if none was handed over. */
export function vehicleNumbers(j: DepositJourney): string | null {
  const plates = [...new Set(j.rentals.map((r) => r.vehicle?.registration_number).filter((x): x is string => !!x))];
  return plates.length ? plates.join(", ") : null;
}

/** One-line plain-English position — the answer to "where is this rider's deposit?" */
export function journeyHeadline(j: DepositJourney): string {
  const { deposit, totals, refunds } = j;
  if (deposit.status === "forfeited") return deposit.forfeit_reason ?? "Deposit forfeited.";
  if (deposit.status === "released") {
    return `Refund of ${money(totals.refunded)} paid${deposit.refunded_at ? ` on ${formatFullDateTime(deposit.refunded_at)}` : ""}.`;
  }
  if (deposit.status === "pending") return "Deposit payment not captured yet.";
  const open = refunds.find((r) => r.status === "pending" || r.status === "processing" || r.status === "failed");
  if (open) {
    return open.status === "failed"
      ? "Refund payout failed — retry it from the Refunds tab."
      : open.status === "processing"
        ? "Refund payout submitted — waiting for the gateway."
        : open.reviewed_at
          ? "Refund reviewed — waiting for approval."
          : "Refund raised — waiting for review.";
  }
  if (!deposit.is_refundable) return "This plan's deposit is non-refundable — it is forfeited when the rental ends.";
  if (deposit.min_rental_days_required > 0 && deposit.rental_days_completed < deposit.min_rental_days_required) {
    return `${deposit.rental_days_completed} of ${deposit.min_rental_days_required} required rental days completed.`;
  }
  if (!deposit.refund_eligible_at) return "Held — the rental is still running.";
  return deposit.refund_eligibility === "eligible"
    ? "Eligible for refund now."
    : `Held until ${formatDate(deposit.refund_eligible_at)} (post-return holding period).`;
}

// ---------------------------------------------------------------------------
// Tree primitives
// ---------------------------------------------------------------------------

/** A leaf: label on the left, value on the right, optional time underneath. */
function Leaf({
  label, value, sub, mono, strong, tone, last,
}: {
  label: ReactNode;
  value?: ReactNode;
  sub?: ReactNode;
  mono?: boolean;
  strong?: boolean;
  tone?: JourneyTone;
  last?: boolean;
}) {
  return (
    <li className="relative pl-6">
      {/* the trunk, and the elbow into this leaf */}
      <span className={cn("absolute left-0 top-0 w-px bg-border", last ? "h-[1.05rem]" : "h-full")} />
      <span className="absolute left-0 top-[1.05rem] h-px w-4 bg-border" />
      <span
        className={cn(
          "absolute left-4 top-[0.8rem] h-2 w-2 rounded-full",
          tone ? TONE_DOT[tone] : "bg-muted-foreground/40",
        )}
      />
      <div className="flex items-start justify-between gap-4 py-1.5">
        <div className="min-w-0">
          <p className={cn("text-[0.8125rem]", strong ? "font-semibold" : "text-foreground/80")}>{label}</p>
          {sub ? <p className="text-[0.6875rem] text-muted-foreground">{sub}</p> : null}
        </div>
        {value != null && value !== "" ? (
          <p
            className={cn(
              "max-w-[60%] shrink-0 break-all text-right text-[0.8125rem]",
              mono && "font-mono text-[0.6875rem]",
              strong ? "font-semibold" : "font-medium",
            )}
          >
            {value}
          </p>
        ) : null}
      </div>
    </li>
  );
}

/** A group of leaves with its own heading, indented one level under a stage. */
function Branch({ title, right, children }: { title: ReactNode; right?: ReactNode; children: ReactNode }) {
  return (
    <li className="relative pl-6">
      <span className="absolute left-0 top-0 h-full w-px bg-border" />
      <span className="absolute left-0 top-[1.05rem] h-px w-4 bg-border" />
      <div className="flex items-center justify-between gap-3 py-1.5">
        <p className="text-[0.8125rem] font-semibold">{title}</p>
        {right}
      </div>
      <ul className="ml-2 border-l border-dashed border-border/70 pb-1">{children}</ul>
    </li>
  );
}

function Stage({
  n, icon: Icon, title, state, summary, when: at, defaultOpen = false, children,
}: {
  n: number;
  icon: typeof Circle;
  title: string;
  state: StageState;
  summary?: ReactNode;
  when?: string | null;
  defaultOpen?: boolean;
  children?: ReactNode;
}) {
  const s = STATE_STYLE[state];
  return (
    <li className="relative pl-12">
      {/* the spine that joins every stage */}
      <span className="absolute left-[1.0625rem] top-0 h-full w-px bg-border" />
      <span
        className={cn(
          "absolute left-0 top-3 flex h-[2.125rem] w-[2.125rem] items-center justify-center rounded-full border-2 bg-card",
          s.ring,
        )}
      >
        <Icon className={cn("h-4 w-4", s.icon)} />
      </span>

      <details
        open={defaultOpen}
        className={cn(
          "group mb-3 rounded-xl border border-border bg-card shadow-soft",
          state === "todo" && "opacity-70",
        )}
      >
        <summary className="flex cursor-pointer list-none items-center gap-3 p-3 [&::-webkit-details-marker]:hidden">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">
              <span className="mr-1.5 text-muted-foreground">{n}.</span>
              {title}
            </p>
            {at ? <p className="text-[0.6875rem] text-muted-foreground">{at}</p> : null}
          </div>
          {summary ? <div className="shrink-0 text-right text-sm font-semibold">{summary}</div> : null}
          <span
            className={cn(
              "shrink-0 rounded-full border px-2 py-0.5 text-[0.625rem] font-medium uppercase tracking-wide",
              s.ring, s.icon,
            )}
          >
            {s.text}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        {children ? <ul className="border-t border-border px-3 py-2">{children}</ul> : null}
      </details>
    </li>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" | "muted" }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="text-[0.625rem] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-0.5 text-base font-semibold tabular-nums",
          tone === "good" && "text-success",
          tone === "bad" && "text-destructive",
          tone === "muted" && "text-muted-foreground",
        )}
      >
        {value}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stage contents
// ---------------------------------------------------------------------------

function RentalBranch({ rental, index, total }: { rental: JourneyRental; index: number; total: number }) {
  const r = rental.return;
  const s = rental.settlement;
  return (
    <Branch title={total > 1 ? `Rental ${index + 1}` : "Rental"}>
      <Leaf
        label="Scooter"
        value={rental.vehicle ? `${rental.vehicle.name} · ${rental.vehicle.registration_number}` : "—"}
      />
      <Leaf label="Picked up" value={when(rental.picked_up_at)} tone="info" />
      <Leaf label="Due back" value={when(rental.due_back_at)} />
      <Leaf
        label="Returned"
        value={when(rental.returned_at) ?? "Still riding"}
        tone={rental.returned_at ? "success" : undefined}
        last={!r && !s && !rental.end_reason}
      />
      {rental.end_reason ? <Leaf label="Ended because" value={rental.end_reason} last={!r && !s} /> : null}
      {r ? (
        <Branch title="Return" right={<span className="text-xs capitalize text-muted-foreground">{r.status}</span>}>
          <Leaf label="Requested" value={when(r.requested_at)} sub={r.requested_reason} />
          <Leaf label="Inspected" value={when(r.inspected_at) ?? "Pending"} sub={r.inspection_notes} />
          {r.other_charges_amount > 0 ? <Leaf label="Other charges" value={money(r.other_charges_amount)} tone="warning" /> : null}
          <Leaf label="Payment verified" value={when(r.payment_verified_at) ?? "—"} />
          <Leaf
            label="Approved"
            value={when(r.approved_at) ?? "—"}
            tone={r.approved_at ? "success" : undefined}
            last={!r.rejected_at}
          />
          {r.rejected_at ? (
            <Leaf label="Rejected" value={when(r.rejected_at)} sub={r.rejection_reason} tone="danger" last />
          ) : null}
        </Branch>
      ) : null}
      {s ? (
        <Branch
          title="Settlement"
          right={<span className="text-xs text-muted-foreground">{when(s.settled_at)}</span>}
        >
          <Leaf label="Deposit" value={money(s.deposit_amount)} />
          <Leaf label="Late fee" value={s.late_fee_amount > 0 ? `− ${money(s.late_fee_amount)}` : money(0)} />
          <Leaf label="Damage" value={s.damage_amount > 0 ? `− ${money(s.damage_amount)}` : money(0)} />
          <Leaf label="Other charges" value={s.other_charges_amount > 0 ? `− ${money(s.other_charges_amount)}` : money(0)} />
          <Leaf
            label={s.outcome === "refund_due" ? "Back to rider" : s.outcome === "amount_due" ? "Rider owes" : "Balanced"}
            value={money(Math.abs(s.net_amount))}
            strong
            tone={s.outcome === "amount_due" ? "warning" : "success"}
            last
          />
        </Branch>
      ) : null}
    </Branch>
  );
}

function RefundBranch({ refund, paid }: { refund: Refund; paid: number | null }) {
  // What the rider paid vs what became refundable: the gap is whatever was
  // kept at cancellation, BEFORE any staff review. It is what makes
  // "paid 9, original amount 8" explainable instead of a mystery.
  const keptAtCancel = paid != null ? Math.max(0, Math.round((paid - refund.gross_amount) * 100) / 100) : 0;
  const cancelCharge = refund.booking?.cancellation_penalty_amount ?? 0;
  const d = refund.deductions;
  const tone: JourneyTone = refund.status === "succeeded" ? "success"
    : refund.status === "failed" || refund.status === "rejected" ? "danger" : "warning";

  return (
    <Branch
      title={REFUND_LABEL[refund.refund_type]}
      right={<StatusBadge status={refund.status} />}
    >
      {paid != null ? <Leaf label="Paid by rider" value={money(paid)} /> : null}
      {keptAtCancel > 0 ? (
        <Leaf
          label={refund.refund_type === "booking_cancellation"
            ? cancelCharge > 0 ? "Cancellation charge kept" : "Kept at cancellation"
            : "Not refundable"}
          sub={refund.refund_type === "booking_cancellation"
            ? "Taken when the booking was cancelled, before staff review."
            : "Charges and non-refundable parts of the payment."}
          value={`− ${money(keptAtCancel)}`}
          tone="warning"
        />
      ) : null}
      <Leaf label="Refundable" sub="Frozen when the refund was raised" value={money(refund.gross_amount)} strong />
      {d.transaction_fee > 0 ? <Leaf label="Withheld · transaction fee" value={`− ${money(d.transaction_fee)}`} tone="warning" /> : null}
      {d.cancellation_charge > 0 ? <Leaf label="Withheld · cancellation / late charge" value={`− ${money(d.cancellation_charge)}`} tone="warning" /> : null}
      {d.other_charges > 0 ? <Leaf label="Withheld · other charge" value={`− ${money(d.other_charges)}`} tone="warning" /> : null}
      <Leaf label="Refund amount" value={money(refund.amount)} strong tone={tone} />

      <Leaf label="Initiated" value={when(refund.initiated_at)} />
      <Leaf
        label="Reviewed"
        value={when(refund.reviewed_at) ?? "Not reviewed yet"}
        sub={[refund.reviewed_by?.full_name && `by ${refund.reviewed_by.full_name}`, refund.review_note]
          .filter(Boolean).join(" · ") || undefined}
      />
      <Leaf
        label="Approved"
        value={when(refund.approved_at) ?? "—"}
        sub={refund.approved_by ? `by ${refund.approved_by.full_name}` : undefined}
        tone={refund.approved_at ? "success" : undefined}
      />
      {refund.rejected_at ? (
        <Leaf
          label="Rejected"
          value={when(refund.rejected_at)}
          sub={[refund.rejected_by?.full_name && `by ${refund.rejected_by.full_name}`, refund.rejection_reason]
            .filter(Boolean).join(" · ") || undefined}
          tone="danger"
        />
      ) : null}
      <Leaf
        label={`Payout attempts: ${refund.attempt_count}`}
        value={when(refund.last_attempted_at) ?? "Not attempted"}
        sub={refund.failure_reason ?? undefined}
        tone={refund.failure_reason ? "danger" : undefined}
      />
      <Leaf label="Paid out" value={when(refund.processed_at) ?? "—"} tone={refund.processed_at ? "success" : undefined} />
      <Leaf label="Refund reference" value={refund.gateway_refund_id ?? "—"} mono />
      <Leaf label="Original payment" value={refund.source_gateway_payment_id ?? "—"} mono />
      <Leaf label="Refund ID" value={refund.id} mono last />
    </Branch>
  );
}

function EventLog({ events }: { events: JourneyTimelineEvent[] }) {
  if (events.length === 0) return <Leaf label="Nothing recorded yet" last />;
  return (
    <>
      {events.map((e, i) => (
        <Leaf
          key={`${e.at}-${i}`}
          label={e.title}
          sub={`${formatFullDateTime(e.at)}${e.detail ? ` · ${e.detail}` : ""}`}
          tone={e.tone}
          last={i === events.length - 1}
        />
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// The popup
// ---------------------------------------------------------------------------

export function DepositJourneyBody({ journey: j }: { journey: DepositJourney }) {
  const { deposit, totals, subscription: sub, rider } = j;

  const paymentsDone = j.payments.length > 0;
  const heldDone = deposit.status !== "pending";
  const firstRental = j.rentals[0];
  const rentalState: StageState = !firstRental ? "todo"
    : j.rentals.every((r) => r.returned_at) ? "done" : "active";
  const damageTotal = totals.damage_total;
  const outcomeState: StageState = deposit.status === "forfeited" ? "bad"
    : deposit.status === "released" ? "done"
      : deposit.refund_eligibility === "eligible" ? "active" : "todo";
  const latestRefund = j.refunds[j.refunds.length - 1];
  const refundState: StageState = !latestRefund ? "todo"
    : latestRefund.status === "succeeded" ? "done"
      : latestRefund.status === "failed" || latestRefund.status === "rejected" ? "bad" : "active";

  const paidByTxn = new Map(j.payments.map((p) => [p.transaction_id, p.amount]));

  return (
    <div className="space-y-5">
      {/* Root */}
      <div className="rounded-xl border border-border bg-gradient-to-br from-primary/5 to-transparent p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-lg font-semibold leading-tight">{rider?.full_name ?? "Unknown rider"}</p>
            <p className="text-xs text-muted-foreground">
              {[rider?.phone, rider?.email].filter(Boolean).join(" · ") || "—"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {[sub.vehicle_model_name, sub.plan_name, sub.hub_name].filter(Boolean).join(" · ") || "—"}
            </p>
            <p className="mt-0.5 text-xs">
              <span className="text-muted-foreground">Vehicle no. </span>
              <span className="font-mono font-medium">{vehicleNumbers(j) ?? "Not assigned"}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={deposit.status} />
            <span className="rounded-full border border-border px-2 py-0.5 text-[0.625rem] uppercase tracking-wide text-muted-foreground">
              Agreement {sub.status}
            </span>
          </div>
        </div>
        <p className="mt-3 flex items-start gap-2 text-sm">
          <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          {journeyHeadline(j)}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Paid" value={money(totals.collected || totals.deposit_amount + totals.onboarding_charge)} />
        <Stat label="Deposit" value={money(totals.deposit_amount)} />
        <Stat label="Onboarding" value={money(totals.onboarding_charge)} tone="muted" />
        <Stat label="Damage" value={money(damageTotal)} tone={damageTotal > 0 ? "bad" : "muted"} />
        <Stat label="Refunded" value={money(totals.refunded)} tone={totals.refunded > 0 ? "good" : "muted"} />
        <Stat label="In progress" value={money(totals.refund_in_flight)} tone="muted" />
      </div>

      {/* The tree */}
      <ol className="relative">
        <Stage
          n={1} icon={Banknote} title="Payment received"
          state={paymentsDone ? "done" : "todo"}
          summary={paymentsDone ? money(totals.collected) : undefined}
          when={j.payments[0] ? when(j.payments[0].captured_at) : null}
        >
          {j.payments.map((p, i) => (
            <Branch
              key={p.transaction_id}
              title={`${money(p.amount)} · ${(p.method ?? "—").toUpperCase()}`}
              right={<span className="text-xs text-muted-foreground">{when(p.captured_at)}</span>}
            >
              <Leaf label="Payment ID" value={p.gateway_payment_id} mono />
              <Leaf label="Order ID" value={p.gateway_order_id ?? "—"} mono />
              <Leaf label="Gateway" value={<span className="capitalize">{p.gateway}</span>} />
              {p.invoices.map((inv, k) => (
                <Leaf
                  key={inv.invoice_id}
                  label={`Paid ${inv.invoice_number}`}
                  sub={inv.purpose.replace(/_/g, " ")}
                  value={money(inv.allocated_amount)}
                  last={i === j.payments.length - 1 && k === p.invoices.length - 1}
                />
              ))}
            </Branch>
          ))}
        </Stage>

        <Stage
          n={2} icon={ShieldCheck} title="Security deposit held"
          state={heldDone ? "done" : "todo"}
          summary={money(deposit.amount)}
          when={when(deposit.held_at)}
        >
          <Leaf label="Deposit amount" value={money(deposit.amount)} strong />
          <Leaf label="Onboarding charge" sub="Non-refundable, collected alongside" value={money(deposit.onboarding_charge_amount)} />
          <Leaf label="Refundable by plan" value={deposit.is_refundable ? "Yes" : "No — forfeited on return"} />
          <Leaf
            label="Minimum rental days"
            value={deposit.min_rental_days_required > 0
              ? `${deposit.rental_days_completed} of ${deposit.min_rental_days_required} done`
              : `${deposit.rental_days_completed} done · no minimum`}
          />
          <Leaf label="Plan" value={`${sub.plan_name ?? "—"}${sub.duration_days ? ` · ${sub.duration_days} days` : ""}`} />
          <Leaf label="Plan price" value={money(sub.plan_price)} />
          <Leaf label="Agreement started" value={sub.started_on ? formatDate(sub.started_on) : "—"} last />
        </Stage>

        <Stage
          n={3} icon={Bike} title="Rental & return"
          state={rentalState}
          when={firstRental ? when(firstRental.picked_up_at) : null}
          summary={firstRental && !firstRental.returned_at ? "Riding" : undefined}
        >
          {j.rentals.length === 0
            ? <Leaf label="The scooter was never picked up" last />
            : j.rentals.map((r, i) => <RentalBranch key={r.id} rental={r} index={i} total={j.rentals.length} />)}
        </Stage>

        <Stage
          n={4} icon={Wrench} title="Damage"
          state={j.damages.length > 0 ? "active" : "done"}
          summary={damageTotal > 0 ? `− ${money(damageTotal)}` : undefined}
        >
          {j.damages.length === 0
            ? <Leaf label="No damage recorded" tone="success" last />
            : j.damages.map((d, i) => (
              <Leaf
                key={d.id}
                label={money(d.amount)}
                sub={[when(d.created_at), d.notes].filter(Boolean).join(" · ")}
                value={<span className="capitalize">{d.status}</span>}
                tone={d.status === "waived" ? "muted" : "warning"}
                last={i === j.damages.length - 1}
              />
            ))}
        </Stage>

        <Stage
          n={5} icon={Clock} title="Deposit outcome"
          state={outcomeState}
          when={when(deposit.refunded_at ?? deposit.forfeited_at)}
          summary={deposit.status === "forfeited" ? `Kept ${money(deposit.amount)}` : undefined}
        >
          <Leaf label="Deposit status" value={<span className="capitalize">{deposit.status}</span>} />
          <Leaf label="Refund eligible from" value={deposit.refund_eligible_at ? formatDate(deposit.refund_eligible_at) : "—"} />
          <Leaf label="Refundable after deductions" value={money(deposit.refundable_amount)} />
          {deposit.forfeited_at ? (
            <Leaf label="Forfeited" value={when(deposit.forfeited_at)} sub={deposit.forfeit_reason} tone="danger" />
          ) : null}
          <Leaf label="Released" value={when(deposit.refunded_at) ?? "—"} tone={deposit.refunded_at ? "success" : undefined} last />
        </Stage>

        <Stage
          n={6} icon={Landmark} title="Refund"
          state={refundState}
          summary={latestRefund ? money(latestRefund.amount) : undefined}
          when={latestRefund ? when(latestRefund.processed_at ?? latestRefund.initiated_at) : null}
        >
          {j.refunds.length === 0
            ? <Leaf label="No refund raised yet" last />
            : j.refunds.map((r) => (
              <RefundBranch key={r.id} refund={r} paid={paidByTxn.get(r.payment_transaction_id) ?? null} />
            ))}
        </Stage>

        <Stage
          n={7} icon={ClipboardCheck} title="Everything in order"
          state="todo" defaultOpen={false}
          summary={`${j.timeline.length} events`}
        >
          <EventLog events={j.timeline} />
        </Stage>
      </ol>

      {j.invoices.length > 0 ? (
        <details className="group rounded-xl border border-border bg-card shadow-soft">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-3 [&::-webkit-details-marker]:hidden">
            <p className="text-sm font-semibold">Invoices ({j.invoices.length})</p>
            <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
          </summary>
          <ul className="space-y-2 border-t border-border p-3">
            {j.invoices.map((i) => {
              const row = (
                <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-2.5 hover:bg-muted/40">
                  <div className="min-w-0">
                    <p className="text-[0.8125rem] font-medium">{i.invoice_number}</p>
                    <p className="text-[0.6875rem] capitalize text-muted-foreground">
                      {i.purpose.replace(/_/g, " ")} · {i.status}
                      {i.issued_on ? ` · issued ${formatDate(i.issued_on)}` : ""}
                      {i.due_on ? ` · due ${formatDate(i.due_on)}` : ""}
                    </p>
                  </div>
                  <p className="shrink-0 text-sm font-semibold">{money(i.total_amount)}</p>
                </div>
              );
              return (
                <li key={i.id}>
                  {sub.booking_id
                    ? <Link to={`/payments?bookingId=${sub.booking_id}`}>{row}</Link>
                    : row}
                </li>
              );
            })}
          </ul>
        </details>
      ) : null}

      {sub.booking_id ? (
        <div className="flex flex-wrap gap-4 border-t border-border pt-3 text-xs">
          <Link to={`/payments?bookingId=${sub.booking_id}`} className="underline">Payment history</Link>
          <Link to={`/damages?bookingId=${sub.booking_id}`} className="underline">Damage records</Link>
          <Link to="/bookings?tab=settled" className="underline">Returns &amp; settlements</Link>
        </div>
      ) : null}
    </div>
  );
}

export function DepositJourneyDialog({
  open, onClose, journey, isLoading, isError,
}: {
  open: boolean;
  onClose: () => void;
  journey: DepositJourney | undefined;
  isLoading: boolean;
  isError: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto bg-background p-5 scrollbar-thin sm:p-6">
        <DialogTitle className="mb-1 text-base font-semibold">Deposit &amp; refund journey</DialogTitle>
        <DialogDescription className="mb-4 text-xs">
          From the rider&apos;s payment to the last rupee — every date and time as recorded.
        </DialogDescription>
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : isError || !journey ? (
          <p className="flex items-center gap-2 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4" /> Couldn&apos;t load this deposit&apos;s history.
          </p>
        ) : (
          <DepositJourneyBody journey={journey} />
        )}
      </DialogContent>
    </Dialog>
  );
}


import type { ApiReturnSettlement } from '../types/api';

/** Terminal states — the return is fully settled, nothing left to pay or await. */
export function isTerminalSettlement(status: ApiReturnSettlement['status']): boolean {
  return status === 'refund_completed' || status === 'settlement_completed' || status === 'no_refund_required';
}

/**
 * Whether a return settlement is still worth surfacing — always while
 * unresolved, and for a brief confirmation window (48h) after it resolves.
 * No backend "expiry" concept; purely a client display window.
 *
 * Pure and RN-free so both the UI (SettlementCard) and journey derivation
 * (useRiderJourney) can share it without pulling in react-native.
 */
export function shouldShowSettlement(settlement: ApiReturnSettlement | null): boolean {
  if (!settlement) return false;
  if (!isTerminalSettlement(settlement.status)) return true;
  const resolvedAt = settlement.processed_at ? new Date(settlement.processed_at).getTime() : 0;
  return Date.now() - resolvedAt < 48 * 60 * 60 * 1000;
}

/**
 * A settlement the rider is being asked for money on, as opposed to one
 * paying money back. The two read as opposite states and belong on different
 * screens, so the distinction is named once here rather than re-derived as
 * `due_amount > 0 && status === 'amount_due'` at five call sites.
 */
export function isAmountDueSettlement(settlement: ApiReturnSettlement | null): boolean {
  return !!settlement && settlement.due_amount > 0 && settlement.status === 'amount_due';
}

/** A settlement that owes the rider a refund, whatever stage that refund is at. */
export function isRefundSettlement(settlement: ApiReturnSettlement | null): boolean {
  return !!settlement && settlement.refund_amount > 0 && !isAmountDueSettlement(settlement);
}

/**
 * Whether Billing should carry the refund card.
 *
 * Billing is where money the rider is owed belongs — My Scooter is about the
 * vehicle, and a refund outlives the rental that produced it. So this stays
 * true for as long as the refund is unresolved ("show it until it's
 * refunded"), and then for the same 48h confirmation window every other
 * surface uses, so the rider actually sees it turn green rather than having
 * the card vanish at the moment it succeeds.
 */
export function shouldShowRefundInBilling(settlement: ApiReturnSettlement | null): boolean {
  if (!isRefundSettlement(settlement)) return false;
  if (settlement!.status !== 'refund_completed') return true;
  return shouldShowSettlement(settlement);
}

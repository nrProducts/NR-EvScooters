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

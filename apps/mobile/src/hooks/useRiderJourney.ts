import { useAuthStore } from '../store/useAuthStore';
import { deriveRiderPhase, type RiderJourney, type RiderJourneyInput } from '../lib/riderJourney';

export type { RiderPhase, RiderJourney, RiderJourneyInput } from '../lib/riderJourney';
export { deriveRiderPhase } from '../lib/riderJourney';

/**
 * Reads the rider's profile from the auth store and returns their current
 * journey phase plus whether booking is offered. See lib/riderJourney.ts for
 * the (pure, tested) derivation.
 */
export function useRiderJourney(input: RiderJourneyInput): RiderJourney {
  const profile = useAuthStore((s) => s.profile);
  const phase = deriveRiderPhase(profile, input);
  return { phase, canBook: phase === 'ready_to_book' };
}

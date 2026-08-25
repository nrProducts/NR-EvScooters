import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, View } from 'react-native';
import { COLORS } from '../constants/theme';
import { rentalRepository } from '../services';
import { useAuthStore } from '../store/useAuthStore';
import { LateFeePaymentModal } from './LateFeePaymentModal';
import { ReturnScooterModal } from './ReturnScooterModal';
import type { ApiOverdueLateFee, ApiRental } from '../types/api';

interface ReturnGateProps {
  visible: boolean;
  rental: ApiRental;
  onClose: () => void;
  onSubmitted?: () => void;
}

/**
 * Overdue Rider → Late Fee Payment → Scooter Return.
 *
 * Both entry points that used to open ReturnScooterModal directly (home.tsx,
 * my-scooter.tsx) open THIS instead, with the same props — it decides
 * whether the rider actually gets the return form or the payment gate
 * first. The backend enforces this too (requestReturn rejects an unpaid
 * overdue return outright), so this is a UX convenience, not the real
 * security boundary — but it's what turns a rejected API call into a rider
 * actually being told what to do.
 *
 * Refetches the preview every time it opens rather than caching, so a rider
 * who paid, closed the sheet, and reopened it doesn't see a stale "pay
 * again" prompt (spec: opening/closing Return repeatedly must never ask
 * twice).
 */
export const ReturnGate: React.FC<ReturnGateProps> = ({ visible, rental, onClose, onSubmitted }) => {
  const [lateFee, setLateFee] = useState<ApiOverdueLateFee | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible) {
      setLateFee(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    rentalRepository.overdueLateFee()
      .then((result) => { if (!cancelled) setLateFee(result); })
      // Fails open: if the preview call itself fails, the rider still reaches
      // the return form — requestReturn's own backend gate is the real
      // enforcement and will reject them there if something is genuinely owed.
      .catch(() => { if (!cancelled) setLateFee({ isLate: false, daysLate: 0, feePerDay: 0, lateFee: 0, dueOn: null, isSettled: true }); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [visible]);

  if (!visible) return null;

  if (loading || !lateFee) {
    return (
      <Modal visible transparent animationType="fade">
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(15,23,42,0.45)' }}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      </Modal>
    );
  }

  if (!lateFee.isSettled) {
    return (
      <LateFeePaymentModal
        visible
        rental={rental}
        lateFee={lateFee}
        onClose={onClose}
        onPaid={() => {
          setLateFee({ ...lateFee, isSettled: true });
          // The local patch above only unblocks THIS gate's own next step
          // (revealing the return form). Elsewhere in the app — the plan
          // status badge, the "Overdue"/vehicle-lock banner on Home and
          // Billing — nothing else knows the late fee was just paid until
          // something refetches rental/profile state. onSubmitted is wired
          // to the caller's full reload (home.tsx's loadRental, my-scooter
          // .tsx's reload()) for exactly this "something changed, refresh
          // everything" purpose, not only for an actual return submission.
          void useAuthStore.getState().refreshProfile();
          onSubmitted?.();
        }}
      />
    );
  }

  return (
    <ReturnScooterModal
      visible
      rental={rental}
      onClose={onClose}
      onSubmitted={onSubmitted}
    />
  );
};

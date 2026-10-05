import React, { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Sheet } from '../components/ui/Sheet';
import { confirmAction } from '../lib/confirm';
import { useCanRent, useHasActiveBooking, useHasActiveRental } from '../store/useAuthStore';
import { COLORS } from '../constants/theme';
import { useT } from '../i18n';

/**
 * The restrictions that stand between tapping a scooter and the booking flow:
 * one live booking or rental at a time, and verified KYC. This used to live in
 * the vehicle detail screen; now that booking is entered straight from the Home
 * card and the browse list, every entry point shares it.
 *
 * Gating here is a courtesy, not a control — POST /bookings is also guarded by
 * requireKycVerified and rejects a second live booking server-side.
 */
export function useBookingGate() {
  const router = useRouter();
  const { t } = useT();
  const canRent = useCanRent();
  const hasActiveBooking = useHasActiveBooking();
  const hasActiveRental = useHasActiveRental();

  const [kycPrompt, setKycPrompt] = useState<{ modelName?: string } | null>(null);

  const alreadyBookedOrRenting = hasActiveBooking || hasActiveRental;

  const startBooking = async (modelId: string, modelName?: string) => {
    if (alreadyBookedOrRenting) {
      const goThere = await confirmAction({
        title: hasActiveRental ? t('bookingGate.alreadyRiding') : t('bookingGate.alreadyBooked'),
        message: hasActiveRental
          ? t('bookingGate.activeRentalNote')
          : t('bookingGate.activeBookingNote'),
        confirmLabel: hasActiveRental ? t('bookingGate.viewMyScooter') : t('bookingGate.viewBooking'),
        cancelLabel: t('bookingGate.notNow'),
      });
      if (goThere) router.push(hasActiveRental ? '/my-scooter' : '/home');
      return;
    }
    if (!canRent) {
      setKycPrompt({ modelName });
      return;
    }
    router.push(`/booking/${modelId}` as never);
  };

  const ctaLabel = hasActiveRental
    ? t('bookingGate.activeRental')
    : hasActiveBooking
      ? t('bookingGate.bookingPending')
      : !canRent
        ? t('bookingGate.completeKycToBook')
        : t('bookingGate.bookNow');

  /** Render this once inside any component that calls startBooking. */
  const kycModal = (
    <Sheet
      visible={kycPrompt !== null}
      onClose={() => setKycPrompt(null)}
      title={t('bookingGate.completeKycFirst')}
    >
      <View className="px-6 pt-3">
        <Text style={{ color: COLORS.textSecondary }} className="text-sm font-medium leading-relaxed mb-6">
          {t('bookingGate.kycNeeded', { scooter: kycPrompt?.modelName ?? t('bookingGate.thisScooter') })}
        </Text>
        <TouchableOpacity
          onPress={() => { setKycPrompt(null); router.push('/kyc'); }}
          accessibilityRole="button"
          className="py-4 rounded-2xl items-center"
          style={{ backgroundColor: COLORS.primary }}
        >
          <Text className="text-white text-sm font-bold">{t('bookingGate.completeKyc')}</Text>
        </TouchableOpacity>
      </View>
    </Sheet>
  );

  return { startBooking, canRent, alreadyBookedOrRenting, ctaLabel, kycModal };
}

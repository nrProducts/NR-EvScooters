import React, { useState } from 'react';
import { Alert, Modal, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { X } from 'lucide-react-native';
import { useCanRent, useHasActiveBooking, useHasActiveRental } from '../store/useAuthStore';
import { COLORS } from '../constants/theme';

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
  const insets = useSafeAreaInsets();
  const canRent = useCanRent();
  const hasActiveBooking = useHasActiveBooking();
  const hasActiveRental = useHasActiveRental();

  const [kycPrompt, setKycPrompt] = useState<{ modelName?: string } | null>(null);

  const alreadyBookedOrRenting = hasActiveBooking || hasActiveRental;

  const startBooking = (modelId: string, modelName?: string) => {
    if (alreadyBookedOrRenting) {
      Alert.alert(
        hasActiveRental ? "You're already on a ride" : 'You already have a booking',
        hasActiveRental
          ? 'You have an active rental. Return your scooter before booking another one.'
          : 'You already have a scooter booked and awaiting pickup.',
        [
          { text: 'Not now', style: 'cancel' },
          {
            text: hasActiveRental ? 'View My Scooter' : 'View Booking',
            onPress: () => router.push(hasActiveRental ? '/my-scooter' : '/home'),
          },
        ],
      );
      return;
    }
    if (!canRent) {
      setKycPrompt({ modelName });
      return;
    }
    router.push(`/booking/${modelId}` as never);
  };

  const ctaLabel = hasActiveRental
    ? 'Active Rental'
    : hasActiveBooking
      ? 'Booking Pending'
      : !canRent
        ? 'Complete KYC to Book'
        : 'Book Now';

  /** Render this once inside any component that calls startBooking. */
  const kycModal = (
    <Modal
      visible={kycPrompt !== null}
      transparent
      animationType="slide"
      onRequestClose={() => setKycPrompt(null)}
    >
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,0.45)' }}>
        <View
          style={{
            backgroundColor: COLORS.card,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            padding: 24,
            paddingBottom: 16 + insets.bottom,
          }}
        >
          <View className="flex-row justify-between items-center mb-4">
            <Text style={{ color: COLORS.textPrimary }} className="text-lg font-black">
              Complete Your KYC First
            </Text>
            <TouchableOpacity
              onPress={() => setKycPrompt(null)}
              accessibilityRole="button"
              accessibilityLabel="Close"
              className="w-8 h-8 rounded-full items-center justify-center"
              style={{ backgroundColor: COLORS.background }}
            >
              <X size={16} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>
          <Text style={{ color: COLORS.textSecondary }} className="text-sm font-medium leading-relaxed mb-6">
            You need a verified KYC before you can book a scooter. It only takes a few minutes — once
            approved, you&apos;ll be able to book {kycPrompt?.modelName ?? 'this scooter'} right away.
          </Text>
          <TouchableOpacity
            onPress={() => { setKycPrompt(null); router.push('/kyc'); }}
            accessibilityRole="button"
            className="py-4 rounded-2xl items-center"
            style={{ backgroundColor: COLORS.primary }}
          >
            <Text className="text-white text-sm font-bold">Complete KYC</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  return { startBooking, canRent, alreadyBookedOrRenting, ctaLabel, kycModal };
}

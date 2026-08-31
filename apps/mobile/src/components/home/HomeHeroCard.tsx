import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { ArrowRight, ShieldCheck } from 'lucide-react-native';
import { useBookingGate } from '../../hooks/useBookingGate';
import { COLORS } from '../../constants/theme';
import type { RiderPhase } from '../../hooks/useRiderJourney';

const SNG_LOGO = require('../../../assets/images/logo-lockup.png') as number;

interface HomeHeroCardProps {
  phase: RiderPhase;
  /** The scooter a "Book" tap should open. Null → the browse screen. */
  featured: { id: string; name: string } | null;
}

/**
 * The top marketing card on Home. Its copy and call-to-action follow the
 * rider's journey phase: pitch + Book for a verified rider, a KYC nudge for a
 * new one. Kept short — the detailed scooter card sits below.
 */
export const HomeHeroCard: React.FC<HomeHeroCardProps> = ({ phase, featured }) => {
  const router = useRouter();
  const { startBooking, kycModal } = useBookingGate();

  const copy = HERO_COPY[phase] ?? HERO_COPY.ready_to_book;

  const onPress = () => {
    if (phase === 'kyc_required') {
      router.push('/kyc');
      return;
    }
    if (phase === 'kyc_in_review') return;
    if (featured) {
      void startBooking(featured.id, featured.name);
    } else {
      router.push('/browse-vehicles');
    }
  };

  const disabled = phase === 'kyc_in_review';

  return (
    <View
      className="rounded-3xl overflow-hidden mb-5"
      style={{
        backgroundColor: COLORS.primary + '14',
        borderWidth: 1,
        borderColor: COLORS.primary + '26',
      }}
    >
      <View className="flex-row items-center">
        <View className="flex-1 p-5 pr-2">
          <Text style={{ color: COLORS.primaryPressed }} className="text-lg font-black leading-tight">
            {copy.heading}
          </Text>
          <Text style={{ color: COLORS.textSecondary }} className="text-xs font-medium mt-1.5 leading-relaxed">
            {copy.body}
          </Text>

          <TouchableOpacity
            onPress={onPress}
            disabled={disabled}
            accessibilityRole="button"
            activeOpacity={0.85}
            className="self-start flex-row items-center rounded-2xl px-4 py-2.5 mt-4"
            style={{ backgroundColor: disabled ? COLORS.primary + '66' : COLORS.primary }}
          >
            {phase === 'kyc_required' || phase === 'kyc_in_review' ? (
              <ShieldCheck size={14} color="#FFF" />
            ) : null}
            <Text className="text-white text-xs font-bold mr-1.5" style={{ marginLeft: phase.startsWith('kyc') ? 6 : 0 }}>
              {copy.cta}
            </Text>
            {!disabled ? <ArrowRight size={14} color="#FFF" /> : null}
          </TouchableOpacity>
        </View>

        <Image
          source={SNG_LOGO}
          accessibilityLabel="SwapNgo"
          contentFit="contain"
          style={{ width: 104, height: 104, marginRight: 12 }}
        />
      </View>

      {kycModal}
    </View>
  );
};

const HERO_COPY: Record<string, { heading: string; body: string; cta: string }> = {
  kyc_required: {
    heading: 'One step to your first ride',
    body: 'Complete your KYC to unlock unlimited-km EV scooter rentals.',
    cta: 'Complete KYC',
  },
  kyc_in_review: {
    heading: "You're almost there",
    body: 'Your KYC is under review. Rentals unlock as soon as it is approved.',
    cta: 'KYC under review',
  },
  ready_to_book: {
    heading: 'Go Green. Go Unlimited.',
    body: 'Unlimited kilometres on your EV scooter, one simple weekly plan.',
    cta: 'Book a Scooter',
  },
  rental_completed: {
    heading: 'Ready for your next ride?',
    body: 'Pick a plan and get back on an EV scooter in minutes.',
    cta: 'Book a Scooter',
  },
};

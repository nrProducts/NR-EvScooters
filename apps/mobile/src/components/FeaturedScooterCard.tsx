import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { BatteryFull, Gauge, Zap, Cpu } from 'lucide-react-native';
import { Badge } from './ui/Badge';
import { SpecRow } from './SpecRow';
import { VehicleStage } from './VehicleStage';
import { useBookingGate } from '../hooks/useBookingGate';
import { COLORS } from '../constants/theme';
import type { ApiVehicleModelDetail } from '../types/api';

interface FeaturedScooterCardProps {
  model: ApiVehicleModelDetail;
}

/**
 * Premium hero card for the Home screen's single featured scooter. Since the
 * vehicle detail screen was removed, this card is the full pitch: artwork,
 * specification block and the only route into booking.
 */
export const FeaturedScooterCard: React.FC<FeaturedScooterCardProps> = ({ model }) => {
  const { startBooking, canRent, alreadyBookedOrRenting, ctaLabel, kycModal } = useBookingGate();

  return (
    <View
      className="rounded-3xl overflow-hidden mb-5 border"
      style={{
        backgroundColor: COLORS.card,
        borderColor: COLORS.border,
        shadowColor: COLORS.black,
        shadowOpacity: 0.06,
        shadowRadius: 20,
        shadowOffset: { width: 0, height: 6 },
        elevation: 3,
      }}
    >
      <VehicleStage
        imageUrl={model.image_url}
        height={220}
        imageWidth="100%"
        accessibilityLabel={model.name}
      />

      <View className="p-5">
        <View className="flex-row items-center justify-between mb-1">
          <Badge label="Featured" tone="primary" />
          <Badge
            label={model.availability.status === 'available' ? 'Available' : 'Unavailable'}
            tone={model.availability.status === 'available' ? 'success' : 'danger'}
          />
        </View>

        <Text style={{ color: COLORS.textPrimary }} className="text-xl font-black mt-2">{model.name}</Text>
        {model.vendor ? (
          <Text style={{ color: COLORS.textSecondary }} className="text-xs font-semibold mt-0.5">{model.vendor.name}</Text>
        ) : null}
        {model.tagline ? (
          <Text style={{ color: COLORS.textSecondary }} className="text-xs font-medium mt-2 leading-relaxed">
            {model.tagline}
          </Text>
        ) : null}

        <Text style={{ color: COLORS.textPrimary }} className="text-sm font-extrabold mt-5 mb-3">
          Specifications
        </Text>
        <View
          className="rounded-2xl p-4 border flex-row flex-wrap"
          style={{ backgroundColor: COLORS.background, borderColor: COLORS.border, gap: 16 }}
        >
          {model.battery_range_km != null && (
            <SpecRow icon={BatteryFull} label="Range" value={`${model.battery_range_km} km`} />
          )}
          {model.top_speed_kmph != null && (
            <SpecRow icon={Gauge} label="Top Speed" value={`${model.top_speed_kmph} km/h`} />
          )}
          {model.charging_time_hours != null && (
            <SpecRow icon={Zap} label="Charging Time" value={`${model.charging_time_hours} hrs`} />
          )}
          {model.motor_power_watts != null && (
            <SpecRow icon={Cpu} label="Motor Power" value={`${model.motor_power_watts} W`} />
          )}
          {model.battery_capacity ? (
            <SpecRow icon={BatteryFull} label="Battery" value={model.battery_capacity} />
          ) : null}
        </View>

        {model.starting_price != null ? (
          <Text style={{ color: COLORS.primaryPressed }} className="text-sm font-extrabold mt-4">
            From ₹{model.starting_price.toFixed(0)} / day
          </Text>
        ) : null}

        <TouchableOpacity
          onPress={() => void startBooking(model.id, model.name)}
          disabled={alreadyBookedOrRenting}
          accessibilityRole="button"
          className="py-3.5 rounded-2xl items-center mt-4"
          style={{ backgroundColor: COLORS.primary, opacity: alreadyBookedOrRenting || !canRent ? 0.5 : 1 }}
        >
          <Text className="text-white text-sm font-bold">{ctaLabel}</Text>
        </TouchableOpacity>
      </View>

      {kycModal}
    </View>
  );
};

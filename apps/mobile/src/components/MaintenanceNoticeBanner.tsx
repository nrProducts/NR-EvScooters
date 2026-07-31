import React from 'react';
import { View, Text } from 'react-native';
import { Wrench, Clock } from 'lucide-react-native';
import { COLORS } from '../constants/theme';
import { SimplifiedVehicleCard } from './SimplifiedVehicleCard';
import type { ApiMaintenanceNotice } from '../types/api';

function formatEta(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
}

/**
 * Additive Home-screen banner for a rider currently displaced by their own
 * vehicle's maintenance. Disappears the moment the backing ticket resolves —
 * maintenance.service.ts's getMyMaintenanceNotice only returns a ticket while
 * it's still open, so this never shows raw historical assignment data.
 */
export const MaintenanceNoticeBanner: React.FC<{ notice: ApiMaintenanceNotice | null }> = ({ notice }) => {
  if (!notice) return null;

  if (notice.stage === 'pending_triage') {
    return (
      <View
        className="rounded-2xl p-4 mb-4 flex-row items-center"
        style={{ backgroundColor: COLORS.textSecondary + '14', borderWidth: 1, borderColor: COLORS.border }}
      >
        <Wrench size={16} color={COLORS.textSecondary} />
        <Text style={{ color: COLORS.textPrimary }} className="text-xs font-bold ml-2 flex-1">
          Your scooter is being inspected. We'll update you shortly.
        </Text>
      </View>
    );
  }

  if (notice.stage === 'quick_fix') {
    return (
      <View
        className="rounded-2xl p-4 mb-4"
        style={{ backgroundColor: COLORS.warning + '14', borderWidth: 1, borderColor: COLORS.warning + '33' }}
      >
        <View className="flex-row items-center">
          <Clock size={16} color={COLORS.warning} />
          <Text style={{ color: COLORS.textPrimary }} className="text-sm font-extrabold ml-2">
            Your Scooter Is Being Repaired
          </Text>
        </View>
        {notice.expected_ready_at ? (
          <Text style={{ color: COLORS.textSecondary }} className="text-xs font-semibold mt-1.5">
            Expected ready by {formatEta(notice.expected_ready_at)}.
          </Text>
        ) : null}
      </View>
    );
  }

  // stage === 'temp_vehicle'
  return (
    <View
      className="rounded-2xl p-4 mb-4"
      style={{ backgroundColor: COLORS.primary + '0A', borderWidth: 1, borderColor: COLORS.primary + '33' }}
    >
      <View className="flex-row items-center">
        <Wrench size={16} color={COLORS.primary} />
        <Text style={{ color: COLORS.primaryPressed }} className="text-sm font-extrabold ml-2">
          Your Scooter Is In Maintenance
        </Text>
      </View>
      <Text style={{ color: COLORS.textSecondary }} className="text-xs font-semibold mt-1.5">
        Use this temporary vehicle until it's ready.
      </Text>
      {notice.temp_vehicle ? <SimplifiedVehicleCard vehicle={notice.temp_vehicle} /> : null}
    </View>
  );
};

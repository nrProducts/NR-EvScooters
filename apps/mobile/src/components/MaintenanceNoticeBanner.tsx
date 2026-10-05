import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Wrench, Clock, X } from 'lucide-react-native';
import { COLORS } from '../constants/theme';
import { SimplifiedVehicleCard } from './SimplifiedVehicleCard';
import { useDismissibleBanner } from '../lib/dismissedBanners';
import type { ApiMaintenanceNotice } from '../types/api';
import { useT } from '../i18n';

/** Same 14px glyph + padded hit area as SettlementCard's close. */
const CloseButton: React.FC<{ onPress: () => void; label: string }> = ({ onPress, label }) => (
  <TouchableOpacity
    onPress={onPress}
    accessibilityRole="button"
    accessibilityLabel={label}
    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
    className="-mr-1 -my-1 p-1 ml-2"
  >
    <X size={14} color={COLORS.textSecondary} />
  </TouchableOpacity>
);

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
  const { t } = useT();
  // "Being inspected" and "being repaired" are status updates — closable,
  // keyed by ticket AND stage so the next stage still shows. The temp-vehicle
  // stage is not: it is the only place Home tells a displaced rider which
  // scooter to ride, so it stays for as long as the ticket is open.
  const closable = notice && notice.stage !== 'temp_vehicle';
  const [dismissed, dismiss] = useDismissibleBanner(
    closable ? `maintenance:${notice.ticket_id}:${notice.stage}` : null,
  );

  if (!notice) return null;
  if (closable && dismissed) return null;

  if (notice.stage === 'pending_triage') {
    return (
      <View
        className="rounded-2xl p-4 mb-4 flex-row items-center"
        style={{ backgroundColor: COLORS.textSecondary + '14', borderWidth: 1, borderColor: COLORS.border }}
      >
        <Wrench size={16} color={COLORS.textSecondary} />
        <Text style={{ color: COLORS.textPrimary }} className="text-xs font-bold ml-2 flex-1">
          {t('maintenance.inspecting')}
        </Text>
        <CloseButton onPress={dismiss} label={t('ui.dismiss')} />
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
          <Text style={{ color: COLORS.textPrimary }} className="text-sm font-extrabold ml-2 flex-1">
            {t('maintenance.beingRepaired')}
          </Text>
          <CloseButton onPress={dismiss} label={t('ui.dismiss')} />
        </View>
        {notice.expected_ready_at ? (
          <Text style={{ color: COLORS.textSecondary }} className="text-xs font-semibold mt-1.5">
            {t('maintenance.expectedReady', { time: formatEta(notice.expected_ready_at) })}
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
          {t('maintenance.inMaintenance')}
        </Text>
      </View>
      <Text style={{ color: COLORS.textSecondary }} className="text-xs font-semibold mt-1.5">
        {t('maintenance.useTempVehicle')}
      </Text>
      {notice.temp_vehicle ? <SimplifiedVehicleCard vehicle={notice.temp_vehicle} /> : null}
    </View>
  );
};

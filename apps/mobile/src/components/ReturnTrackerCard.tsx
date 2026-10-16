import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Check, PackageCheck } from 'lucide-react-native';
import { COLORS } from '../constants/theme';
import { rentalRepository } from '../services';
import type { ApiRental, ApiReturnStage } from '../types/api';
import { useT, type CopyKey } from '../i18n';

interface ReturnTrackerCardProps {
  rental: ApiRental;
}

const STEP_KEYS: CopyKey[] = [
  'returnTracker.step.requested',
  'returnTracker.step.inspection',
  'returnTracker.step.settlement',
  'returnTracker.step.completed',
];

/**
 * Which step the return is on — the index of the FIRST step not yet done.
 * Derived from the API's stage (the same one the Return Status card reads), so
 * the two can never disagree about where a return is.
 *
 *   0 requested   done as soon as the rider asks
 *   1 inspection  staff check the scooter and stage any charges
 *   2 settlement  an additional amount is paid / verified
 *   3 completed   staff approve the return
 */
function currentStep(stage: ApiReturnStage | null): number {
  switch (stage?.status) {
    case 'payment_required':
    case 'payment_submitted':
      return 2;
    case 'ready_for_approval':
      return 3;
    case 'return_completed':
      return 4;
    case 'return_requested':
    default:
      return 1;
  }
}

/**
 * A compact "where is my return" tracker for Home, shown once the rider has
 * submitted a return and until it is completed.
 *
 * The rental stays active while staff confirm the handover, so without this
 * Home looked as if nothing had happened after tapping Return. This is the
 * small, always-visible answer: submitted, and which step is next.
 */
export const ReturnTrackerCard: React.FC<ReturnTrackerCardProps> = ({ rental }) => {
  const { t } = useT();
  const [stage, setStage] = useState<ApiReturnStage | null>(null);

  const load = useCallback(() => {
    void rentalRepository.returnStage().then(setStage).catch(() => {
      // Non-critical: the tracker still shows "requested" without it.
    });
  }, []);

  useEffect(load, [load]);
  const loadRef = useRef(load);
  loadRef.current = load;
  useFocusEffect(useCallback(() => { loadRef.current(); }, []));

  if (!rental.return_requested_at) return null;
  if (stage?.status === 'rejected') return null;

  const step = currentStep(stage);
  if (step >= STEP_KEYS.length) return null;

  return (
    <View
      className="rounded-2xl p-4 mb-5 border"
      style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}
    >
      <View className="flex-row items-center mb-3.5">
        <View
          className="w-7 h-7 rounded-full items-center justify-center mr-2.5"
          style={{ backgroundColor: COLORS.primary + '1A' }}
        >
          <PackageCheck size={15} color={COLORS.primary} />
        </View>
        <View className="flex-1">
          <Text style={{ color: COLORS.textPrimary }} className="text-[13px] font-extrabold">
            {t('returnTracker.title')}
          </Text>
          <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium mt-0.5">
            {t('returnTracker.subtitle')}
          </Text>
        </View>
      </View>

      <View className="flex-row items-start">
        {STEP_KEYS.map((key, i) => {
          const done = i < step;
          const current = i === step;
          const tint = done || current ? COLORS.primary : COLORS.border;
          return (
            <View key={key} className="flex-1 items-center">
              <View className="flex-row items-center w-full">
                <View
                  className="flex-1 h-0.5"
                  style={{ backgroundColor: i === 0 ? 'transparent' : (done || current ? COLORS.primary : COLORS.border) }}
                />
                <View
                  className="w-5 h-5 rounded-full items-center justify-center"
                  style={{
                    backgroundColor: done ? COLORS.primary : COLORS.card,
                    borderWidth: 2,
                    borderColor: tint,
                  }}
                >
                  {done ? (
                    <Check size={11} color="#FFF" />
                  ) : current ? (
                    <View className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS.primary }} />
                  ) : null}
                </View>
                <View
                  className="flex-1 h-0.5"
                  style={{
                    backgroundColor: i === STEP_KEYS.length - 1 ? 'transparent' : (done ? COLORS.primary : COLORS.border),
                  }}
                />
              </View>
              <Text
                style={{ color: done || current ? COLORS.textPrimary : COLORS.textSecondary }}
                className={`text-[10px] mt-1.5 text-center ${current ? 'font-extrabold' : 'font-semibold'}`}
                numberOfLines={2}
              >
                {t(key)}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
};

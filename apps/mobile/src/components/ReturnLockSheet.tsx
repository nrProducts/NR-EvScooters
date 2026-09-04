import React, { useCallback, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Undo2 } from 'lucide-react-native';
import { Sheet } from './ui/Sheet';
import { COLORS } from '../constants/theme';
import {
  RETURN_LOCK_BLOCKED_HINT, RETURN_LOCK_BODY, RETURN_LOCK_SUPPORT_HINT, RETURN_LOCK_TITLE,
} from '../lib/returnLock';

/** 'blocked' has no way through; 'warn' explains, then lets the rider continue. */
export type ReturnLockIntent = 'blocked' | 'warn';

/**
 * Bundles the lock state, the guard and the sheet, so a screen wires this up
 * in two lines and every locked control behaves identically.
 *
 *   const lock = useReturnLock(isReturnLocked(rental));
 *   <Button onPress={() => lock.run(() => router.push('/support'), 'warn')} />
 *   {lock.sheet}
 *
 * `run` is a pass-through when nothing is locked, which is what keeps call
 * sites from sprouting their own `locked ? … : …` branches — the ONE decision
 * lives in isReturnLocked and everything else just asks to run an action.
 */
export function useReturnLock(locked: boolean) {
  const [intent, setIntent] = useState<ReturnLockIntent | null>(null);
  const [pending, setPending] = useState<(() => void) | null>(null);

  const run = useCallback((action: () => void, mode: ReturnLockIntent = 'blocked') => {
    if (!locked) {
      action();
      return;
    }
    setIntent(mode);
    // Stored in a ref-like state setter form: a bare setPending(action) would
    // CALL action, because React treats a function argument as an updater.
    setPending(() => action);
  }, [locked]);

  const close = useCallback(() => {
    setIntent(null);
    setPending(null);
  }, []);

  const sheet = (
    <ReturnLockSheet
      visible={intent !== null}
      intent={intent ?? 'blocked'}
      onClose={close}
      onContinue={intent === 'warn' && pending
        ? () => { const go = pending; close(); go(); }
        : undefined}
    />
  );

  return { locked, run, sheet };
}

interface ReturnLockSheetProps {
  visible: boolean;
  intent: ReturnLockIntent;
  onClose: () => void;
  /** Present only for 'warn' — the action the rider may still carry on to. */
  onContinue?: () => void;
}

export const ReturnLockSheet: React.FC<ReturnLockSheetProps> = ({
  visible, intent, onClose, onContinue,
}) => (
  <Sheet visible={visible} onClose={onClose} title={RETURN_LOCK_TITLE}>
    <View className="px-6 pt-1">
      <View
        className="rounded-2xl p-3.5 mb-4 flex-row"
        style={{ backgroundColor: COLORS.warning + '14', borderWidth: 1, borderColor: COLORS.warning + '33' }}
      >
        <Undo2 size={15} color={COLORS.warning} />
        <Text
          style={{ color: COLORS.textSecondary }}
          className="text-[11px] font-medium leading-relaxed flex-1 ml-2.5"
        >
          {RETURN_LOCK_BODY}
        </Text>
      </View>

      <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium leading-relaxed mb-4">
        {intent === 'warn' ? RETURN_LOCK_SUPPORT_HINT : RETURN_LOCK_BLOCKED_HINT}
      </Text>

      {onContinue ? (
        <View className="flex-row" style={{ gap: 8 }}>
          <TouchableOpacity
            onPress={onClose}
            accessibilityRole="button"
            className="flex-1 py-3.5 rounded-2xl items-center border"
            style={{ borderColor: COLORS.border }}
          >
            <Text style={{ color: COLORS.textPrimary }} className="text-xs font-bold">Not now</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onContinue}
            accessibilityRole="button"
            className="flex-1 py-3.5 rounded-2xl items-center"
            style={{ backgroundColor: COLORS.primary }}
          >
            <Text className="text-white text-xs font-bold">Continue to support</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          onPress={onClose}
          accessibilityRole="button"
          className="py-3.5 rounded-2xl items-center"
          style={{ backgroundColor: COLORS.primary }}
        >
          <Text className="text-white text-xs font-bold">Got it</Text>
        </TouchableOpacity>
      )}
    </View>
  </Sheet>
);

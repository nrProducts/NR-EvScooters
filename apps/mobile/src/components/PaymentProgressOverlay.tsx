import React, { useEffect } from 'react';
import { BackHandler, StyleSheet, Text, View } from 'react-native';
import { AlertTriangle } from 'lucide-react-native';
import { Spinner } from './Spinner';
import { COLORS } from '../constants/theme';
import { usePaymentProgressStore } from '../store/usePaymentProgressStore';
import { useT } from '../i18n';

/**
 * Full-screen "payment in progress — don't leave" cover, driven by
 * usePaymentProgressStore. Mounted once at the root, and again inside any
 * Modal that itself starts a payment (LateFeePaymentModal), since a Modal
 * draws above everything at the root.
 *
 * A plain absolutely-positioned View, deliberately not a Modal: Razorpay's
 * native sheet presents on top of whatever is showing, and a Modal of our own
 * opening or closing at that same moment can stop it from presenting on iOS.
 * Under the checkout it is simply hidden; the instant the checkout closes it
 * is already in place for the confirming step.
 */
export const PaymentProgressOverlay: React.FC = () => {
  const phase = usePaymentProgressStore((s) => s.phase);
  const { t } = useT();
  const active = phase !== null;

  // Android back would leave the screen mid-payment. Swallowed only while a
  // payment is in flight; the checkout's own screen handles back itself.
  useEffect(() => {
    if (!active) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, [active]);

  if (!phase) return null;

  return (
    <View
      style={[StyleSheet.absoluteFill, styles.scrim]}
      accessibilityViewIsModal
      accessibilityLiveRegion="polite"
    >
      <View className="w-full rounded-3xl p-6 items-center" style={{ backgroundColor: COLORS.card, maxWidth: 420 }}>
        <Spinner size={36} color={COLORS.primary} />
        <Text style={{ color: COLORS.textPrimary }} className="text-lg font-black text-center mt-4">
          {t(`payment.progress.${phase}.title`)}
        </Text>
        <Text style={{ color: COLORS.textSecondary }} className="text-sm font-medium text-center mt-2 leading-relaxed">
          {t(`payment.progress.${phase}.body`)}
        </Text>
        <View
          className="flex-row items-center rounded-2xl px-3.5 py-3 mt-5 w-full"
          style={{ backgroundColor: COLORS.warning + '14', gap: 8 }}
        >
          <AlertTriangle size={16} color={COLORS.warning} />
          <Text style={{ color: COLORS.textPrimary }} className="text-xs font-bold flex-1">
            {t('payment.progress.warning')}
          </Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  scrim: {
    backgroundColor: 'rgba(15,23,42,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
});

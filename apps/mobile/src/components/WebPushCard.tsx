import React, { useCallback, useEffect, useState } from 'react';
import { Platform, Text, TouchableOpacity, View } from 'react-native';
import { Bell, BellOff, BellRing } from 'lucide-react-native';
import { useAuthStore } from '../store/useAuthStore';
import { useT, type CopyKey } from '../i18n';
import { notifyError, notifySuccess } from '../lib/confirm';
import { ApiError } from '../lib/ApiError';
import { disableWebPush, enableWebPush, getWebPushStatus, type WebPushStatus } from '../lib/webPush';
import { Spinner } from './Spinner';

const GREEN = '#21C45D';
const GREEN_DARK = '#178A44';
const GREEN_SOFT = '#E8F8EE';
const CARD_BORDER = 'rgba(33,196,93,0.18)';
const INK = '#14221A';
const MUTED = '#5F7468';

/** The explanation shown under the title for each state that has no button. */
const STATUS_COPY: Partial<Record<WebPushStatus, CopyKey>> = {
  denied: 'webPush.status.denied',
  unsupported: 'webPush.status.unsupported',
  insecure: 'webPush.status.insecure',
  'ios-install-required': 'webPush.status.iosInstall',
  'server-disabled': 'webPush.status.serverDisabled',
};

/**
 * Browser notifications for the rider WEB app — the "Enable notifications"
 * control and its status. Renders nothing on the native app, which asks for
 * push permission through expo-notifications instead.
 *
 * Explains what the rider will get BEFORE the browser prompt, and the prompt
 * appears only when they tap the button (enableWebPush). A rider who blocked
 * notifications gets instructions, not another button: the browser will not
 * prompt again, so a button there could only fail.
 *
 * `variant="prompt"` (the notifications screen) shows only while there is
 * something the rider can do — enable, or add to Home Screen on iOS — and
 * disappears once enabled. The full status lives in Profile → Account.
 */
export function WebPushCard({ variant = 'settings' }: { variant?: 'settings' | 'prompt' } = {}) {
  const userId = useAuthStore((s) => s.profile?.id ?? null);
  const { t } = useT();
  const [status, setStatus] = useState<WebPushStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const refresh = useCallback(async () => {
    if (!userId) return;
    setStatus(await getWebPushStatus(userId));
  }, [userId]);

  useEffect(() => {
    if (Platform.OS === 'web') void refresh();
  }, [refresh]);

  if (Platform.OS !== 'web' || !userId || status === null) return null;
  if (variant === 'prompt' && status !== 'default' && status !== 'ios-install-required') return null;

  // Called straight from the press: enableWebPush's first await is the
  // browser's permission prompt, which must happen inside the user gesture.
  const enable = () => {
    setBusy(true);
    setDismissed(false);
    enableWebPush(userId)
      .then((next) => {
        setStatus(next);
        if (next === 'enabled') notifySuccess(t('webPush.enabled.title'), t('webPush.enabled.message'));
        if (next === 'default') setDismissed(true);
      })
      .catch((err) => {
        console.warn('[web-push] enabling failed', err);
        notifyError(
          t('webPush.failed.title'),
          err instanceof ApiError ? err.message : t('common.pleaseTryAgain'),
        );
        void refresh();
      })
      .finally(() => setBusy(false));
  };

  const disable = () => {
    setBusy(true);
    disableWebPush(userId)
      .catch((err) => console.warn('[web-push] disabling failed', err))
      .finally(() => {
        setBusy(false);
        void refresh();
      });
  };

  const enabled = status === 'enabled';
  const canEnable = status === 'default';
  const Icon = enabled ? BellRing : canEnable ? Bell : BellOff;
  const note = STATUS_COPY[status];

  return (
    <View
      style={{
        padding: 14, gap: 10, borderRadius: 14, backgroundColor: '#FFFFFF',
        borderWidth: 1, borderColor: CARD_BORDER,
        shadowColor: GREEN_DARK, shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 3 },
      }}
    >
      <View className="flex-row items-center" style={{ gap: 10 }}>
        <View
          className="items-center justify-center"
          style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: GREEN_SOFT }}
        >
          <Icon size={20} color={GREEN_DARK} />
        </View>
        <View className="flex-1 ml-1" style={{ gap: 2 }}>
          <Text className="font-sans" style={{ color: INK, fontSize: 13, fontWeight: '500' }}>{t('webPush.title')}</Text>
          {enabled ? (
            <Text className="font-sans" style={{ color: GREEN_DARK, fontSize: 12, lineHeight: 18 }}>
              {t('webPush.status.enabled')}
            </Text>
          ) : null}
        </View>
        {enabled ? (
          <TouchableOpacity
            onPress={disable}
            disabled={busy}
            accessibilityRole="button"
            style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: GREEN_SOFT }}
          >
            {busy ? <Spinner size={16} /> : (
              <Text className="font-sans" style={{ color: GREEN_DARK, fontSize: 12, fontWeight: '600' }}>{t('webPush.disable')}</Text>
            )}
          </TouchableOpacity>
        ) : null}
      </View>

      {!enabled ? (
        <Text className="font-sans" style={{ color: MUTED, fontSize: 12, lineHeight: 18 }}>
          {note ? t(note) : t('webPush.explainer')}
        </Text>
      ) : null}

      {canEnable && dismissed ? (
        <Text className="font-sans" style={{ color: MUTED, fontSize: 12, lineHeight: 18 }}>{t('webPush.status.dismissed')}</Text>
      ) : null}

      {canEnable ? (
        <TouchableOpacity
          onPress={enable}
          disabled={busy}
          accessibilityRole="button"
          className="flex-row items-center justify-center"
          style={{ paddingVertical: 12, borderRadius: 12, backgroundColor: GREEN, opacity: busy ? 0.7 : 1 }}
        >
          {busy ? <Spinner size={18} color="#FFFFFF" /> : (
            <Text className="font-sans" style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '600' }}>{t('webPush.enable')}</Text>
          )}
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

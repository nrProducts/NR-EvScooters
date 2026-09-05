import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { Spinner } from '../components/Spinner';
import { AppShell } from '../components/AppShell';
import { Badge } from '../components/ui/Badge';
import { FormField } from '../components/ui/FormField';
import { SkeletonList } from '../components/ui/Skeleton';
import { supportRepository } from '../services';
import { ApiError } from '../lib/ApiError';
import { notifyError } from '../lib/confirm';
import { SUPPORT_EMAIL, SUPPORT_PHONE, SUPPORT_PHONE_DISPLAY } from '../constants/support';
import { SUPPORT_STATUS_LABEL_KEY, SUPPORT_STATUS_TONE, formatDate } from '../constants/status';
import { COLORS } from '../constants/theme';
import { LifeBuoy, Mail, Phone, Send, CheckCircle2 } from 'lucide-react-native';
import type { ApiSupportRequest } from '../types/api';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useT, type CopyKey, type TranslateFn } from '../i18n';

/**
 * `labelKey` rather than a label: this is module scope, so a resolved string
 * here would be fixed at import time and would not follow a language change.
 * `desc` stays literal — a phone number and an email address are the same in
 * every language, and translating them would be a bug.
 */
const CHANNELS: { labelKey: CopyKey; desc: string; icon: typeof Phone; url: string }[] = [
  {
    labelKey: 'support.callSupport',
    desc: SUPPORT_PHONE_DISPLAY,
    icon: Phone,
    url: `tel:${SUPPORT_PHONE}`,
  },
  {
    labelKey: 'support.emailUs',
    desc: SUPPORT_EMAIL,
    icon: Mail,
    url: `mailto:${SUPPORT_EMAIL}`,
  },
];

/**
 * Takes `t` as an argument instead of calling useT(): this is a plain async
 * function outside the component, where a hook cannot be called.
 */
async function openChannel(url: string, t: TranslateFn) {
  try {
    const canOpen = await Linking.canOpenURL(url);
    if (!canOpen) {
      notifyError(t('support.error.cannotOpen.title'), t('support.error.cannotOpen.message'));
      return;
    }
    await Linking.openURL(url);
  } catch {
    notifyError(t('common.somethingWentWrong'), t('common.pleaseTryAgain'));
  }
}

export default function SupportScreen() {
  // AppShell insets its drawer sheet but not screen content, so each screen
  // pads its own scroll tail — otherwise the Android nav/gesture bar covers
  // the last rows.
  const insets = useSafeAreaInsets();
  const { t } = useT();
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ subject?: string; description?: string }>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [justSubmitted, setJustSubmitted] = useState(false);

  const [requests, setRequests] = useState<ApiSupportRequest[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(true);

  const loadRequests = () => {
    setRequestsLoading(true);
    supportRepository
      .mine({ page: 1, pageSize: 20 })
      .then((res) => setRequests(res.data))
      .catch(() => {})
      .finally(() => setRequestsLoading(false));
  };

  useEffect(loadRequests, []);

  const handleSubmit = async () => {
    const errors: { subject?: string; description?: string } = {};
    if (subject.trim().length < 3) errors.subject = t('support.error.subject');
    if (description.trim().length < 10) errors.description = t('support.error.description');
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      await supportRepository.create({ subject: subject.trim(), description: description.trim() });
      setSubject('');
      setDescription('');
      setJustSubmitted(true);
      loadRequests();
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : t('support.error.submitFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppShell title={t('support.title')}>
      <ScrollView
        className="flex-1 px-5 pt-5"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      >
        <View className="items-center mb-6">
          <View className="w-14 h-14 rounded-2xl items-center justify-center mb-3" style={{ backgroundColor: COLORS.primary + '14' }}>
            <LifeBuoy size={26} color={COLORS.primary} />
          </View>
          <Text style={{ color: COLORS.textPrimary }} className="text-lg font-black">{t('support.heading')}</Text>
          <Text style={{ color: COLORS.textSecondary }} className="text-xs font-medium mt-1 text-center px-6">
            {t('support.subheading')}
          </Text>
        </View>

        <View className="gap-3 mb-6">
          {CHANNELS.map((c) => (
            <TouchableOpacity
              key={c.labelKey}
              onPress={() => openChannel(c.url, t)}
              className="rounded-2xl p-4 border flex-row items-center"
              style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}
            >
              <View className="w-10 h-10 rounded-xl items-center justify-center mr-3" style={{ backgroundColor: COLORS.primary + '14' }}>
                <c.icon size={17} color={COLORS.primary} />
              </View>
              <View>
                <Text style={{ color: COLORS.textPrimary }} className="text-sm font-bold">{t(c.labelKey)}</Text>
                <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium mt-0.5">{c.desc}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={{ color: COLORS.textPrimary }} className="text-sm font-extrabold mb-3">{t('support.sendMessage')}</Text>

        {justSubmitted ? (
          <View
            className="rounded-2xl p-4 mb-4 items-center"
            style={{ backgroundColor: COLORS.success + '14', borderWidth: 1, borderColor: COLORS.success + '33' }}
          >
            <CheckCircle2 size={22} color={COLORS.success} />
            <Text style={{ color: COLORS.textPrimary }} className="text-xs font-extrabold mt-2">{t('support.submitted')}</Text>
            <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium text-center mt-1">
              {t('support.submittedHelp')}
            </Text>
            <TouchableOpacity onPress={() => setJustSubmitted(false)} className="mt-3">
              <Text style={{ color: COLORS.primary }} className="text-xs font-bold">{t('support.sendAnother')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View className="rounded-2xl p-4 mb-4 border" style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}>
            <FormField
              label={t('support.subject')}
              value={subject}
              onChangeText={setSubject}
              placeholder={t('support.subjectPlaceholder')}
              required
              error={fieldErrors.subject}
            />
            <FormField
              label={t('support.description')}
              value={description}
              onChangeText={setDescription}
              placeholder={t('support.descriptionPlaceholder')}
              required
              multiline
              error={fieldErrors.description}
            />
            {submitError ? (
              <Text style={{ color: COLORS.danger }} className="text-[11px] font-semibold mb-2">{submitError}</Text>
            ) : null}
            <TouchableOpacity
              onPress={handleSubmit}
              disabled={submitting}
              className="rounded-xl py-3.5 mt-1 flex-row items-center justify-center"
              style={{ backgroundColor: COLORS.primary, opacity: submitting ? 0.6 : 1 }}
            >
              {submitting ? (
                <Spinner size={16} color="#FFF" />
              ) : (
                <>
                  <Send size={15} color="#FFF" />
                  <Text className="text-white text-sm font-bold ml-2">{t('support.submitRequest')}</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        <Text style={{ color: COLORS.textPrimary }} className="text-sm font-extrabold mb-3">{t('support.yourRequests')}</Text>
        {requestsLoading ? (
          <SkeletonList count={2} />
        ) : requests.length === 0 ? (
          <Text style={{ color: COLORS.textSecondary }} className="text-xs font-medium">
            {t('support.noRequests')}
          </Text>
        ) : (
          <View className="gap-2.5">
            {requests.map((r) => (
              <View key={r.id} className="rounded-2xl p-3.5 border" style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}>
                <View className="flex-row items-center justify-between mb-1">
                  <Text style={{ color: COLORS.textPrimary }} className="text-xs font-bold flex-1 mr-2" numberOfLines={1}>
                    {r.subject}
                  </Text>
                  <Badge label={t(SUPPORT_STATUS_LABEL_KEY[r.status])} tone={SUPPORT_STATUS_TONE[r.status]} />
                </View>
                <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium">
                  {formatDate(r.created_at)}
                </Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </AppShell>
  );
}

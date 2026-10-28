import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import {
  User, Camera, Mail, Phone, ShieldCheck, ChevronRight, LogOut, LifeBuoy, Lock, HelpCircle,
  FileText, Languages, Gift,
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useAuthStore } from '../store/useAuthStore';
import { Badge } from './ui/Badge';
import { COLORS } from '../constants/theme';
import { KYC_STATUS_LABEL_KEY, KYC_STATUS_TONE } from '../constants/status';
import { pickPhoto } from '../lib/filePicker';
import { userRepository } from '../services';
import { ApiError } from '../lib/ApiError';
import { notify } from '../lib/confirm';
import { formatPhoneLocal } from '../lib/authValidation';
import { Image as ExpoImage } from 'expo-image';
import { useProfilePhoto } from '../hooks/useProfilePhoto';
import { WebPushCard } from './WebPushCard';
import { appVersion } from '../lib/appVersion';
import { useT, LANG_LABELS, LANGUAGE_SELECTION_ENABLED } from '../i18n';
import { GradientFill } from './ui/GradientFill';

/**
 * The rider's own profile — avatar/photo upload, contact details,
 * assigned-scooter/plan tiles, KYC status, and Logout. Shared by two
 * surfaces: AppShell's avatar-triggered bottom sheet (a quick-access
 * shortcut from anywhere) and the Profile tab (a real, deep-linkable
 * screen) — same content, same logic, so nothing can drift between them.
 *
 * `onClose` is only passed by the sheet; the tab screen omits it, which is
 * what turns off the sheet-only affordances (its own header/X button) below.
 *
 * `compact` is passed by the AppShell header avatar sheet: it renders the
 * rider's details only (photo, contact, plan tiles, KYC status) plus a
 * shortcut into the full Profile tab. The menu rows (KYC Verification /
 * Support / Privacy & Data) and Logout appear only on the full-page
 * Profile tab (`compact` omitted).
 */
export function ProfileContent(
  { onClose, compact = false }: { onClose?: () => void; compact?: boolean } = {},
) {
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const signOut = useAuthStore((s) => s.signOut);
  const refreshProfile = useAuthStore((s) => s.refreshProfile);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const photo = useProfilePhoto();
  const { t, lang: language } = useT();

  const changePhoto = async () => {
    const file = await pickPhoto();
    if (!file) return;
    setUploadingPhoto(true);
    try {
      await userRepository.uploadMyPhoto(file);
      await refreshProfile();
    } catch (err) {
      notify(t('profile.uploadFailed'), err instanceof ApiError ? err.message : t('common.pleaseTryAgain'));
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleLogout = () => {
    onClose?.();
    void signOut().then(() => router.replace('/'));
  };

  const goTo = (route: string) => {
    onClose?.();
    router.push(route as any);
  };

  if (!profile) return null;

  if (!compact) {
    return (
      <FullProfileLayout
        profile={profile}
        photo={photo}
        uploadingPhoto={uploadingPhoto}
        onChangePhoto={() => void changePhoto()}
        onGoTo={goTo}
        onLogout={handleLogout}
      />
    );
  }

  return (
    <View>
      <View className="items-center mb-5">
        <TouchableOpacity
          onPress={() => void changePhoto()}
          disabled={uploadingPhoto}
          accessibilityRole="button"
          accessibilityLabel={t('profile.changePhotoA11y')}
          className="mb-2.5"
        >
          <View
            className="w-16 h-16 rounded-full items-center justify-center overflow-hidden"
            style={{ backgroundColor: COLORS.primary + '1A' }}
          >
            {photo ? (
              <ExpoImage source={{ uri: photo.uri, cacheKey: photo.cacheKey }} cachePolicy="disk" style={{ width: 64, height: 64 }} contentFit="cover" transition={0} />
            ) : (
              <User size={28} color={COLORS.primary} />
            )}
          </View>
          <View
            className="absolute bottom-0 right-0 w-6 h-6 rounded-full items-center justify-center border-2"
            style={{ backgroundColor: COLORS.primary, overflow: 'hidden', borderColor: COLORS.card }}
          >
            <GradientFill />
            <Camera size={11} color="#FFF" />
          </View>
        </TouchableOpacity>
        <Text style={{ color: COLORS.textPrimary }} className="text-lg font-bold">{profile.full_name}</Text>
        <TouchableOpacity onPress={() => void changePhoto()} disabled={uploadingPhoto} accessibilityRole="button">
          <Text style={{ color: COLORS.primary }} className="text-[11px] font-bold mt-1">
            {uploadingPhoto ? t('profile.uploading') : t('profile.changePhoto')}
          </Text>
        </TouchableOpacity>
        {/* Static now that the app is rider-only. Kept as the visual
            anchor for the avatar block — the badge that actually varies
            (KYC status) sits a few rows below. */}
        <View className="flex-row items-center mt-2 px-2.5 py-1 rounded-full" style={{ backgroundColor: COLORS.secondary + '30' }}>
          <ShieldCheck size={12} color={COLORS.primary} />
          <Text style={{ color: COLORS.primaryPressed }} className="text-[10px] font-bold uppercase tracking-wider ml-1">
            {t('profile.rider')}
          </Text>
        </View>
      </View>

      <View
        className="rounded-2xl p-4 mb-3 border"
        style={{
          backgroundColor: COLORS.card, borderColor: COLORS.border,
          shadowColor: COLORS.black, shadowOpacity: 0.03, shadowRadius: 12, shadowOffset: { width: 0, height: 3 }, elevation: 1,
        }}
      >
        <View className="flex-row items-center mb-3">
          <Mail size={15} color={COLORS.textSecondary} />
          <Text style={{ color: COLORS.textPrimary }} className="text-sm font-semibold ml-2.5">{profile.email ?? '—'}</Text>
        </View>
        <View className="flex-row items-center">
          <Phone size={15} color={COLORS.textSecondary} />
          <Text style={{ color: COLORS.textPrimary }} className="text-sm font-semibold ml-2.5">{profile.phone ? formatPhoneLocal(profile.phone) : '—'}</Text>
        </View>
      </View>

      <View className="flex-row gap-3 mb-3">
        <View
          className="flex-1 rounded-2xl p-3.5 border"
          style={{
            backgroundColor: COLORS.card, borderColor: COLORS.border,
            shadowColor: COLORS.black, shadowOpacity: 0.03, shadowRadius: 12, shadowOffset: { width: 0, height: 3 }, elevation: 1,
          }}
        >
          <Text style={{ color: COLORS.textSecondary }} className="text-[10px] font-bold uppercase tracking-wider mb-1">{t('profile.assignedScooter')}</Text>
          <Text style={{ color: COLORS.textPrimary }} className="text-sm font-bold">
            {profile.assigned_vehicle ? profile.assigned_vehicle.model : t('common.none')}
          </Text>
        </View>
        <View
          className="flex-1 rounded-2xl p-3.5 border"
          style={{
            backgroundColor: COLORS.card, borderColor: COLORS.border,
            shadowColor: COLORS.black, shadowOpacity: 0.03, shadowRadius: 12, shadowOffset: { width: 0, height: 3 }, elevation: 1,
          }}
        >
          <Text style={{ color: COLORS.textSecondary }} className="text-[10px] font-bold uppercase tracking-wider mb-1">{t('profile.currentPlan')}</Text>
          <Text style={{ color: COLORS.textPrimary }} className="text-sm font-bold">
            {profile.current_plan ? profile.current_plan.name : t('common.none')}
          </Text>
        </View>
      </View>

      <View
        className="rounded-2xl p-3.5 flex-row items-center justify-between mb-3 border"
        style={{
          backgroundColor: COLORS.card, borderColor: COLORS.border,
          shadowColor: COLORS.black, shadowOpacity: 0.03, shadowRadius: 12, shadowOffset: { width: 0, height: 3 }, elevation: 1,
        }}
      >
        <Text style={{ color: COLORS.textSecondary }} className="text-xs font-bold uppercase tracking-wider">{t('profile.kycStatus')}</Text>
        <Badge label={t(KYC_STATUS_LABEL_KEY[profile.kyc_status])} tone={KYC_STATUS_TONE[profile.kyc_status]} />
      </View>

      {!profile.can_rent ? (
        <TouchableOpacity
          onPress={() => goTo('/kyc')}
          accessibilityRole="button"
          className="rounded-2xl p-3.5 flex-row items-center justify-between mb-3"
          style={{ backgroundColor: COLORS.warning + '14' }}
        >
          <Text style={{ color: COLORS.warning }} className="text-[11px] font-bold flex-1 mr-2">
            {t('profile.verifyPrompt')}
          </Text>
          <ChevronRight size={16} color={COLORS.warning} />
        </TouchableOpacity>
      ) : null}

      <TouchableOpacity
        onPress={() => goTo('/profile')}
        accessibilityRole="button"
        className="rounded-2xl p-3.5 flex-row items-center justify-between"
        style={{ backgroundColor: COLORS.primary + '14' }}
      >
        <Text style={{ color: COLORS.primary }} className="text-sm font-bold">{t('profile.viewFullProfile')}</Text>
        <ChevronRight size={16} color={COLORS.primary} />
      </TouchableOpacity>
    </View>
  );
}

/** "1.0.0 (12)", or just the version when the build number is unknown (web). */
function appVersionLabel(): string {
  const { version, build } = appVersion();
  const known = (v: string | null | undefined) => !!v && v !== '-';
  if (!known(version)) return '—';
  return known(build) ? `${version} (${build})` : version;
}

type ProfileData = NonNullable<ReturnType<typeof useAuthStore.getState>['profile']>;

interface FullProfileLayoutProps {
  profile: ProfileData;
  photo: { uri: string; cacheKey: string } | null;
  uploadingPhoto: boolean;
  onChangePhoto: () => void;
  onGoTo: (route: string) => void;
  onLogout: () => void;
}

const CARD_BORDER = COLORS.border;
const GREEN_SOFT = 'rgba(33,196,93,0.10)';

/**
 * The Profile tab: one calm page, top to bottom.
 *
 *   identity card   green banner, the rider's photo overlapping it, name,
 *                   contact line, KYC status, "Change photo"
 *   menu card       every destination as one list: KYC, language, support,
 *                   referrals, privacy, terms, how it works
 *   logout, app version
 *
 * Presentation only — every handler and value comes in unchanged.
 */
function FullProfileLayout({
  profile, photo, uploadingPhoto, onChangePhoto, onGoTo, onLogout,
}: FullProfileLayoutProps) {
  const { t, lang: language } = useT();

  const menu: Array<{ icon: LucideIcon; label: string; route: string; value?: string }> = [
    { icon: ShieldCheck, label: t('profile.menu.kyc'), route: '/kyc' },
    // The rider's own language, shown as its VALUE so someone who has landed in
    // a language they cannot read recognises this row by the endonym alone.
    // Temporarily hidden — see LANGUAGE_SELECTION_ENABLED.
    ...(LANGUAGE_SELECTION_ENABLED
      ? [{
          icon: Languages,
          label: t('settings.language'),
          value: LANG_LABELS[language],
          route: '/language?settings=1',
        }]
      : []),
    { icon: Gift, label: t('profile.menu.referrals'), route: '/referrals' },
    { icon: HelpCircle, label: t('profile.menu.howItWorks'), route: '/onboarding?replay=1' },
    { icon: LifeBuoy, label: t('profile.menu.support'), route: '/support' },
    // The rental agreement accepted at signup. Read-only here.
    { icon: FileText, label: t('profile.menu.terms'), route: '/terms' },
    // DPDPA: consent toggles, export, correction, erasure, nominee, the notice
    // and the grievance channel all live behind this one entry.
    { icon: Lock, label: t('profile.menu.privacy'), route: '/privacy' },
  ];

  const contact = [profile.phone ? formatPhoneLocal(profile.phone) : null, profile.email].filter(Boolean).join(' · ');

  return (
    <View style={{ gap: 14 }}>
      {/* Identity card */}
      <View
        style={{
          borderRadius: 24, overflow: 'hidden', backgroundColor: COLORS.card, borderWidth: 1, borderColor: CARD_BORDER,
          shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 20, shadowOffset: { width: 0, height: 6 }, elevation: 2,
        }}
      >
        <View style={{ height: 76, backgroundColor: COLORS.primary, overflow: 'hidden' }}>
          <GradientFill />
        </View>
        <View style={{ paddingHorizontal: 20, paddingBottom: 18, marginTop: -34 }}>
          <View className="flex-row items-end justify-between">
            <TouchableOpacity
              onPress={onChangePhoto}
              disabled={uploadingPhoto}
              accessibilityRole="button"
              accessibilityLabel={t('profile.changePhotoA11y')}
            >
              <View
                className="items-center justify-center"
                style={{
                  width: 68, height: 68, borderRadius: 34, backgroundColor: '#FFFFFF', borderWidth: 4, borderColor: '#FFFFFF',
                  shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 14, shadowOffset: { width: 0, height: 4 }, elevation: 4,
                }}
              >
                <View className="items-center justify-center overflow-hidden" style={{ width: '100%', height: '100%', borderRadius: 30, backgroundColor: GREEN_SOFT }}>
                  {photo ? (
                    <ExpoImage
                      source={{ uri: photo.uri, cacheKey: photo.cacheKey }}
                      cachePolicy="disk"
                      style={{ width: 60, height: 60 }}
                      contentFit="cover"
                      transition={0}
                    />
                  ) : (
                    <User size={26} color={COLORS.primary} />
                  )}
                </View>
              </View>
            </TouchableOpacity>
            <Badge label={t(KYC_STATUS_LABEL_KEY[profile.kyc_status])} tone={KYC_STATUS_TONE[profile.kyc_status]} />
          </View>

          <Text className="font-sans" style={{ color: COLORS.textPrimary, fontSize: 18, fontWeight: '700', marginTop: 10 }} numberOfLines={1}>
            {profile.full_name}
          </Text>
          <Text className="font-sans" style={{ color: COLORS.textSecondary, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
            {contact || '—'}
          </Text>

          <TouchableOpacity
            onPress={onChangePhoto}
            disabled={uploadingPhoto}
            accessibilityRole="button"
            className="flex-row items-center self-start"
            style={{ gap: 6, marginTop: 12 }}
          >
            <Camera size={14} color={COLORS.primary} />
            <Text className="font-sans" style={{ color: COLORS.primary, fontSize: 12, fontWeight: '600' }}>
              {uploadingPhoto ? t('profile.uploading') : t('profile.changePhoto')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Verification prompt, only while the rider cannot rent yet */}
      {!profile.can_rent ? (
        <TouchableOpacity
          onPress={() => onGoTo('/kyc')}
          accessibilityRole="button"
          className="flex-row items-center justify-between"
          style={{ padding: 14, borderRadius: 18, backgroundColor: COLORS.warning + '14', gap: 8 }}
        >
          <Text className="font-sans flex-1" style={{ color: COLORS.warning, fontSize: 12, fontWeight: '600' }}>
            {t('profile.verifyPrompt')}
          </Text>
          <ChevronRight size={16} color={COLORS.warning} />
        </TouchableOpacity>
      ) : null}

      {/* Rider web app only — renders nothing on the native app. */}
      <WebPushCard />

      {/* Menu: one list in one card */}
      <View
        style={{
          borderRadius: 18, overflow: 'hidden', backgroundColor: COLORS.card, borderWidth: 1, borderColor: CARD_BORDER,
          shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 12, shadowOffset: { width: 0, height: 3 },
        }}
      >
        {menu.map((item, i) => {
          const Icon = item.icon;
          return (
            <TouchableOpacity
              key={item.route}
              onPress={() => onGoTo(item.route)}
              accessibilityRole="button"
              className="flex-row items-center"
              style={{ gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: CARD_BORDER }}
            >
              <View className="items-center justify-center" style={{ width: 34, height: 34, borderRadius: 12, backgroundColor: GREEN_SOFT }}>
                <Icon size={17} color={COLORS.primaryPressed} />
              </View>
              <Text className="font-sans flex-1" style={{ color: COLORS.textPrimary, fontSize: 14, fontWeight: '500' }}>{item.label}</Text>
              {item.value ? (
                // lineHeight set explicitly: Devanagari and Tamil overflow the
                // default box at this size.
                <Text className="font-sans" style={{ color: COLORS.textSecondary, fontSize: 12, lineHeight: 18 }}>{item.value}</Text>
              ) : null}
              <ChevronRight size={16} color={COLORS.textSecondary} />
            </TouchableOpacity>
          );
        })}
      </View>

      <TouchableOpacity
        onPress={onLogout}
        accessibilityRole="button"
        className="flex-row items-center justify-center"
        style={{ padding: 14, gap: 8, borderRadius: 18, backgroundColor: COLORS.danger + '12' }}
      >
        <LogOut size={16} color={COLORS.danger} />
        <Text className="font-sans" style={{ color: COLORS.danger, fontSize: 13, fontWeight: '500' }}>{t('auth.logout')}</Text>
      </TouchableOpacity>

      <Text className="font-sans text-center" style={{ color: COLORS.textSecondary, fontSize: 11 }}>
        {t('profile.appVersionLabel')} {appVersionLabel()}
      </Text>
    </View>
  );
}

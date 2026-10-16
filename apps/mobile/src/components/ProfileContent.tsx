import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Image } from 'react-native';
import { useRouter } from 'expo-router';
import {
  User, Camera, Mail, Phone, ShieldCheck, ChevronRight, LogOut, LifeBuoy, Lock, HelpCircle,
  FileText, Languages, Gift, Bike, Zap, Settings, Smartphone,
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
import { appVersion } from '../lib/appVersion';
import { useT, LANG_LABELS, LANGUAGE_SELECTION_ENABLED } from '../i18n';

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
            style={{ backgroundColor: COLORS.primary, borderColor: COLORS.card }}
          >
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

// Figma "Job Finder" detail frame (node 1:1290), reproduced value for value.
// The only substitution is the colour: the file's one accent (the blue
// "Read More" link) becomes Swapngo green; everything else keeps the file's own
// neutrals — black text, 50% / 60% opacity labels, #f8f8f8 control, 6% borders.
const GREEN = '#21C45D';
const GREEN_DARK = '#178A44';
const GREEN_SOFT = '#E8F8EE';
const GREEN_EDGE = 'rgba(33,196,93,0.22)';
const CHIP_BG = '#FFFFFF';
const CHIP_TEXT = '#0F5E2D';
const CONTROL_BG = '#E3F4EA';
const STRIP_BG = '#FFFFFF';
const CARD_BORDER = 'rgba(33,196,93,0.18)';
const INK = '#14221A';

/**
 * The Profile tab laid out as the reference frame, top to bottom, 20 apart:
 *
 *   title + subtitle, three chips
 *   two-tab segmented control
 *   divider, then a three-up strip split by vertical rules
 *   section heading with a chevron, an explanatory line, a 2x2 card grid
 *
 * The second tab holds the account list, so every destination is still one tap
 * away. Presentation only — every handler and value comes in unchanged.
 */
function FullProfileLayout({
  profile, photo, uploadingPhoto, onChangePhoto, onGoTo, onLogout,
}: FullProfileLayoutProps) {
  const { t, lang: language } = useT();
  const [tab, setTab] = useState<'profile' | 'account'>('profile');

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
    { icon: LifeBuoy, label: t('profile.menu.support'), route: '/support' },
    { icon: Gift, label: t('profile.menu.referrals'), route: '/referrals' },
    // DPDPA: consent toggles, export, correction, erasure, nominee, the notice
    // and the grievance channel all live behind this one entry.
    { icon: Lock, label: t('profile.menu.privacy'), route: '/privacy' },
    // The rental agreement accepted at signup. Read-only here.
    { icon: FileText, label: t('profile.menu.terms'), route: '/terms' },
    { icon: HelpCircle, label: t('profile.menu.howItWorks'), route: '/onboarding?replay=1' },
  ];

  const none = t('common.none');
  const chips = [
    t('profile.rider'),
    t(KYC_STATUS_LABEL_KEY[profile.kyc_status]),
    profile.current_plan ? profile.current_plan.name : none,
  ];

  const strip: Array<{ key: string; icon: LucideIcon; value: string; label: string }> = [
    { key: 'scooter', icon: Bike, value: profile.assigned_vehicle ? profile.assigned_vehicle.model : none, label: t('profile.assignedScooter') },
    { key: 'plan', icon: Zap, value: profile.current_plan ? profile.current_plan.name : none, label: t('profile.currentPlan') },
    { key: 'lang', icon: Languages, value: LANG_LABELS[language], label: t('settings.language') },
  ];

  const cards: Array<{ key: string; icon: LucideIcon; label: string; value: string; onPress?: () => void }> = [
    { key: 'email', icon: Mail, label: t('profile.email'), value: profile.email ?? '—' },
    { key: 'phone', icon: Phone, label: t('profile.phone'), value: profile.phone ? formatPhoneLocal(profile.phone) : '—' },
    {
      key: 'kyc', icon: ShieldCheck, label: t('profile.kycStatus'),
      value: t(KYC_STATUS_LABEL_KEY[profile.kyc_status]), onPress: () => onGoTo('/kyc'),
    },
    { key: 'version', icon: Smartphone, label: t('profile.appVersionLabel'), value: appVersionLabel() },
  ];

  const tabs: Array<{ key: 'profile' | 'account'; label: string; icon: LucideIcon }> = [
    { key: 'profile', label: t('profile.tab.profile'), icon: User },
    { key: 'account', label: t('profile.tab.account'), icon: Settings },
  ];

  return (
    <View style={{ gap: 20 }}>
      {/* Hero — a solid brand-green header. The photo is the one thing the
          frame has no slot for, and the rider's only way to change it. */}
      <View
        className="items-center overflow-hidden"
        style={{
          backgroundColor: GREEN, borderRadius: 28,
          paddingTop: 26, paddingBottom: 24, paddingHorizontal: 16, gap: 16,
          shadowColor: GREEN_DARK, shadowOpacity: 0.3, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 6,
        }}
      >
        {/* depth: two soft discs behind the content, clipped by the card */}
        <View pointerEvents="none" style={{ position: 'absolute', top: -60, right: -40, width: 190, height: 190, borderRadius: 95, backgroundColor: 'rgba(255,255,255,0.12)' }} />
        <View pointerEvents="none" style={{ position: 'absolute', bottom: -70, left: -50, width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(0,0,0,0.08)' }} />

        <TouchableOpacity
          onPress={onChangePhoto}
          disabled={uploadingPhoto}
          accessibilityRole="button"
          accessibilityLabel={t('profile.changePhotoA11y')}
        >
          <View
            className="items-center justify-center overflow-hidden"
            style={{
              width: 88, height: 88, borderRadius: 44, backgroundColor: '#FFFFFF',
              borderWidth: 4, borderColor: 'rgba(255,255,255,0.9)',
              shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 4,
            }}
          >
            {photo ? (
              <ExpoImage
                source={{ uri: photo.uri, cacheKey: photo.cacheKey }}
                cachePolicy="disk"
                style={{ width: 80, height: 80, borderRadius: 40 }}
                contentFit="cover"
                transition={0}
              />
            ) : (
              <User size={32} color={GREEN} />
            )}
          </View>
          <View
            className="absolute items-center justify-center"
            style={{
              right: -2, bottom: -2, width: 28, height: 28, borderRadius: 14,
              backgroundColor: '#FFFFFF', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 3,
            }}
          >
            {uploadingPhoto ? <Text className="font-sans" style={{ color: GREEN_DARK, fontSize: 11 }}>…</Text> : <Camera size={14} color={GREEN_DARK} />}
          </View>
        </TouchableOpacity>

        <View className="w-full" style={{ gap: 6 }}>
          <Text className="font-sans text-center font-semibold" style={{ color: '#FFFFFF', fontSize: 18 }} numberOfLines={1}>
            {profile.full_name}
          </Text>
          <Text className="font-sans text-center" style={{ color: 'rgba(255,255,255,0.88)', fontSize: 12, letterSpacing: -0.12 }} numberOfLines={1}>
            {profile.email ?? (profile.phone ? formatPhoneLocal(profile.phone) : '—')}
          </Text>
        </View>

        <View className="flex-row flex-wrap justify-center" style={{ gap: 10 }}>
          {chips.map((chip, i) => (
            <View
              key={`${chip}-${i}`}
              style={{
                backgroundColor: i === 0 ? '#FFFFFF' : 'rgba(255,255,255,0.2)',
                borderRadius: 20, borderWidth: 1, borderColor: i === 0 ? '#FFFFFF' : 'rgba(255,255,255,0.35)',
                paddingLeft: 14, paddingRight: 13, paddingVertical: 8,
              }}
            >
              <Text className="font-sans" style={{ color: i === 0 ? GREEN_DARK : '#FFFFFF', fontSize: 11, fontWeight: '600' }}>{chip}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* 1:1315 — segmented control, 47 high, 4 padding, fully rounded */}
      <View
        className="flex-row"
        style={{ height: 47, padding: 4, borderRadius: 100, backgroundColor: CONTROL_BG }}
        accessibilityRole="tablist"
      >
        {tabs.map((item) => {
          const active = tab === item.key;
          const Icon = item.icon;
          return (
            <TouchableOpacity
              key={item.key}
              onPress={() => setTab(item.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              className="flex-1 flex-row items-center justify-center"
              style={{
                height: 39, borderRadius: 19.5, paddingHorizontal: 32, gap: 6,
                backgroundColor: active ? '#FFFFFF' : 'transparent',
                shadowColor: GREEN_DARK, shadowOpacity: active ? 0.14 : 0, shadowRadius: 4, shadowOffset: { width: 0, height: 4 },
                elevation: active ? 2 : 0,
              }}
            >
              <Icon size={16} color={active ? GREEN_DARK : '#4B6355'} />
              <Text className="font-sans" style={{ color: active ? GREEN_DARK : '#4B6355', fontSize: 12, fontWeight: active ? '600' : '400' }}>{item.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {tab === 'profile' ? (
        <>
          {/* 1:1332 — hairline, then the three-up strip, 16 apart */}
          <View style={{ gap: 16 }}>
            <View style={{ height: 1, backgroundColor: GREEN_EDGE }} />
            <View
              className="flex-row items-center justify-center"
              style={{
                backgroundColor: STRIP_BG, borderRadius: 16, paddingVertical: 20,
                borderWidth: 1, borderColor: GREEN_EDGE,
                shadowColor: GREEN_DARK, shadowOpacity: 0.06, shadowRadius: 14, shadowOffset: { width: 0, height: 4 },
              }}
            >
              {strip.map((item, i) => {
                const Icon = item.icon;
                return (
                  <React.Fragment key={item.key}>
                    {i > 0 ? <View style={{ width: 1, alignSelf: 'stretch', backgroundColor: GREEN_EDGE }} /> : null}
                    <View className="items-center" style={{ flex: 1, minWidth: 0, paddingHorizontal: 6, gap: 4 }}>
                      <View className="flex-row items-center justify-center" style={{ gap: 5 }}>
                        <Icon size={15} color={GREEN} />
                        <Text className="font-sans" style={{ color: INK, fontSize: 12, fontWeight: '600', letterSpacing: -0.12 }} numberOfLines={1}>
                          {item.value}
                        </Text>
                      </View>
                      <Text className="font-sans text-center" style={{ color: '#5F7468', fontSize: 10, letterSpacing: -0.1 }} numberOfLines={1}>
                        {item.label}
                      </Text>
                    </View>
                  </React.Fragment>
                );
              })}
            </View>
          </View>

          {/* 1:1442 — details */}
          <View style={{ gap: 16 }}>
            <View style={{ gap: 12 }}>
              <Text className="font-sans" style={{ color: INK, fontSize: 14, fontWeight: '600' }}>{t('profile.myDetails')}</Text>

              {!profile.can_rent ? (
                <Text className="font-sans" style={{ color: '#000', fontSize: 12, lineHeight: 18 }}>
                  <Text className="font-sans" style={{ color: 'rgba(0,0,0,0.6)' }}>{t('profile.verifyPrompt')}</Text>
                  {' '}
                  <Text className="font-sans" onPress={() => onGoTo('/kyc')} accessibilityRole="link" style={{ color: GREEN }}>
                    {t('profile.verifyNow')}
                  </Text>
                </Text>
              ) : null}
            </View>

            <View className="flex-row flex-wrap" style={{ gap: 14 }}>
                {cards.map((card) => {
                  const Icon = card.icon;
                  const body = (
                    <View style={{ gap: 12 }}>
                      <View
                        className="items-center justify-center"
                        style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: GREEN_SOFT }}
                      >
                        <Icon size={20} color={GREEN_DARK} />
                      </View>
                      <View style={{ gap: 4 }}>
                        <Text className="font-sans" style={{ color: '#5F7468', fontSize: 11 }}>{card.label}</Text>
                        <Text className="font-sans" style={{ color: INK, fontSize: 13, fontWeight: '600' }} numberOfLines={1}>{card.value}</Text>
                      </View>
                    </View>
                  );
                  const style = {
                    width: '47.5%' as const, borderRadius: 14, padding: 16,
                    backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: CARD_BORDER,
                    shadowColor: GREEN_DARK, shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
                  };
                  return card.onPress ? (
                    <TouchableOpacity key={card.key} onPress={card.onPress} accessibilityRole="button" style={style}>
                      {body}
                    </TouchableOpacity>
                  ) : (
                    <View key={card.key} style={style}>{body}</View>
                  );
                })}
            </View>
          </View>
        </>
      ) : (
        <View style={{ gap: 16 }}>
          <View style={{ height: 1, backgroundColor: GREEN_EDGE }} />
          <View style={{ gap: 12 }}>
            {menu.map((item) => {
              const Icon = item.icon;
              return (
                <TouchableOpacity
                  key={item.route}
                  onPress={() => onGoTo(item.route)}
                  accessibilityRole="button"
                  className="flex-row items-center"
                  style={{
                    padding: 12, gap: 10, borderRadius: 14, backgroundColor: '#FFFFFF',
                    borderWidth: 1, borderColor: CARD_BORDER,
                    shadowColor: GREEN_DARK, shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 3 },
                  }}
                >
                  <View
                    className="items-center justify-center"
                    style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: GREEN_SOFT }}
                  >
                    <Icon size={20} color={GREEN_DARK} />
                  </View>
                  <Text style={{ color: INK, fontSize: 13, fontWeight: '500' }} className="font-sans flex-1 ml-1">{item.label}</Text>
                  {item.value ? (
                    // lineHeight set explicitly: Devanagari and Tamil overflow the
                    // default box at this size.
                    <Text className="font-sans" style={{ color: '#5F7468', fontSize: 12, lineHeight: 18 }}>{item.value}</Text>
                  ) : null}
                  <ChevronRight size={16} color={GREEN_DARK} />
                </TouchableOpacity>
              );
            })}

            <TouchableOpacity
              onPress={onLogout}
              accessibilityRole="button"
              className="flex-row items-center justify-center"
              style={{ padding: 16, gap: 8, borderRadius: 14, backgroundColor: COLORS.danger + '12' }}
            >
              <LogOut size={16} color={COLORS.danger} />
              <Text className="font-sans" style={{ color: COLORS.danger, fontSize: 13 }}>{t('auth.logout')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

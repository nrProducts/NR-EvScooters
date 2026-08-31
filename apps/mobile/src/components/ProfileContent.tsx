import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Image } from 'react-native';
import { useRouter } from 'expo-router';
import {
  User, Camera, Mail, Phone, ShieldCheck, ChevronRight, LogOut, LifeBuoy, Lock, HelpCircle,
} from 'lucide-react-native';
import { useAuthStore } from '../store/useAuthStore';
import { Badge } from './ui/Badge';
import { COLORS } from '../constants/theme';
import { KYC_STATUS_LABEL, KYC_STATUS_TONE } from '../constants/status';
import { pickPhoto } from '../lib/filePicker';
import { userRepository } from '../services';
import { ApiError } from '../lib/ApiError';
import { notify } from '../lib/confirm';

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
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  // profile.profile_photo_url is a private-bucket storage path, not a
  // fetchable URL (see users.types.ts) — it only tells us a photo exists.
  // Actually rendering it means minting a signed URL via GET /me/photo/url,
  // same as the KYC document previews do.
  const hasPhoto = !!profile?.profile_photo_url;
  useEffect(() => {
    if (!hasPhoto) {
      setPhotoUrl(null);
      return;
    }
    let cancelled = false;
    userRepository.myPhotoUrl()
      .then((result) => { if (!cancelled) setPhotoUrl(result.url); })
      .catch(() => { if (!cancelled) setPhotoUrl(null); });
    return () => { cancelled = true; };
    // profile_photo_url changes on every re-upload (new storage path), which is
    // exactly when the signed URL needs to be re-minted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.profile_photo_url]);

  const changePhoto = async () => {
    const file = await pickPhoto();
    if (!file) return;
    setUploadingPhoto(true);
    try {
      await userRepository.uploadMyPhoto(file);
      await refreshProfile();
    } catch (err) {
      notify('Upload failed', err instanceof ApiError ? err.message : 'Please try again.');
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

  return (
    <View>
      <View className="items-center mb-5">
        <TouchableOpacity
          onPress={() => void changePhoto()}
          disabled={uploadingPhoto}
          accessibilityRole="button"
          accessibilityLabel="Change profile photo"
          className="mb-2.5"
        >
          <View
            className="w-16 h-16 rounded-full items-center justify-center overflow-hidden"
            style={{ backgroundColor: COLORS.primary + '1A' }}
          >
            {photoUrl ? (
              <Image source={{ uri: photoUrl }} className="w-16 h-16" resizeMode="cover" />
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
            {uploadingPhoto ? 'Uploading...' : 'Change Photo'}
          </Text>
        </TouchableOpacity>
        {/* Static now that the app is rider-only. Kept as the visual
            anchor for the avatar block — the badge that actually varies
            (KYC status) sits a few rows below. */}
        <View className="flex-row items-center mt-2 px-2.5 py-1 rounded-full" style={{ backgroundColor: COLORS.secondary + '30' }}>
          <ShieldCheck size={12} color={COLORS.primary} />
          <Text style={{ color: COLORS.primaryPressed }} className="text-[10px] font-bold uppercase tracking-wider ml-1">
            Rider
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
          <Text style={{ color: COLORS.textPrimary }} className="text-sm font-semibold ml-2.5">{profile.phone ?? '—'}</Text>
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
          <Text style={{ color: COLORS.textSecondary }} className="text-[10px] font-bold uppercase tracking-wider mb-1">Assigned Scooter</Text>
          <Text style={{ color: COLORS.textPrimary }} className="text-sm font-bold">
            {profile.assigned_vehicle ? profile.assigned_vehicle.model : 'None'}
          </Text>
        </View>
        <View
          className="flex-1 rounded-2xl p-3.5 border"
          style={{
            backgroundColor: COLORS.card, borderColor: COLORS.border,
            shadowColor: COLORS.black, shadowOpacity: 0.03, shadowRadius: 12, shadowOffset: { width: 0, height: 3 }, elevation: 1,
          }}
        >
          <Text style={{ color: COLORS.textSecondary }} className="text-[10px] font-bold uppercase tracking-wider mb-1">Current Plan</Text>
          <Text style={{ color: COLORS.textPrimary }} className="text-sm font-bold">
            {profile.current_plan ? profile.current_plan.name : 'None'}
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
        <Text style={{ color: COLORS.textSecondary }} className="text-xs font-bold uppercase tracking-wider">KYC Status</Text>
        <Badge label={KYC_STATUS_LABEL[profile.kyc_status]} tone={KYC_STATUS_TONE[profile.kyc_status]} />
      </View>

      {!profile.can_rent ? (
        <TouchableOpacity
          onPress={() => goTo('/kyc')}
          accessibilityRole="button"
          className="rounded-2xl p-3.5 flex-row items-center justify-between mb-3"
          style={{ backgroundColor: COLORS.warning + '14' }}
        >
          <Text style={{ color: COLORS.warning }} className="text-[11px] font-bold flex-1 mr-2">
            Verify your identity to unlock a scooter
          </Text>
          <ChevronRight size={16} color={COLORS.warning} />
        </TouchableOpacity>
      ) : null}

      {compact ? (
        <TouchableOpacity
          onPress={() => goTo('/profile')}
          accessibilityRole="button"
          className="rounded-2xl p-3.5 flex-row items-center justify-between"
          style={{ backgroundColor: COLORS.primary + '14' }}
        >
          <Text style={{ color: COLORS.primary }} className="text-sm font-bold">View full profile</Text>
          <ChevronRight size={16} color={COLORS.primary} />
        </TouchableOpacity>
      ) : (
        <>
      {/* Menu — the destinations that used to live in the nav drawer. */}
      <View
        className="rounded-2xl border overflow-hidden mb-6"
        style={{
          backgroundColor: COLORS.card, borderColor: COLORS.border,
          shadowColor: COLORS.black, shadowOpacity: 0.03, shadowRadius: 12, shadowOffset: { width: 0, height: 3 }, elevation: 1,
        }}
      >
        {[
          { icon: ShieldCheck, label: 'KYC Verification', route: '/kyc' },
          { icon: LifeBuoy, label: 'Support', route: '/support' },
          // DPDPA: consent toggles, data export, correction, erasure, nominee
          // and the grievance channel all live behind this one entry.
          { icon: Lock, label: 'Privacy & Data', route: '/privacy' },
          { icon: HelpCircle, label: 'How Swapngo Works', route: '/onboarding?replay=1' },
        ].map((item, i) => {
          const Icon = item.icon;
          return (
            <TouchableOpacity
              key={item.route}
              onPress={() => goTo(item.route)}
              accessibilityRole="button"
              className="flex-row items-center px-4 py-3.5"
              style={i > 0 ? { borderTopWidth: 1, borderColor: COLORS.border } : undefined}
            >
              <View
                className="w-8 h-8 rounded-lg items-center justify-center mr-3"
                style={{ backgroundColor: COLORS.primary + '14' }}
              >
                <Icon size={16} color={COLORS.primary} />
              </View>
              <Text style={{ color: COLORS.textPrimary }} className="text-sm font-semibold flex-1">
                {item.label}
              </Text>
              <ChevronRight size={16} color={COLORS.textSecondary} />
            </TouchableOpacity>
          );
        })}
      </View>

      <TouchableOpacity
        onPress={handleLogout}
        className="w-full py-4 rounded-2xl flex-row justify-center items-center"
        style={{ backgroundColor: COLORS.danger + '12' }}
      >
        <LogOut size={16} color={COLORS.danger} />
        <Text style={{ color: COLORS.danger }} className="font-bold text-sm ml-2">Logout</Text>
      </TouchableOpacity>
        </>
      )}
    </View>
  );
}

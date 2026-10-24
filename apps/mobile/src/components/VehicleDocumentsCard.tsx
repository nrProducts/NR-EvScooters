import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Linking } from 'react-native';
import { FileText, Lock, ShieldCheck, IdCard, ChevronRight } from 'lucide-react-native';
import { Spinner } from './Spinner';
import { kycRepository, rentalRepository } from '../services';
import { ApiError } from '../lib/ApiError';
import { chooseAction, notify } from '../lib/confirm';
import { COLORS } from '../constants/theme';
import { useT, type CopyKey } from '../i18n';
import type { ApiDocument, ApiVehicleDocument, VehicleDocType } from '../types/api';

/**
 * The paperwork a rider may be asked to produce at a checkpoint —
 * self-fetches on mount, same standalone pattern as ReturnStatusCard.
 *
 * Two sources:
 *  · The rider's own driving licence, from their KYC
 *    (GET /users/me/kyc). Every rider holding a scooter has one: it is a
 *    mandatory KYC type and a rental cannot start without verified KYC.
 *  · The scooter's RC and insurance (GET /rentals/me/vehicle-documents),
 *    which resolves the currently-assigned vehicle server-side.
 * Both open through a signed URL minted on tap rather than embedded.
 *
 * `fitness`/`permit` exist in the vehicle schema for fleet ops but have no
 * row here. Nor does `puc`: the fleet is battery-electric, which is exempt
 * from Pollution Under Control certification, so that row could only ever
 * render locked. A document not uploaded yet renders locked.
 */
const VEHICLE_TYPES: { type: VehicleDocType; icon: typeof FileText; labelKey: CopyKey; hintKey: CopyKey }[] = [
  { type: 'registration', icon: FileText, labelKey: 'vehicleDocs.rc', hintKey: 'vehicleDocs.rcHint' },
  { type: 'insurance', icon: ShieldCheck, labelKey: 'vehicleDocs.insurance', hintKey: 'vehicleDocs.insuranceHint' },
];

/** The licence to show: the latest one that hasn't been rejected (a rejected upload is not a licence on file). */
function pickLicence(docs: ApiDocument[]): ApiDocument | null {
  return (
    docs
      .filter((d) => d.document_type === 'driving_licence' && d.verification_status !== 'rejected')
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null
  );
}

interface Row {
  key: string;
  icon: typeof FileText;
  label: string;
  subtitle: string;
  available: boolean;
  onOpen?: () => Promise<string | null>;
}

export const VehicleDocumentsCard: React.FC = () => {
  const { t } = useT();
  const [docs, setDocs] = useState<ApiVehicleDocument[]>([]);
  const [licence, setLicence] = useState<ApiDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [openingKey, setOpeningKey] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    // Non-critical enhancement card — the rest of My Scooter still works
    // without it, so each source fails quiet (its rows render locked) rather
    // than showing an error state here.
    void Promise.allSettled([rentalRepository.vehicleDocuments(), kycRepository.mine()])
      .then(([vehicle, kyc]) => {
        setDocs(vehicle.status === 'fulfilled' ? vehicle.value : []);
        setLicence(kyc.status === 'fulfilled' ? pickLicence(kyc.value.documents) : null);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const open = async (key: string, getUrl: () => Promise<string | null>) => {
    setOpeningKey(key);
    try {
      const url = await getUrl();
      if (url) await Linking.openURL(url);
    } catch (err) {
      notify(t('vehicleDocs.error.openFailed.title'), err instanceof ApiError ? err.message : t('common.pleaseTryAgain'));
    } finally {
      setOpeningKey(null);
    }
  };

  /** A licence has two sides; ask which one when there is a back to show. */
  const licenceUrl = async (doc: ApiDocument): Promise<string | null> => {
    let side: 'front' | 'back' = 'front';
    if (doc.has_back_side) {
      const choice = await chooseAction({
        title: t('vehicleDocs.dl'),
        options: [
          { key: 'front', label: t('kyc.doc.front') },
          { key: 'back', label: t('kyc.doc.back') },
        ],
        cancelLabel: t('common.cancel'),
      });
      if (!choice) return null;
      side = choice as 'front' | 'back';
    }
    return (await kycRepository.myDocumentUrl(doc.id, side)).url;
  };

  const licenceSubtitle = (doc: ApiDocument | null): string => {
    if (!doc) return t('vehicleDocs.dlHint');
    if (!doc.expires_on) return doc.doc_number_masked ?? t('vehicleDocs.dlHint');
    return doc.is_expired
      ? t('vehicleDocs.expiredOn', { date: doc.expires_on })
      : t('vehicleDocs.expiresOn', { date: doc.expires_on });
  };

  const rows: Row[] = [
    {
      key: 'driving_licence',
      icon: IdCard,
      label: t('vehicleDocs.dl'),
      subtitle: licenceSubtitle(licence),
      available: !!licence,
      onOpen: licence ? () => licenceUrl(licence) : undefined,
    },
    ...VEHICLE_TYPES.map(({ type, icon, labelKey, hintKey }): Row => {
      const doc = docs.find((d) => d.doc_type === type);
      const available = !!doc?.has_file;
      return {
        key: type,
        icon,
        label: t(labelKey),
        subtitle: available && doc ? t('vehicleDocs.expiresOn', { date: doc.expires_on }) : t(hintKey),
        available,
        onOpen: available && doc ? () => rentalRepository.vehicleDocumentUrl(doc.id) : undefined,
      };
    }),
  ];

  return (
    <View className="mt-6">
      <View className="flex-row items-center mb-3">
        <FileText size={15} color={COLORS.textPrimary} />
        <Text style={{ color: COLORS.textPrimary }} className="text-sm font-semibold ml-2">
          {t('vehicleDocs.title')}
        </Text>
        {loading ? (
          <View className="ml-2">
            <Spinner size={12} color={COLORS.textSecondary} />
          </View>
        ) : null}
      </View>

      <View
        className="rounded-2xl border overflow-hidden"
        style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}
      >
        {rows.map(({ key, icon: Icon, label, subtitle, available, onOpen }, index) => {
          const opening = openingKey === key;

          let trailing: React.ReactNode;
          if (opening) trailing = <Spinner size={13} color={COLORS.textSecondary} />;
          else if (available) trailing = <ChevronRight size={15} color={COLORS.textSecondary} />;
          else trailing = <Lock size={13} color={COLORS.textSecondary} />;

          const row = (
            <View
              className="flex-row items-center px-4 py-3.5"
              style={{
                borderTopWidth: index === 0 ? 0 : 1,
                borderColor: COLORS.border,
                opacity: loading || available ? 1 : 0.55,
              }}
            >
              <Icon size={15} color={available ? COLORS.primary : COLORS.textSecondary} />
              <View className="flex-1 ml-2.5">
                <Text style={{ color: COLORS.textPrimary }} className="text-xs font-bold">{label}</Text>
                <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium mt-0.5">
                  {subtitle}
                </Text>
              </View>
              {trailing}
            </View>
          );

          if (!available || !onOpen) return <View key={key}>{row}</View>;
          return (
            <TouchableOpacity
              key={key}
              onPress={() => void open(key, onOpen)}
              disabled={openingKey !== null}
              accessibilityRole="button"
              accessibilityLabel={label}
            >
              {row}
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium mt-2 leading-relaxed">
        {t('vehicleDocs.footer')}
      </Text>
    </View>
  );
};

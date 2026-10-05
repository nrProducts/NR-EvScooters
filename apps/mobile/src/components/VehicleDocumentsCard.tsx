import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Linking } from 'react-native';
import { FileText, Lock, ShieldCheck, Leaf, ChevronRight } from 'lucide-react-native';
import { Spinner } from './Spinner';
import { rentalRepository } from '../services';
import { ApiError } from '../lib/ApiError';
import { notify } from '../lib/confirm';
import { COLORS } from '../constants/theme';
import { useT, type CopyKey } from '../i18n';
import type { ApiVehicleDocument, VehicleDocType } from '../types/api';

/**
 * The vehicle paperwork a rider may be asked to produce at a checkpoint —
 * self-fetches the current vehicle's documents, same standalone-on-focus
 * pattern as ReturnStatusCard. Real data now: GET /rentals/me/vehicle-documents
 * resolves the rider's currently-assigned vehicle server-side and returns
 * whatever public.vehicle_documents rows exist for it, each with a signed
 * URL minted on tap rather than embedded — see vehicles.documents.storage.ts.
 *
 * Only the three types a rider would ever be asked for at a checkpoint are
 * shown; `fitness`/`permit` exist in the schema for fleet ops but have no
 * row in this card. A type with no document row yet, or a row with no file
 * uploaded, renders locked — same as before, just per-document now instead
 * of the whole card being a placeholder.
 */
const SHOWN_TYPES: { type: VehicleDocType; icon: typeof FileText; labelKey: CopyKey; hintKey: CopyKey }[] = [
  { type: 'registration', icon: FileText, labelKey: 'vehicleDocs.rc', hintKey: 'vehicleDocs.rcHint' },
  { type: 'insurance', icon: ShieldCheck, labelKey: 'vehicleDocs.insurance', hintKey: 'vehicleDocs.insuranceHint' },
  { type: 'puc', icon: Leaf, labelKey: 'vehicleDocs.puc', hintKey: 'vehicleDocs.pucHint' },
];

export const VehicleDocumentsCard: React.FC = () => {
  const { t } = useT();
  const [docs, setDocs] = useState<ApiVehicleDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [openingId, setOpeningId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    rentalRepository
      .vehicleDocuments()
      .then(setDocs)
      .catch(() => {
        // Non-critical enhancement card — the rest of My Scooter still works
        // without it, so fail quiet rather than show an error state here.
        setDocs([]);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openDocument = async (doc: ApiVehicleDocument) => {
    setOpeningId(doc.id);
    try {
      const url = await rentalRepository.vehicleDocumentUrl(doc.id);
      await Linking.openURL(url);
    } catch (err) {
      notify(t('vehicleDocs.error.openFailed.title'), err instanceof ApiError ? err.message : t('common.pleaseTryAgain'));
    } finally {
      setOpeningId(null);
    }
  };

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
        {SHOWN_TYPES.map(({ type, icon: Icon, labelKey, hintKey }, index) => {
          const doc = docs.find((d) => d.doc_type === type);
          const available = !!doc?.has_file;
          const opening = doc ? openingId === doc.id : false;

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
                <Text style={{ color: COLORS.textPrimary }} className="text-xs font-bold">{t(labelKey)}</Text>
                <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium mt-0.5">
                  {available && doc ? t('vehicleDocs.expiresOn', { date: doc.expires_on }) : t(hintKey)}
                </Text>
              </View>
              {opening ? (
                <Spinner size={13} color={COLORS.textSecondary} />
              ) : available ? (
                <ChevronRight size={15} color={COLORS.textSecondary} />
              ) : (
                <Lock size={13} color={COLORS.textSecondary} />
              )}
            </View>
          );

          if (!available) return <View key={type}>{row}</View>;
          return (
            <TouchableOpacity
              key={type}
              onPress={() => void openDocument(doc!)}
              disabled={opening}
              accessibilityRole="button"
              accessibilityLabel={t(labelKey)}
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

import React from 'react';
import { View, Text } from 'react-native';
import { FileText, Lock, ShieldCheck, Leaf } from 'lucide-react-native';
import { Badge } from './ui/Badge';
import { COLORS } from '../constants/theme';
import { useT, type CopyKey } from '../i18n';

/**
 * The vehicle paperwork a rider may be asked to produce at a checkpoint.
 *
 * Placeholder ONLY — deliberately not wired to anything. The schema has no
 * document storage for vehicles: `vehicles` carries insurance_number and
 * insurance_expiry (both empty in practice) and there is no RC or PUC column,
 * nor a vehicle-documents bucket. Showing empty rows as if they were real
 * would be worse than saying plainly that this is coming.
 *
 * When it does land, each row becomes a tap target opening a signed URL, the
 * same way KYC documents already work for the rider's own paperwork.
 */
/** Keys, not labels — module scope does not re-run on a language change. */
const DOCUMENTS: { key: string; icon: typeof FileText; labelKey: CopyKey; hintKey: CopyKey }[] = [
  { key: 'rc', icon: FileText, labelKey: 'vehicleDocs.rc', hintKey: 'vehicleDocs.rcHint' },
  { key: 'insurance', icon: ShieldCheck, labelKey: 'vehicleDocs.insurance', hintKey: 'vehicleDocs.insuranceHint' },
  { key: 'puc', icon: Leaf, labelKey: 'vehicleDocs.puc', hintKey: 'vehicleDocs.pucHint' },
];

export const VehicleDocumentsCard: React.FC = () => {
  const { t } = useT();
  return (
    <View className="mt-6">
      <View className="flex-row items-center justify-between mb-3">
        <View className="flex-row items-center">
          <FileText size={15} color={COLORS.textPrimary} />
          <Text style={{ color: COLORS.textPrimary }} className="text-sm font-semibold ml-2">
            {t('vehicleDocs.title')}
          </Text>
        </View>
        <Badge label={t('ui.comingSoon')} tone="neutral" />
      </View>

      <View
        className="rounded-2xl border overflow-hidden"
        style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}
      >
        {DOCUMENTS.map((doc, index) => (
          <View
            key={doc.key}
            className="flex-row items-center px-4 py-3.5"
            style={{ borderTopWidth: index === 0 ? 0 : 1, borderColor: COLORS.border, opacity: 0.55 }}
          >
            <doc.icon size={15} color={COLORS.textSecondary} />
            <View className="flex-1 ml-2.5">
              <Text style={{ color: COLORS.textPrimary }} className="text-xs font-bold">{t(doc.labelKey)}</Text>
              <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium mt-0.5">
                {t(doc.hintKey)}
              </Text>
            </View>
            <Lock size={13} color={COLORS.textSecondary} />
          </View>
        ))}
      </View>

      <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium mt-2 leading-relaxed">
        {t('vehicleDocs.footer')}
      </Text>
    </View>
  );
};

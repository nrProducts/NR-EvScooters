import React from 'react';
import { View, Text } from 'react-native';
import { FileText, Lock, ShieldCheck, Leaf } from 'lucide-react-native';
import { Badge } from './ui/Badge';
import { COLORS } from '../constants/theme';

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
const DOCUMENTS = [
  {
    key: 'rc',
    icon: FileText,
    label: 'Registration Certificate',
    hint: 'Proof the scooter is registered (RC)',
  },
  {
    key: 'insurance',
    icon: ShieldCheck,
    label: 'Insurance',
    hint: 'Active third-party cover',
  },
  {
    key: 'puc',
    icon: Leaf,
    label: 'PUC Certificate',
    hint: 'Pollution Under Control',
  },
] as const;

export const VehicleDocumentsCard: React.FC = () => (
  <View className="mt-6">
    <View className="flex-row items-center justify-between mb-3">
      <View className="flex-row items-center">
        <FileText size={15} color={COLORS.textPrimary} />
        <Text style={{ color: COLORS.textPrimary }} className="text-sm font-semibold ml-2">
          Vehicle Documents
        </Text>
      </View>
      <Badge label="Coming soon" tone="neutral" />
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
            <Text style={{ color: COLORS.textPrimary }} className="text-xs font-bold">{doc.label}</Text>
            <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium mt-0.5">
              {doc.hint}
            </Text>
          </View>
          <Lock size={13} color={COLORS.textSecondary} />
        </View>
      ))}
    </View>

    <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium mt-2 leading-relaxed">
      {'You’ll be able to view and download your scooter’s documents here once our team finishes uploading them.'}
    </Text>
  </View>
);

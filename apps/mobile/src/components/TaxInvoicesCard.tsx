import React, { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, Linking } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { ChevronRight, FileText, Undo2 } from 'lucide-react-native';
import { Spinner } from './Spinner';
import { billingRepository } from '../services';
import { ApiError } from '../lib/ApiError';
import { notifyError } from '../lib/confirm';
import { COLORS } from '../constants/theme';
import { useT } from '../i18n';
import type { ApiTaxDocument } from '../types/api';

/**
 * The rider's GST tax invoices and credit notes (GET /gst/me/documents).
 *
 * A tax invoice is the GST document issued once a bill is paid — distinct
 * from the bills in Payment History above it. Tapping one asks the backend
 * for a short-lived signed link and opens the PDF in the system browser,
 * which cannot carry our bearer token itself.
 *
 * A non-critical card: if the list fails to load it renders nothing rather
 * than an error state, and it stays hidden until the rider has a document.
 */
const SHOWN = 10;

function formatDate(iso: string): string {
    // An IST calendar date ("2026-11-02"); noon keeps every device timezone on the same day.
    return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

const rupees = (n: number) => `₹${n.toFixed(2)}`;

export function TaxInvoicesCard() {
    const { t } = useT();
    const [docs, setDocs] = useState<ApiTaxDocument[]>([]);
    const [openingId, setOpeningId] = useState<string | null>(null);

    const load = useCallback(() => {
        billingRepository
            .myTaxDocuments({ page: 1, pageSize: SHOWN })
            .then((res) => setDocs(res.data))
            .catch(() => setDocs([]));
    }, []);

    useFocusEffect(useCallback(() => { load(); }, [load]));

    const open = async (doc: ApiTaxDocument) => {
        setOpeningId(doc.id);
        try {
            await Linking.openURL(await billingRepository.myTaxDocumentUrl(doc.id));
        } catch (err) {
            notifyError(t('billing.taxInvoices.openFailed'), err instanceof ApiError ? err.message : undefined);
        } finally {
            setOpeningId(null);
        }
    };

    if (docs.length === 0) return null;

    return (
        <View className="mt-4">
            <Text style={{ color: COLORS.textPrimary }} className="text-sm font-semibold mb-1">{t('billing.taxInvoices')}</Text>
            <Text style={{ color: COLORS.textSecondary }} className="text-xs mb-3">{t('billing.taxInvoices.hint')}</Text>
            <View
                className="rounded-2xl mb-4 overflow-hidden"
                style={{ backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border }}
            >
                {docs.map((doc, i) => {
                    const credit = doc.docType === 'credit_note';
                    const Icon = credit ? Undo2 : FileText;
                    return (
                        <TouchableOpacity
                            key={doc.id}
                            onPress={() => void open(doc)}
                            disabled={openingId !== null}
                            accessibilityRole="button"
                            accessibilityLabel={`${credit ? t('billing.taxInvoices.creditNote') : t('billing.taxInvoices.taxInvoice')} ${doc.docNumber}`}
                            className="flex-row items-center px-4 py-3"
                            style={i > 0 ? { borderTopWidth: 1, borderTopColor: COLORS.border } : undefined}
                        >
                            <View
                                className="h-9 w-9 rounded-full items-center justify-center mr-3"
                                style={{ backgroundColor: (credit ? COLORS.warning : COLORS.primary) + '1A' }}
                            >
                                <Icon size={16} color={credit ? COLORS.warning : COLORS.primary} />
                            </View>
                            <View className="flex-1 min-w-0">
                                <Text style={{ color: COLORS.textPrimary }} className="text-xs font-bold" numberOfLines={1}>
                                    {doc.docNumber}
                                </Text>
                                <Text style={{ color: COLORS.textSecondary }} className="text-[11px] mt-0.5" numberOfLines={1}>
                                    {credit ? t('billing.taxInvoices.creditNote') : t('billing.taxInvoices.taxInvoice')} · {formatDate(doc.issuedOn)}
                                </Text>
                            </View>
                            <View className="items-end mr-2">
                                <Text style={{ color: credit ? COLORS.danger : COLORS.textPrimary }} className="text-xs font-extrabold">
                                    {credit ? '-' : ''}{rupees(doc.totalAmount)}
                                </Text>
                                <Text style={{ color: COLORS.textSecondary }} className="text-[10px] mt-0.5">
                                    {t('billing.taxInvoices.gst', { amount: rupees(doc.cgstAmount + doc.sgstAmount) })}
                                </Text>
                            </View>
                            {openingId === doc.id
                                ? <Spinner size={16} color={COLORS.primary} />
                                : <ChevronRight size={16} color={COLORS.textSecondary} />}
                        </TouchableOpacity>
                    );
                })}
            </View>
        </View>
    );
}

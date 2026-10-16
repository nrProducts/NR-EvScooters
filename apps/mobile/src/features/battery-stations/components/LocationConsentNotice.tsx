import React from 'react';
import { View, Text, Switch } from 'react-native';
import { LocateOff } from 'lucide-react-native';
import { COLORS } from '../../../constants/theme';
import { Spinner } from '../../../components/Spinner';
import { useConsent } from '../../../hooks/useConsent';
import { useT } from '../../../i18n';

/**
 * Shown on the map when the rider has turned "Nearby battery stations" off in
 * Privacy & data. It names that choice and carries the switch itself, so
 * turning it back on is one tap here rather than a trip through Profile.
 *
 * Distinct from the "location is off on your phone" notice, which is about the
 * OS permission and is fixed in device settings, not here.
 */
export const LocationConsentNotice: React.FC<{ onEnabled: () => void }> = ({ onEnabled }) => {
    const { t } = useT();
    const { setOne, saving, notice } = useConsent();

    const turnOn = async (next: boolean) => {
        if (!next) return;
        const result = await setOne('location_services', true);
        if (result.ok) onEnabled();
    };

    return (
        <View
            className="flex-row items-center mt-2 px-3.5 py-3 rounded-2xl border"
            // Opaque, not a tint: a translucent fill let the map's labels and
            // roads show through the text and made the switch hard to find.
            style={{
                backgroundColor: COLORS.card,
                borderColor: COLORS.warning,
                shadowColor: COLORS.black,
                shadowOpacity: 0.12,
                shadowRadius: 10,
                shadowOffset: { width: 0, height: 3 },
                elevation: 5,
            }}
        >
            <View
                className="w-8 h-8 rounded-full items-center justify-center"
                style={{ backgroundColor: COLORS.warning + '24' }}
            >
                <LocateOff size={16} color={COLORS.warning} />
            </View>
            <Text style={{ color: COLORS.textPrimary }} className="text-xs font-semibold mx-3 flex-1 leading-snug">
                {t('stations.locationConsentOff')}
            </Text>
            {saving ? (
                <Spinner size={16} color={COLORS.primary} />
            ) : (
                <Switch
                    value={false}
                    disabled={!notice}
                    onValueChange={(v) => void turnOn(v)}
                    accessibilityLabel={t('stations.locationConsentSwitch')}
                    trackColor={{ false: COLORS.gray[300], true: COLORS.secondary }}
                    thumbColor={COLORS.gray[100]}
                />
            )}
        </View>
    );
};

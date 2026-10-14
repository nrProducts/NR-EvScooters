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
            className="flex-row items-center mt-2 px-3.5 py-2.5 rounded-2xl"
            style={{ backgroundColor: COLORS.warning + '1F' }}
        >
            <LocateOff size={14} color={COLORS.warning} />
            <Text style={{ color: COLORS.textPrimary }} className="text-[11px] font-bold mx-2 flex-1">
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

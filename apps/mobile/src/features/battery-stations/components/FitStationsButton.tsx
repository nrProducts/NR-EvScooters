import React from 'react';
import { Maximize } from 'lucide-react-native';
import { MapControlButton } from './MapControlButton';
import { useT } from '../../../i18n';

/** Frames every loaded station. Disabled when there is nothing to frame. */
export const FitStationsButton: React.FC<{ onPress: () => void; disabled?: boolean }> = ({
    onPress,
    disabled,
}) => {
    const { t } = useT();
    return (
        <MapControlButton
            icon={Maximize}
            label={t('mapControl.fitAll')}
            onPress={onPress}
            disabled={disabled}
        />
    );
};

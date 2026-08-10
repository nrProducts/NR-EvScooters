import React from 'react';
import { Maximize } from 'lucide-react-native';
import { MapControlButton } from './MapControlButton';

/** Frames every loaded station. Disabled when there is nothing to frame. */
export const FitStationsButton: React.FC<{ onPress: () => void; disabled?: boolean }> = ({
    onPress,
    disabled,
}) => (
    <MapControlButton
        icon={Maximize}
        label="Fit all stations on screen"
        onPress={onPress}
        disabled={disabled}
    />
);

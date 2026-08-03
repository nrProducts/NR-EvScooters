import React from 'react';
import { LocateFixed, LocateOff } from 'lucide-react-native';
import { MapControlButton } from './MapControlButton';
import type { LocationPermissionState } from '../hooks/useCurrentLocation';

/**
 * "My Location". Stays tappable when permission was denied — pressing it
 * re-asks, which is the only in-app way back from an accidental "Deny".
 */
export const LocationButton: React.FC<{
    permission: LocationPermissionState;
    isLocating: boolean;
    onPress: () => void;
}> = ({ permission, isLocating, onPress }) => (
    <MapControlButton
        icon={permission === 'denied' ? LocateOff : LocateFixed}
        label={permission === 'denied' ? 'Enable location access' : 'Centre the map on my location'}
        onPress={onPress}
        busy={isLocating}
        active={permission === 'granted'}
    />
);

import React from 'react';
import { View, Text } from 'react-native';
import { CircleCheck, CircleX, Wrench } from 'lucide-react-native';
import { COLORS } from '../../../constants/theme';
import { STATION_STATUS_LABEL_KEY, type StationStatus } from '../types/batteryStation.types';
import { useT } from '../../../i18n';

/** Colour AND icon AND word — never colour on its own. */
const STATUS_STYLE: Record<StationStatus, { color: string; Icon: typeof CircleCheck }> = {
    WORKING: { color: COLORS.success, Icon: CircleCheck },
    MAINTENANCE: { color: COLORS.warning, Icon: Wrench },
    NOT_WORKING: { color: COLORS.danger, Icon: CircleX },
};

/** The marker layers use the same colours — see markerLayerStyles.ts. */
export const stationStatusColor = (status: StationStatus): string => STATUS_STYLE[status].color;

export const StationStatusBadge: React.FC<{ status: StationStatus }> = ({ status }) => {
    const { t } = useT();
    const { color, Icon } = STATUS_STYLE[status];
    const label = t(STATION_STATUS_LABEL_KEY[status]);
    return (
        <View
            className="flex-row items-center px-2.5 py-1 rounded-full"
            style={{ backgroundColor: color + '1A' }}
            accessibilityRole="text"
            accessibilityLabel={t('status.station.a11yLabel', { status: label })}
        >
            <Icon size={12} color={color} />
            <Text style={{ color }} className="text-[10px] font-black uppercase tracking-wider ml-1.5">
                {label}
            </Text>
        </View>
    );
};

import React from 'react';
import { View, Text } from 'react-native';
import { COLORS } from '../constants/theme';
import { Leaf, Wrench } from 'lucide-react-native';

interface MapCustomMarkerProps {
  battery: number;
  status: 'available' | 'reserved' | 'active' | 'maintenance';
}

export const MapCustomMarker: React.FC<MapCustomMarkerProps> = ({ battery, status }) => {
  // Get color based on battery levels
  let markerBg = COLORS.primaryDark;
  let textBg = COLORS.primaryLight;
  let isLow = false;

  if (status === 'maintenance') {
    markerBg = COLORS.forestDeep;
    textBg = COLORS.primaryMedium;
  } else {
    if (battery > 50) {
      markerBg = COLORS.primaryDark;
      textBg = '#FFF';
    } else if (battery >= 20) {
      markerBg = COLORS.primaryMedium;
      textBg = COLORS.forestDeep;
    } else {
      markerBg = '#EF4444'; // red
      textBg = '#FFF';
      isLow = true;
    }
  }

  return (
    <View className="items-center justify-center">
      {/* Pin Body */}
      <View 
        style={{ backgroundColor: markerBg }}
        className="w-11 h-11 rounded-full items-center justify-center border-2 border-white dark:border-zinc-800 shadow-md relative"
      >
        {status === 'maintenance' ? (
          <Wrench size={16} color="#FFF" />
        ) : isLow ? (
          <Text className="text-[10px] font-black text-white">{battery}%</Text>
        ) : (
          <View className="items-center justify-center">
            <Leaf size={14} color={textBg} fill={textBg} className="mb-[2px]" />
            <Text 
              style={{ color: textBg }}
              className="text-[9px] font-extrabold"
            >
              {battery}%
            </Text>
          </View>
        )}

        {/* Small operational task indicator dot if battery is low or maintenance */}
        {(status === 'maintenance' || battery < 20) && (
          <View className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-yellow-500 rounded-full border border-white items-center justify-center">
            <Text className="text-[8px] font-black text-white">!</Text>
          </View>
        )}
      </View>

      {/* Pin Pointer Triangle */}
      <View 
        style={{ 
          borderTopColor: markerBg,
          borderTopWidth: 6,
          borderLeftWidth: 5,
          borderRightWidth: 5,
          borderLeftColor: 'transparent',
          borderRightColor: 'transparent',
          marginTop: -2,
        }}
        className="w-0 h-0"
      />
    </View>
  );
};

import React from 'react';
import { View, Text } from 'react-native';
import { COLORS } from '../constants/theme';
import { Zap, ShieldAlert } from 'lucide-react-native';

interface RadialProgressProps {
  percent: number;
  range: number;
  isImmobilized: boolean;
}

export const RadialProgress: React.FC<RadialProgressProps> = ({ percent, range, isImmobilized }) => {
  // Determine color based on battery percentage
  let statusColor = COLORS.primaryDark;
  if (isImmobilized) {
    statusColor = '#EF4444'; // Red for immobilized
  } else if (percent < 20) {
    statusColor = '#EF4444'; // Red
  } else if (percent < 50) {
    statusColor = COLORS.primaryMedium; // Light Green / Orange
  }

  return (
    <View className="items-center justify-center py-4">
      {/* Outer Ring Border Mock */}
      <View 
        style={{ borderColor: statusColor }}
        className="w-56 h-56 rounded-full border-[10px] items-center justify-center bg-emerald-50/20 dark:bg-zinc-900/40 shadow-inner relative"
      >
        {/* Glow Shadow */}
        <View className="absolute inset-2 border border-emerald-100/30 rounded-full" />
        
        {/* Telemetry Info */}
        <View className="items-center">
          {isImmobilized ? (
            <ShieldAlert size={28} color="#EF4444" className="mb-1" />
          ) : (
            <Zap size={28} color={statusColor} fill={percent > 20 ? statusColor : 'transparent'} className="mb-1" />
          )}
          
          <Text 
            style={{ color: COLORS.forestDeep }} 
            className="text-5xl font-black tracking-tighter dark:text-emerald-50 font-sans"
          >
            {percent}%
          </Text>
          
          <Text className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mt-1">
            State Of Charge
          </Text>
          
          <View className="bg-emerald-800/10 dark:bg-emerald-950/40 border border-emerald-150 dark:border-emerald-900/40 rounded-full px-3 py-1 mt-3">
            <Text style={{ color: COLORS.primaryDark }} className="text-xs font-bold dark:text-emerald-400">
              {range.toFixed(1)} km left
            </Text>
          </View>
        </View>

        {/* Small Indicator ticks */}
        <View className="absolute -top-1.5 w-3 h-3 rounded-full bg-white border-2 border-emerald-700" />
      </View>
    </View>
  );
};

import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { COLORS } from '../constants/theme';
import { Delete, Trash2 } from 'lucide-react-native';

interface KeypadProps {
  onPress: (digit: string) => void;
  onDelete: () => void;
  onClear: () => void;
}

export const Keypad: React.FC<KeypadProps> = ({ onPress, onDelete, onClear }) => {
  const keys = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['clear', '0', 'delete']
  ];

  return (
    <View className="w-full max-w-[320px] mx-auto px-4 py-2">
      {keys.map((row, rowIndex) => (
        <View key={rowIndex} className="flex-row justify-between mb-4">
          {row.map((key) => {
            if (key === 'clear') {
              return (
                <TouchableOpacity
                  key={key}
                  onPress={onClear}
                  activeOpacity={0.6}
                  className="w-20 h-20 items-center justify-center rounded-full bg-slate-100 dark:bg-zinc-800"
                >
                  <Trash2 size={22} color="#EF4444" />
                </TouchableOpacity>
              );
            }
            if (key === 'delete') {
              return (
                <TouchableOpacity
                  key={key}
                  onPress={onDelete}
                  activeOpacity={0.6}
                  className="w-20 h-20 items-center justify-center rounded-full bg-slate-100 dark:bg-zinc-800"
                >
                  <Delete size={22} color={COLORS.forestDeep} />
                </TouchableOpacity>
              );
            }

            return (
              <TouchableOpacity
                key={key}
                onPress={() => onPress(key)}
                activeOpacity={0.6}
                className="w-20 h-20 items-center justify-center rounded-full bg-emerald-50 dark:bg-zinc-900 border border-emerald-100/50 dark:border-zinc-800"
              >
                <Text 
                  style={{ color: COLORS.forestDeep }} 
                  className="text-2xl font-bold font-sans"
                >
                  {key}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </View>
  );
};

import React from 'react';
import { Text } from 'react-native';
import { formatCycleTime } from '../../lib/returnPolicy';

/**
 * The rental cycle's clock time (" · 3:47 PM") as small text, nested inside a
 * date's <Text> so it inherits the date's colour. Every period boundary falls
 * at the subscription's cycle_time (the pickup time; 12:00 for older plans),
 * so a bare date never tells the rider the whole deadline.
 */
export const CycleTime: React.FC<{ cycleTime: string | null | undefined }> = ({ cycleTime }) => (
  <Text className="text-[10px] font-medium">{` · ${formatCycleTime(cycleTime)}`}</Text>
);

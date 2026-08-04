import React from "react";
import { View, Text } from "react-native";
import { CheckCircle2, Clock, Wrench } from "lucide-react-native";
import { Badge } from "./ui/Badge";
import { COLORS } from "../constants/theme";
import {
  MAINTENANCE_STATUS_LABEL,
  MAINTENANCE_STATUS_TONE,
  formatDate,
} from "../constants/status";
import type { ApiMaintenanceRecord } from "../types/api";

interface MaintenanceCardProps {
  record: ApiMaintenanceRecord;
}

/**
 * One maintenance ticket on the rider's scooter. Lifted out of the old
 * Booking History tab, which rendered it inline and dropped both timestamps.
 *
 * The vehicle name is deliberately NOT shown: every row on My Scooter is the
 * same scooter, so repeating it is noise. `description` is staff-authored free
 * text — the server scopes these to the rider's own rental window so it can't
 * expose another rider's incident.
 */
export const MaintenanceCard: React.FC<MaintenanceCardProps> = ({ record }) => {
  const resolved = record.status === "resolved";

  return (
    <View
      className="rounded-2xl p-4 border"
      style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}
    >
      <View className="flex-row items-center justify-between mb-2">
        <View className="flex-row items-center flex-1 mr-2">
          <Wrench size={15} color={COLORS.primary} />
          <Text
            style={{ color: COLORS.textSecondary }}
            className="text-xs font-semibold ml-2"
          >
            {formatDate(record.created_at)}
          </Text>
        </View>
        <Badge
          label={MAINTENANCE_STATUS_LABEL[record.status]}
          tone={MAINTENANCE_STATUS_TONE[record.status]}
        />
      </View>

      <Text
        style={{ color: COLORS.textPrimary }}
        className="text-xs font-medium leading-relaxed"
      >
        {record.description}
      </Text>

      {/* An ETA only means anything while the ticket is still open. */}
      {!resolved && record.expected_ready_at ? (
        <View className="flex-row items-center mt-2.5">
          <Clock size={12} color={COLORS.warning} />
          <Text
            style={{ color: COLORS.warning }}
            className="text-[11px] font-bold ml-2"
          >
            Expected ready {formatDate(record.expected_ready_at)}
          </Text>
        </View>
      ) : null}

      {record.resolved_at ? (
        <View className="flex-row items-center mt-2.5">
          <CheckCircle2 size={12} color={COLORS.success} />
          <Text
            style={{ color: COLORS.success }}
            className="text-[11px] font-bold ml-2"
          >
            Resolved {formatDate(record.resolved_at)}
          </Text>
        </View>
      ) : null}
    </View>
  );
};

/** Filter chips for the list above — 'all' sends no status filter to the API. */
export const MAINTENANCE_FILTERS = [
  { key: "all", label: "All" },
  { key: "reported", label: MAINTENANCE_STATUS_LABEL.reported },
  { key: "in_progress", label: MAINTENANCE_STATUS_LABEL.in_progress },
  { key: "resolved", label: MAINTENANCE_STATUS_LABEL.resolved },
] as const;

import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { AppShell } from '../../components/AppShell';
import { Badge } from '../../components/ui/Badge';
import { SkeletonList } from '../../components/ui/Skeleton';
import { ErrorState } from '../../components/ui/ErrorState';
import { EmptyState } from '../../components/ui/EmptyState';
import { pullToRefresh, useRefresh } from '../../components/ui/PullToRefresh';
import { bookingRepository } from '../../services';
import { ApiError } from '../../lib/ApiError';
import {
  BOOKING_STATUS_LABEL, BOOKING_STATUS_TONE,
  REFUND_STATUS_LABEL, REFUND_STATUS_TONE, formatDate,
} from '../../constants/status';
import { COLORS } from '../../constants/theme';
import { Calendar, Bike, MapPin, History, XCircle } from 'lucide-react-native';
import { useCancelBooking } from '../../hooks/useCancelBooking';
import type { ApiBooking } from '../../types/api';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';

/**
 * Bookings only. Maintenance used to live here in a second tab — it now
 * belongs to /my-scooter, scoped to the scooter the rider actually has.
 */
export default function BookingHistoryScreen() {
  // AppShell insets its drawer sheet but not screen content, so each screen
  // pads its own scroll tail — otherwise the Android nav/gesture bar covers
  // the last rows.
  const tabBarHeight = useBottomTabBarHeight();
  const [bookings, setBookings] = useState<ApiBooking[]>([]);
  const [bookingsLoading, setBookingsLoading] = useState(true);
  const [bookingsError, setBookingsError] = useState<string | null>(null);

  const { cancelling, cancelBooking } = useCancelBooking();

  const handleCancel = async (booking: ApiBooking) => {
    if (await cancelBooking(booking)) loadBookings();
  };

  /**
   * `background` is what a pull-to-refresh passes. It skips the skeleton
   * swap, because flipping bookingsLoading unmounts the ScrollView — and with
   * it the RefreshControl that is mid-gesture — which strands the spinner and
   * kills the rubber-band animation under the rider's finger.
   *
   * Returns the promise so useRefresh can await the real settle rather than
   * resolving instantly and blinking the spinner off.
   */
  const loadBookings = (background = false) => {
    if (!background) setBookingsLoading(true);
    setBookingsError(null);
    return bookingRepository
      .history({ page: 1, pageSize: 50 })
      .then((res) => setBookings(res.data))
      .catch((err) => setBookingsError(err instanceof ApiError ? err.message : 'Could not load your booking history.'))
      .finally(() => setBookingsLoading(false));
  };

  const { refreshing, onRefresh } = useRefresh(() => loadBookings(true));

  useEffect(() => {
    loadBookings();
  }, []);

  return (
    <AppShell title="Booking History">
      {bookingsLoading ? (
        <View className="px-5 pt-5"><SkeletonList count={3} /></View>
      ) : bookingsError ? (
        <ErrorState message={bookingsError} onRetry={() => loadBookings()} />
      ) : bookings.length === 0 ? (
        <EmptyState icon={History} title="No bookings yet" subtitle="Your booking history will show up here." />
      ) : (
        <ScrollView
          className="flex-1 px-5 pt-4"
          contentContainerStyle={{ paddingBottom: tabBarHeight + 24 }}
          refreshControl={pullToRefresh(refreshing, onRefresh)}
        >
          <View className="gap-3">
            {bookings.map((b) => (
                <View
                  key={b.id}
                  className="rounded-2xl p-5 border"
                  style={{
                    backgroundColor: COLORS.card, borderColor: COLORS.border,
                    shadowColor: COLORS.black, shadowOpacity: 0.04, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 1,
                  }}
                >
                  <View className="flex-row items-center justify-between mb-3">
                    <View className="flex-row items-center">
                      <Bike size={15} color={COLORS.primary} />
                      <Text style={{ color: COLORS.textPrimary }} className="text-sm font-semibold ml-2">{b.vehicle_model?.name ?? 'Scooter'}</Text>
                    </View>
                    <Badge label={BOOKING_STATUS_LABEL[b.status]} tone={BOOKING_STATUS_TONE[b.status]} />
                  </View>
                  <View className="flex-row items-center mb-1">
                    <Calendar size={12} color={COLORS.textSecondary} />
                    <Text style={{ color: COLORS.textSecondary }} className="text-xs font-medium ml-2">{formatDate(b.created_at)}</Text>
                  </View>
                  {b.station ? (
                    <View className="flex-row items-center">
                      <MapPin size={12} color={COLORS.textSecondary} />
                      <Text style={{ color: COLORS.textSecondary }} className="text-xs font-medium ml-2">{b.station.name}</Text>
                    </View>
                  ) : null}

                  {b.refund_status ? (
                    <View className="mt-3 pt-3 border-t" style={{ borderColor: COLORS.border }}>
                      <View className="flex-row items-center justify-between mb-1">
                        <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-semibold">
                          Cancelled {b.cancelled_at ? formatDate(b.cancelled_at) : ''}
                        </Text>
                        <Badge label={REFUND_STATUS_LABEL[b.refund_status]} tone={REFUND_STATUS_TONE[b.refund_status]} />
                      </View>
                      <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium">
                        Cancellation fee ₹{b.cancellation_penalty_amount ?? 0} · Refund ₹{b.refund_amount ?? 0}
                      </Text>
                    </View>
                  ) : null}

                  {b.status === 'pending_payment' || b.status === 'confirmed' ? (
                    <TouchableOpacity
                      onPress={() => void handleCancel(b)}
                      disabled={cancelling}
                      accessibilityRole="button"
                      className="flex-row items-center justify-center rounded-2xl py-3 mt-3"
                      style={{ backgroundColor: COLORS.danger + '0F', opacity: cancelling ? 0.6 : 1 }}
                    >
                      <XCircle size={13} color={COLORS.danger} />
                      <Text style={{ color: COLORS.danger }} className="text-xs font-bold ml-2">
                        {cancelling ? 'Cancelling…' : 'Cancel Booking'}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              ))}
          </View>
        </ScrollView>
      )}
    </AppShell>
  );
}

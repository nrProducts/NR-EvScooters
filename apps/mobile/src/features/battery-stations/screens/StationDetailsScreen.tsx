import React, { useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Linking, Platform } from 'react-native';
import { Spinner } from '../../../components/Spinner';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, BatteryCharging, Copy, Hash, MapPin, Navigation } from 'lucide-react-native';
import { COLORS } from '../../../constants/theme';
import { buildMapsUrl, buildWebMapsUrl } from '../../../lib/maps';
import { copyToClipboard } from '../../../lib/clipboard';
import { notifyError, notifySuccess } from '../../../lib/confirm';
import { ErrorState } from '../../../components/ui/ErrorState';
import { pullToRefresh, useRefresh } from '../../../components/ui/PullToRefresh';
import { StationStatusBadge } from '../components/StationStatusBadge';
import { useBatteryStation } from '../hooks/useBatteryStations';
import { formatStationName, type BatteryStation } from '../types/batteryStation.types';
import { useT } from '../../../i18n';

/** The optional full-details screen reached from the map's bottom sheet. */
export default function StationDetailsScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { t } = useT();
    const { id } = useLocalSearchParams<{ id: string }>();
    const { data: station, isLoading, isError, error, refetch } = useBatteryStation(id);
    // refetch() ignores the 60s staleTime configured on the root QueryClient,
    // so a pull always goes to the network rather than replaying cache.
    const { refreshing, onRefresh } = useRefresh(refetch);

    const copy = useCallback(async (value: string, label: string) => {
        if (await copyToClipboard(value)) {
            notifySuccess(t('stationDetail.copied', { label }), value);
        } else {
            // The value is on screen and selectable either way.
            notifyError(t('stationDetail.error.copyFailed'), value);
        }
    }, [t]);

    const navigate = useCallback(async (target: BatteryStation) => {
        const deepLink = buildMapsUrl(target.latitude, target.longitude, Platform.OS === 'ios' ? 'ios' : 'android');
        try {
            if (await Linking.canOpenURL(deepLink)) {
                await Linking.openURL(deepLink);
                return;
            }
            await Linking.openURL(buildWebMapsUrl(target.latitude, target.longitude));
        } catch {
            notifyError(t('stationDetail.error.noNavApp.title'), t('stationDetail.error.noNavApp.message'));
        }
    }, [t]);

    return (
        <View className="flex-1" style={{ backgroundColor: COLORS.background, paddingTop: insets.top }}>
            <View className="flex-row items-center px-4 py-3 border-b" style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}>
                <TouchableOpacity
                    onPress={() => (router.canGoBack() ? router.back() : router.navigate('/battery-stations'))}
                    accessibilityRole="button"
                    accessibilityLabel={t('stationDetail.goBack')}
                    className="w-10 h-10 rounded-xl items-center justify-center mr-2"
                    style={{ backgroundColor: COLORS.background }}
                >
                    <ArrowLeft size={18} color={COLORS.textPrimary} />
                </TouchableOpacity>
                <Text style={{ color: COLORS.textPrimary }} className="text-base font-extrabold flex-1" numberOfLines={1}>
                    {station ? formatStationName(station.name) : t('stationDetail.title')}
                </Text>
            </View>

            {isLoading ? (
                <View className="flex-1 items-center justify-center">
                    <Spinner size={32} color={COLORS.primary} />
                </View>
            ) : isError || !station ? (
                <ErrorState
                    message={error?.message ?? t('stationDetail.error.loadFailed')}
                    offline={error?.isOffline}
                    onRetry={() => void refetch()}
                />
            ) : (
                <ScrollView
                    className="flex-1 px-5 pt-5"
                    contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
                    showsVerticalScrollIndicator={false}
                    refreshControl={pullToRefresh(refreshing, onRefresh)}
                >
                    <View className="flex-row items-center mb-4" style={{ gap: 8 }}>
                        <StationStatusBadge status={station.status} />
                        <View
                            className="flex-row items-center px-2.5 py-1 rounded-full"
                            style={{ backgroundColor: COLORS.primary + '14' }}
                        >
                            <BatteryCharging size={12} color={COLORS.primary} />
                            <Text style={{ color: COLORS.primaryPressed }} className="text-[10px] font-black ml-1.5">
                                {t('stationDetail.batteries', { count: station.batteryCount })}
                            </Text>
                        </View>
                    </View>

                    <Card>
                        <Row icon={Hash} label={t('stationDetail.serialNumber')} value={`#${station.serialNumber}`} />
                        <Row icon={Hash} label={t('stationDetail.qisIds')} value={station.qisIds.join('\n')} />
                    </Card>

                    <Card>
                        <Row icon={MapPin} label={t('stationDetail.latitude')} value={station.latitude.toFixed(6)} />
                        <Row icon={MapPin} label={t('stationDetail.longitude')} value={station.longitude.toFixed(6)} />
                        <TouchableOpacity
                            onPress={() =>
                                void copy(
                                    `${station.latitude.toFixed(6)}, ${station.longitude.toFixed(6)}`,
                                    t('stationDetail.coordinatesLabel'),
                                )
                            }
                            accessibilityRole="button"
                            className="flex-row items-center justify-center rounded-xl mt-2"
                            style={{ backgroundColor: COLORS.background, minHeight: 44 }}
                        >
                            <Copy size={15} color={COLORS.textSecondary} />
                            <Text style={{ color: COLORS.textPrimary }} className="text-xs font-bold ml-2">
                                {t('stationDetail.copyCoordinates')}
                            </Text>
                        </TouchableOpacity>
                    </Card>

                    <TouchableOpacity
                        onPress={() => void navigate(station)}
                        accessibilityRole="button"
                        accessibilityLabel={t('stationDetail.navigateTo', { station: formatStationName(station.name) })}
                        className="flex-row items-center justify-center rounded-2xl mt-2"
                        style={{ backgroundColor: COLORS.primary, minHeight: 52 }}
                    >
                        <Navigation size={17} color={COLORS.white} />
                        <Text className="text-white font-bold text-sm ml-2">{t('stationDetail.navigate')}</Text>
                    </TouchableOpacity>
                </ScrollView>
            )}
        </View>
    );
}

const Card: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <View className="rounded-2xl p-4 mb-3" style={{ backgroundColor: COLORS.card }}>
        {children}
    </View>
);

const Row: React.FC<{ icon: any; label: string; value: string }> = ({ icon: Icon, label, value }) => (
    <View className="flex-row items-start justify-between py-1.5">
        <View className="flex-row items-center mr-4">
            <Icon size={13} color={COLORS.textSecondary} />
            <Text style={{ color: COLORS.textSecondary }} className="text-[10px] font-bold uppercase tracking-wider ml-1.5">
                {label}
            </Text>
        </View>
        {/* Selectable so the exact value can be long-pressed and copied. */}
        <Text selectable style={{ color: COLORS.textPrimary }} className="text-xs font-bold text-right flex-1">
            {value}
        </Text>
    </View>
);

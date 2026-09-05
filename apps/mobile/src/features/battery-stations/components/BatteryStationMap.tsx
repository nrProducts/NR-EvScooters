import React, { Component, Suspense, forwardRef, lazy, type ReactNode } from 'react';
import { View, Text } from 'react-native';
import { Spinner } from '../../../components/Spinner';
import { MapPinOff } from 'lucide-react-native';
import { COLORS } from '../../../constants/theme';
import { ENV } from '../../../constants/env';
import { CHENNAI, type BatteryStationMapHandle, type BatteryStationMapProps } from './mapContract';
import { translate, useLangStore, useT } from '../../../i18n';

export { CHENNAI };
export type { BatteryStationMapHandle };

/**
 * The map, loaded lazily and fenced off from the rest of the app.
 *
 * MapLibre resolves its native modules at import time
 * (TurboModuleRegistry.getEnforcing('MLRNCameraModule') runs at module scope).
 * Expo Router imports every route file to build its route tree, so a static
 * import of the map anywhere in that graph means a binary without the native
 * module — a dev client built before this feature landed, or a stale
 * production build after a rollback — fails to start *at all*, reporting
 * unrelated routes as "missing the required default export".
 *
 * Deferring the import to first render, behind an error boundary, turns that
 * from "the app is bricked" into "this one screen says the map is
 * unavailable" — while search, the station list, details and Navigate keep
 * working, since none of them touch MapLibre.
 */
const BatteryStationMapView = lazy(() => import('./BatteryStationMapView'));

export const BatteryStationMap = forwardRef<BatteryStationMapHandle, BatteryStationMapProps>(
    function BatteryStationMap(props, ref) {
        const { t } = useT();
        // Checked before the lazy import so an unconfigured build never pays
        // to load the renderer just to render a notice.
        if (!ENV.mapStyleUrl) {
            return (
                <MapNotice
                    title={t('mapControl.notConfigured.title')}
                    detail={t('mapControl.notConfigured.detail')}
                />
            );
        }

        return (
            <MapErrorBoundary>
                <Suspense fallback={<MapLoading />}>
                    <BatteryStationMapView {...props} ref={ref} />
                </Suspense>
            </MapErrorBoundary>
        );
    },
);

const MapLoading = () => (
    <View className="flex-1 items-center justify-center" style={{ backgroundColor: COLORS.gray[100] }}>
        <Spinner size={32} color={COLORS.primary} />
    </View>
);

const MapNotice: React.FC<{ title: string; detail: string }> = ({ title, detail }) => {
    const { t } = useT();
    return (
        <View className="flex-1 items-center justify-center px-10" style={{ backgroundColor: COLORS.gray[100] }}>
            <MapPinOff size={28} color={COLORS.textSecondary} />
            <Text style={{ color: COLORS.textPrimary }} className="text-base font-black mt-3 text-center">
                {title}
            </Text>
            <Text
                style={{ color: COLORS.textSecondary }}
                className="text-xs font-medium text-center mt-2 leading-relaxed"
            >
                {detail}
            </Text>
            <Text style={{ color: COLORS.textSecondary }} className="text-xs font-medium text-center mt-2">
                {t('mapControl.searchStillWorks')}
            </Text>
        </View>
    );
};

/**
 * Catches both the failed lazy import and any throw from MapLibre's own
 * render. Deliberately has no reset button: the only two causes are a missing
 * native module and a broken style, neither of which a retry can fix within
 * the same session.
 */
class MapErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
    state = { failed: false };

    static getDerivedStateFromError() {
        return { failed: true };
    }

    componentDidCatch(error: unknown) {
        console.warn('[battery-stations] map failed to render', {
            message: error instanceof Error ? error.message : String(error),
        });
    }

    render() {
        if (this.state.failed) {
            // A class component, so useT() is unavailable — reads the
            // current language directly from the store rather than through
            // the hook. This is a one-shot error fallback with no interactive
            // language switcher on screen, so it not re-rendering live on a
            // language change (it would need remounting to pick one up
            // anyway, since getDerivedStateFromError only runs once) costs
            // nothing a rider would notice.
            const lang = useLangStore.getState().lang;
            return (
                <MapNotice
                    title={translate(lang, 'mapControl.unavailable.title')}
                    detail={translate(lang, 'mapControl.unavailable.detail')}
                />
            );
        }
        return this.props.children;
    }
}

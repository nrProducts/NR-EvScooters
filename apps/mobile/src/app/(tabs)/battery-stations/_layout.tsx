import { Stack } from 'expo-router';

/**
 * The Battery Stations tab is a small stack: the full-screen map (index) and
 * a pushed station-detail screen. Both draw their own chrome, so no header.
 */
export default function BatteryStationsLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}

import { ScrollView } from 'react-native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppShell } from '../../components/AppShell';
import { ProfileContent } from '../../components/ProfileContent';

/**
 * The Profile tab — a real, deep-linkable screen wrapping the exact same
 * content the avatar-triggered sheet in AppShell shows, so nothing about
 * the profile experience diverges between "tap the avatar" and "tap the
 * Profile tab". No `onClose` here: there's no sheet to dismiss.
 */
export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();

  return (
    <AppShell title="Profile">
      <ScrollView
        className="flex-1 px-5 pt-5"
        contentContainerStyle={{ paddingBottom: insets.bottom + tabBarHeight + 24 }}
      >
        <ProfileContent />
      </ScrollView>
    </AppShell>
  );
}

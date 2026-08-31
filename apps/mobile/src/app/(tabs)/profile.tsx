import { ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppShell } from '../../components/AppShell';
import { ProfileContent } from '../../components/ProfileContent';

// The tab bar is a floating pill (see (tabs)/_layout.tsx): it sits
// insets.bottom + 16 above the screen edge and is 45 tall, so its real
// footprint is insets.bottom + 61. useBottomTabBarHeight() doesn't account
// for the 16px float gap, which left the Logout button tucked under the
// pill — measure the footprint directly instead, plus breathing room.
const TAB_PILL_FOOTPRINT = 61;

/**
 * The Profile tab — a real, deep-linkable screen wrapping the exact same
 * content the avatar-triggered sheet in AppShell shows, so nothing about
 * the profile experience diverges between "tap the avatar" and "tap the
 * Profile tab". No `onClose` here: there's no sheet to dismiss.
 */
export default function ProfileScreen() {
  const insets = useSafeAreaInsets();

  return (
    <AppShell title="Profile">
      <ScrollView
        className="flex-1 px-5 pt-5"
        contentContainerStyle={{ paddingBottom: insets.bottom + TAB_PILL_FOOTPRINT + 24 }}
      >
        <ProfileContent />
      </ScrollView>
    </AppShell>
  );
}

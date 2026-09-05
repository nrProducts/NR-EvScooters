import { ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppShell } from '../../components/AppShell';
import { ProfileContent } from '../../components/ProfileContent';
import { TAB_BAR_FOOTPRINT } from '../../lib/tabBar';
import { useT } from '../../i18n';

/**
 * The Profile tab — a real, deep-linkable screen wrapping the exact same
 * content the avatar-triggered sheet in AppShell shows, so nothing about
 * the profile experience diverges between "tap the avatar" and "tap the
 * Profile tab". No `onClose` here: there's no sheet to dismiss.
 */
export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useT();

  return (
    <AppShell title={t('profile.profile')}>
      <ScrollView
        className="flex-1 px-5 pt-5"
        contentContainerStyle={{ paddingBottom: insets.bottom + TAB_BAR_FOOTPRINT + 28 }}
      >
        <ProfileContent />
      </ScrollView>
    </AppShell>
  );
}

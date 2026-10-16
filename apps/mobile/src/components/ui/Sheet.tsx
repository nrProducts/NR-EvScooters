import React from 'react';
import { Modal, Text, TouchableOpacity, View } from 'react-native';
import { KeyboardAvoidingView, useKeyboardState } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { COLORS } from '../../constants/theme';
import { useT } from '../../i18n';

/**
 * The app's bottom-sheet chrome: dim scrim, rounded card rising from the
 * bottom, optional title row with a close button. Extracted because
 * ReturnScooterModal, the KYC prompt and the profile menu each re-declared the
 * same scrim colour, corner radius and safe-area padding.
 *
 * The card rides up above the soft keyboard, so a search box or prompt inside
 * it (SearchableSelectField, DialogSheet's prompt) never has what it shows
 * hidden underneath. keyboard-controller's KeyboardAvoidingView, not React
 * Native's: Android is edge-to-edge, so the window no longer resizes for the
 * keyboard — see the KeyboardProvider note in _layout.tsx.
 */
interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  /** Hide the X — e.g. a confirm whose only exits are its own buttons. */
  dismissible?: boolean;
  children: React.ReactNode;
}

export const Sheet: React.FC<SheetProps> = ({
  visible,
  onClose,
  title,
  dismissible = true,
  children,
}) => {
  const insets = useSafeAreaInsets();
  const { t } = useT();
  // The open keyboard already covers the navigation-bar inset; padding for
  // it as well would leave a dead strip between the card and the keyboard.
  const keyboardVisible = useKeyboardState((s) => s.isVisible);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior="padding"
        style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,0.45)' }}
      >
        {dismissible ? (
          <TouchableOpacity
            style={{ flex: 1 }}
            activeOpacity={1}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t('ui.dismiss')}
          />
        ) : (
          <View style={{ flex: 1 }} />
        )}

        <View
          style={{
            backgroundColor: COLORS.card,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            paddingBottom: 16 + (keyboardVisible ? 0 : insets.bottom),
            maxHeight: '90%',
          }}
        >
          {title ? (
            <View className="flex-row justify-between items-center px-6 pt-6 pb-1">
              <Text style={{ color: COLORS.textPrimary }} className="text-lg font-black flex-1 mr-3">
                {title}
              </Text>
              {dismissible ? (
                <TouchableOpacity
                  onPress={onClose}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.close')}
                  className="w-8 h-8 rounded-full items-center justify-center"
                  style={{ backgroundColor: COLORS.background }}
                >
                  <X size={16} color={COLORS.textSecondary} />
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}

          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

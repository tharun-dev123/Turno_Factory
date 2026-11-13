import { useState } from 'react';
import { Modal, Pressable, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { KeyboardAvoider } from '@/components/ui/KeyboardAware';
import { TextField } from '@/components/ui/TextField';
import { colors, radius, shadows } from '@/theme';

export interface ManualEntrySheetProps {
  visible: boolean;
  title?: string;
  submitLabel?: string;
  /** Error from a previous attempt (for example "Already registered") */
  error?: string | null;
  busy?: boolean;
  onSubmit: (text: string) => void;
  onClose: () => void;
}

/** Bottom sheet for typing a barcode by hand. Input goes through the same validation as a scan. */
export function ManualEntrySheet(props: ManualEntrySheetProps) {
  return (
    <Modal visible={props.visible} transparent animationType="slide" statusBarTranslucent onRequestClose={props.onClose}>
      {/* The body is mounted only while visible, so its text state starts empty on every open. */}
      {props.visible ? <ManualEntryBody {...props} /> : null}
    </Modal>
  );
}

function ManualEntryBody({
  title = 'Enter Barcode Manually',
  submitLabel = 'Register Cell',
  error,
  busy,
  onSubmit,
  onClose,
}: ManualEntrySheetProps) {
  const [text, setText] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = () => {
    if (text.trim() === '') {
      setLocalError('Enter the battery barcode.');
      return;
    }
    setLocalError(null);
    onSubmit(text);
  };

  return (
    <KeyboardAvoider style={{ flex: 1 }}>
      <Pressable accessibilityLabel="Close" onPress={onClose} style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' }}>
        <Pressable
          accessible={false}
          style={[
            { backgroundColor: colors.surface, borderTopLeftRadius: radius.xxl + 4, borderTopRightRadius: radius.xxl + 4, padding: 20, paddingBottom: 28, gap: 16 },
            shadows.dialog,
          ]}
        >
          <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.slate200 }} />
          <AppText variant="headlineMd" accessibilityRole="header">
            {title}
          </AppText>
          <AppText variant="bodyMd" color={colors.textMuted}>
            Type the battery barcode exactly as printed on the label.
          </AppText>
          <TextField
            label="Battery barcode"
            icon="keyboard"
            mono
            autoFocus
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder="Battery barcode"
            value={text}
            onChangeText={setText}
            returnKeyType="done"
            onSubmitEditing={submit}
            error={localError ?? error}
          />
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Button label="Cancel" variant="secondary" onPress={onClose} disabled={busy} style={{ flex: 1 }} />
            <Button label={submitLabel} onPress={submit} loading={busy} style={{ flex: 1.4 }} />
          </View>
        </Pressable>
      </Pressable>
    </KeyboardAvoider>
  );
}

import type { ReactNode } from 'react';
import { Modal, Pressable, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Icon, type IconName } from '@/components/ui/Icon';
import { colors, radius, shadows } from '@/theme';

export interface ConfirmDialogProps {
  visible: boolean;
  icon: IconName;
  title: string;
  /** Body text; may contain nested <AppText> for emphasis */
  message?: ReactNode;
  /** Optional details block rendered between the message and the actions */
  children?: ReactNode;
  /** Optional red warning box */
  warning?: string;
  confirmLabel: string;
  confirmIcon?: IconName;
  cancelLabel?: string;
  loading?: boolean;
  footnote?: { icon: IconName; text: string };
  onConfirm: () => void;
  onCancel: () => void;
}

/** Shared modal used by Delete Cell (06) and Logout (10) confirmations. */
export function ConfirmDialog({
  visible,
  icon,
  title,
  message,
  children,
  warning,
  confirmLabel,
  confirmIcon,
  cancelLabel = 'Cancel',
  loading,
  footnote,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dismiss = () => {
    if (!loading) onCancel();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={dismiss}>
      <Pressable
        accessibilityLabel="Dismiss dialog"
        onPress={dismiss}
        style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', padding: 24 }}
      >
        {/* Inner pressable swallows taps so touching the card does not dismiss */}
        <Pressable
          accessible={false}
          style={[
            { backgroundColor: colors.surface, borderRadius: radius.xxl + 4, padding: 24, gap: 16, alignItems: 'center' },
            shadows.dialog,
          ]}
        >
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              backgroundColor: colors.orange50,
              borderWidth: 1,
              borderColor: colors.orange100,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name={icon} size={30} color={colors.turnoOrange} />
          </View>

          <View style={{ gap: 8, alignItems: 'center' }}>
            <AppText variant="headlineMd" align="center" accessibilityRole="header">
              {title}
            </AppText>
            {message ? (
              <AppText variant="bodyMd" color={colors.textMuted} align="center" style={{ lineHeight: 22 }}>
                {message}
              </AppText>
            ) : null}
          </View>

          {children ? <View style={{ alignSelf: 'stretch' }}>{children}</View> : null}

          {warning ? (
            <View
              style={{
                alignSelf: 'stretch',
                flexDirection: 'row',
                gap: 10,
                padding: 12,
                borderRadius: radius.lg,
                backgroundColor: colors.red50,
                borderWidth: 1,
                borderColor: colors.red200,
              }}
            >
              <Icon name="warning-amber" size={20} color={colors.red600} />
              <AppText variant="bodySm" color={colors.red900} style={{ flex: 1, lineHeight: 18 }}>
                {warning}
              </AppText>
            </View>
          ) : null}

          <View style={{ alignSelf: 'stretch', flexDirection: 'row', gap: 12 }}>
            <Button label={cancelLabel} variant="secondary" onPress={dismiss} disabled={loading} style={{ flex: 1 }} />
            <Button label={confirmLabel} icon={confirmIcon} onPress={onConfirm} loading={loading} style={{ flex: 1 }} />
          </View>

          {footnote ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Icon name={footnote.icon} size={14} color={colors.slate400} />
              <AppText variant="bodySm" color={colors.textMuted}>
                {footnote.text}
              </AppText>
            </View>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

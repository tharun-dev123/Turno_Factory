import { ActivityIndicator, View } from 'react-native';

import { colors } from '@/theme';

import { AppText } from './AppText';
import { Button } from './Button';
import { Icon, type IconName } from './Icon';

export function LoadingState({ label = 'Loading...' }: { label?: string }) {
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={label} style={{ paddingVertical: 48, alignItems: 'center', gap: 12 }}>
      <ActivityIndicator size="large" color={colors.turnoOrange} />
      <AppText variant="bodyMd" color={colors.textMuted}>
        {label}
      </AppText>
    </View>
  );
}

export interface MessageStateProps {
  icon: IconName;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  tone?: 'neutral' | 'danger';
}

/** Used for empty lists, search with no results, and error states. */
export function MessageState({ icon, title, message, actionLabel, onAction, tone = 'neutral' }: MessageStateProps) {
  const danger = tone === 'danger';
  return (
    <View style={{ paddingVertical: 40, paddingHorizontal: 24, alignItems: 'center', gap: 10 }}>
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: 32,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: danger ? colors.red50 : colors.slate100,
          borderWidth: 1,
          borderColor: danger ? colors.red200 : colors.slate200,
        }}
      >
        <Icon name={icon} size={30} color={danger ? colors.red600 : colors.slate500} />
      </View>
      <AppText variant="headlineSm" align="center">
        {title}
      </AppText>
      {message ? (
        <AppText variant="bodyMd" color={colors.textMuted} align="center">
          {message}
        </AppText>
      ) : null}
      {actionLabel && onAction ? (
        <View style={{ marginTop: 8, minWidth: 160 }}>
          <Button label={actionLabel} onPress={onAction} variant={danger ? 'primary' : 'outline'} height={44} />
        </View>
      ) : null}
    </View>
  );
}

import { View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Icon, type IconName } from '@/components/ui/Icon';
import { colors, radius, shadows } from '@/theme';

export interface StatCardProps {
  label: string;
  value: string;
  caption: string;
  captionIcon: IconName;
  icon: IconName;
  /** Brand tint for the icon tile and positive-trend caption */
  accent?: boolean;
}

export function StatCard({ label, value, caption, captionIcon, icon, accent }: StatCardProps) {
  return (
    <View
      style={[
        {
          flex: 1,
          padding: 16,
          gap: 8,
          backgroundColor: colors.surface,
          borderRadius: radius.xl,
          borderWidth: 1,
          borderColor: colors.slate200,
        },
        shadows.card,
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <AppText variant="overline" color={colors.slate500} style={{ fontSize: 11 }}>
          {label}
        </AppText>
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: radius.lg,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: accent ? colors.rose50 : colors.slate100,
            borderWidth: 1,
            borderColor: accent ? colors.rose100 : colors.slate200,
          }}
        >
          <Icon name={icon} size={18} color={accent ? colors.turnoRed : colors.slate700} />
        </View>
      </View>
      <View>
        <AppText variant="headlineMd" style={{ fontFamily: 'HankenGrotesk_800ExtraBold', fontSize: 24, lineHeight: 30 }}>
          {value}
        </AppText>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
          <Icon name={captionIcon} size={14} color={accent ? colors.emerald600 : colors.slate500} />
          <AppText variant="labelMd" color={accent ? colors.emerald600 : colors.slate500} style={{ letterSpacing: 0 }}>
            {caption}
          </AppText>
        </View>
      </View>
    </View>
  );
}

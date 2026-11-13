import type { ReactNode } from 'react';
import { View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Icon, type IconName } from '@/components/ui/Icon';
import { colors, radius, shadows } from '@/theme';

/** A titled card with a red marker, used for the Section 1-3 blocks on Cell Details. */
export function DetailSection({ title, meta, children }: { title: string; meta?: string; children: ReactNode }) {
  return (
    <View style={[{ backgroundColor: colors.surface, borderRadius: radius.xxl, borderWidth: 1, borderColor: colors.slate200, overflow: 'hidden' }, shadows.card]}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          paddingHorizontal: 16,
          paddingVertical: 14,
          backgroundColor: colors.slate50,
          borderBottomWidth: 1,
          borderBottomColor: colors.slate200,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
          <View style={{ width: 5, height: 18, borderRadius: 3, backgroundColor: colors.turnoRed }} />
          <AppText variant="overline" color={colors.slate800} style={{ fontSize: 12, flex: 1 }}>
            {title}
          </AppText>
        </View>
        {meta ? (
          <AppText variant="overline" color={colors.slate400} style={{ fontSize: 11 }}>
            {meta}
          </AppText>
        ) : null}
      </View>
      {children}
    </View>
  );
}

export interface DetailRowProps {
  icon: IconName;
  label: string;
  hint?: string;
  /** Right-aligned value node (pill, number...) */
  value?: ReactNode;
  /** Full-width value under the label (barcodes) */
  below?: ReactNode;
  last?: boolean;
}

export function DetailRow({ icon, label, hint, value, below, last }: DetailRowProps) {
  return (
    <View
      style={{
        paddingHorizontal: 16,
        paddingVertical: 14,
        gap: 8,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: colors.slate100,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Icon name={icon} size={22} color={colors.slate400} />
        <View style={{ flex: 1 }}>
          <AppText variant="bodyMd" style={{ fontFamily: 'Manrope_700Bold' }}>
            {label}
          </AppText>
          {hint ? (
            <AppText variant="bodySm" color={colors.slate500}>
              {hint}
            </AppText>
          ) : null}
        </View>
        {value}
      </View>
      {below ? <View style={{ paddingLeft: 34 }}>{below}</View> : null}
    </View>
  );
}

/** Measurement value with unit; shows "Not recorded" when missing. */
export function MeasurementValue({ value, unit }: { value: number | null; unit: string }) {
  if (value === null) {
    return (
      <AppText variant="bodySm" color={colors.slate400} style={{ fontFamily: 'Manrope_600SemiBold' }}>
        Not recorded
      </AppText>
    );
  }
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
      <AppText variant="monoLg" color={colors.text} style={{ fontSize: 17 }}>
        {value}
      </AppText>
      <AppText variant="bodyMd" color={colors.slate500}>
        {unit}
      </AppText>
    </View>
  );
}

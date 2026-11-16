import { Pressable, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Icon } from '@/components/ui/Icon';
import type { CellRecord } from '@/models/cell';
import { colors, radius, shadows } from '@/theme';
import { formatSerial } from '@/utils/format';

export interface CellListItemProps {
  cell: CellRecord;
  onPress: (cell: CellRecord) => void;
}

export function CellListItem({ cell, onPress }: CellListItemProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Serial ${formatSerial(cell.serialNumber)}, barcode ${cell.batteryBarcode}`}
      onPress={() => onPress(cell)}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          padding: 14,
          backgroundColor: colors.surface,
          borderRadius: radius.xl,
          borderWidth: 1,
          borderColor: pressed ? 'rgba(253,80,0,0.4)' : colors.slate200,
          transform: [{ scale: pressed ? 0.995 : 1 }],
        },
        shadows.card,
      ]}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: radius.lg,
          backgroundColor: colors.slate100,
          borderWidth: 1,
          borderColor: colors.slate200,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name="battery-std" size={22} color={colors.slate700} />
      </View>

      <View style={{ flex: 1 }}>
        <AppText variant="monoMd" color={colors.slate700} numberOfLines={1} style={{ fontSize: 12.5 }}>
          {cell.batteryBarcode}
        </AppText>
      </View>

      <Icon name="chevron-right" size={22} color={colors.slate300} />
    </Pressable>
  );
}

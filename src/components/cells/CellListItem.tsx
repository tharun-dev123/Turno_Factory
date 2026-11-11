import { Pressable, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Icon } from '@/components/ui/Icon';
import { Pill } from '@/components/ui/Pill';
import { SyncBadge } from '@/components/ui/SyncBadge';
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
          borderColor: pressed ? 'rgba(233,39,59,0.4)' : colors.slate200,
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
        <Icon name="barcode-reader" size={20} color={colors.slate700} />
      </View>

      <View style={{ flex: 1, gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Pill label={`Serial ${formatSerial(cell.serialNumber)}`} tone="brand" square size="sm" />
          <SyncBadge status={cell.syncStatus} />
        </View>
        <AppText variant="monoMd" color={colors.slate700} numberOfLines={1} style={{ fontSize: 12.5 }}>
          {cell.batteryBarcode}
        </AppText>
      </View>

      <Icon name="chevron-right" size={22} color={colors.slate300} />
    </Pressable>
  );
}

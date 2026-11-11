import * as Clipboard from 'expo-clipboard';
import { Pressable, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Icon } from '@/components/ui/Icon';
import { Pill } from '@/components/ui/Pill';
import { useToast } from '@/components/ui/Toast';
import type { CellRecord } from '@/models/cell';
import { colors, radius } from '@/theme';
import { formatRelativeTime, formatSerial } from '@/utils/format';

export function LastScannedCard({ cell }: { cell: CellRecord | null }) {
  const toast = useToast();

  if (!cell) {
    return (
      <View style={{ paddingVertical: 14, alignItems: 'center', gap: 4 }}>
        <Icon name="qr-code-scanner" size={26} color={colors.slate300} />
        <AppText variant="bodyMd" color={colors.textMuted}>
          No cells scanned yet. Point the camera at a battery code.
        </AppText>
      </View>
    );
  }

  const copy = async () => {
    try {
      await Clipboard.setStringAsync(cell.batteryBarcode);
      toast.show('Cell ID copied');
    } catch {
      toast.show('Could not copy', 'error');
    }
  };

  const qc =
    cell.qcStatus === 'passed'
      ? { label: 'QA Approved', tone: 'success' as const, icon: 'check-circle' as const }
      : cell.qcStatus === 'failed'
        ? { label: 'QA Failed', tone: 'danger' as const, icon: 'cancel' as const }
        : { label: 'QA Pending', tone: 'neutral' as const, icon: 'schedule' as const };
  const hasTelemetry = cell.cellVoltageV !== null && cell.acirMohm !== null;

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: colors.slate100 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.emerald500 }} />
          <AppText variant="overline" color={colors.slate900} style={{ fontSize: 11 }}>
            Last scanned cell
          </AppText>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Icon name="schedule" size={13} color={colors.slate400} />
          <AppText variant="bodySm" color={colors.slate500}>
            {formatRelativeTime(cell.createdAt)}
          </AppText>
        </View>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: radius.xl, backgroundColor: colors.slate50, borderWidth: 1, borderColor: colors.slate200 }}>
        <View style={{ flex: 1, gap: 6 }}>
          <AppText variant="monoMd" color={colors.slate900} numberOfLines={1} ellipsizeMode="middle">
            {cell.batteryBarcode}
          </AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
            <Pill label={`Serial ${formatSerial(cell.serialNumber)}`} tone="brand" square size="sm" />
            <Pill label={qc.label} icon={qc.icon} tone={qc.tone} square size="sm" />
            {hasTelemetry ? <Pill label={`${cell.cellVoltageV}V • ${cell.acirMohm}mΩ`} tone="neutral" square size="sm" mono /> : null}
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Copy cell ID"
          onPress={copy}
          style={({ pressed }) => ({
            padding: 8,
            borderRadius: radius.lg,
            backgroundColor: pressed ? colors.slate100 : colors.surface,
            borderWidth: 1,
            borderColor: colors.slate200,
          })}
        >
          <Icon name="content-copy" size={18} color={colors.slate600} />
        </Pressable>
      </View>
    </View>
  );
}

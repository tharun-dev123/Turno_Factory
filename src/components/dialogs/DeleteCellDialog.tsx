import { View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { appConfig } from '@/config/appConfig';
import type { CellRecord } from '@/models/cell';
import { colors, radius } from '@/theme';
import { formatSerial } from '@/utils/format';

import { ConfirmDialog } from './ConfirmDialog';

export interface DeleteCellDialogProps {
  cell: CellRecord | null;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** 06 - Delete Cell Confirmation */
export function DeleteCellDialog({ cell, loading, onConfirm, onCancel }: DeleteCellDialogProps) {
  const location = cell
    ? [cell.lineId ? `Line #${Number(cell.lineId)}` : null, cell.cellLocalNumber ?? 'Tray position not set'].filter(Boolean).join(' • ')
    : '';

  return (
    <ConfirmDialog
      visible={cell !== null}
      icon="delete"
      title="Delete Battery Cell?"
      message={
        cell
          ? `Are you sure you want to delete this battery cell? This action will permanently remove record ${formatSerial(cell.serialNumber)} from ${appConfig.storage.name}.`
          : ''
      }
      warning="This action cannot be undone. Any associated automated test rig data links will be severed."
      confirmLabel="Delete Cell"
      confirmIcon="delete"
      loading={loading}
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
      {cell ? (
        <View style={{ padding: 14, gap: 10, borderRadius: radius.xl, backgroundColor: colors.slate50, borderWidth: 1, borderColor: colors.slate200 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <AppText variant="bodyMd" color={colors.slate500}>
              Serial Number:
            </AppText>
            <AppText variant="headlineSm">{formatSerial(cell.serialNumber)}</AppText>
          </View>
          <View style={{ height: 1, backgroundColor: colors.slate200 }} />
          <View style={{ gap: 6 }}>
            <AppText variant="bodyMd" color={colors.slate500}>
              Battery Barcode:
            </AppText>
            <View style={{ paddingHorizontal: 10, paddingVertical: 8, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.slate200 }}>
              <AppText variant="monoMd" numberOfLines={1} ellipsizeMode="middle">
                {cell.batteryBarcode}
              </AppText>
            </View>
          </View>
          <View style={{ height: 1, backgroundColor: colors.slate200 }} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <AppText variant="bodyMd" color={colors.slate500}>
              Location:
            </AppText>
            <AppText variant="bodyMd" style={{ fontFamily: 'Manrope_700Bold', flexShrink: 1, textAlign: 'right' }}>
              {location}
            </AppText>
          </View>
        </View>
      ) : null}
    </ConfirmDialog>
  );
}

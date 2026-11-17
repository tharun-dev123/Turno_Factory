import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DetailRow, DetailSection, MeasurementValue } from '@/components/cells/DetailParts';
import { VisualStatusPill } from '@/components/cells/VisualStatusPill';
import { DeleteCellDialog } from '@/components/dialogs/DeleteCellDialog';
import { AppText } from '@/components/ui/AppText';
import { BrandHeader } from '@/components/ui/BrandHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { Pill } from '@/components/ui/Pill';
import { LoadingState, MessageState } from '@/components/ui/StateViews';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/context/AuthContext';
import { useCell } from '@/hooks/useCell';
import { deleteCell } from '@/services/cellService';
import { getErrorMessage, NotFoundError } from '@/services/errors';
import { colors, radius } from '@/theme';
import { formatSerial } from '@/utils/format';

/** 04 - Cell Details */
export default function CellDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { canWrite } = useAuth();
  const { cell, state, error, retry } = useCell(id, { showKnownFirst: true });

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const copyBarcode = async () => {
    if (!cell) return;
    try {
      await Clipboard.setStringAsync(cell.batteryBarcode);
      toast.show('Battery barcode copied');
    } catch {
      toast.show('Could not copy', 'error');
    }
  };

  const onDelete = async () => {
    if (!cell) return;
    setDeleting(true);
    try {
      await deleteCell(cell.id);
      setConfirmDelete(false);
      toast.show(`Cell ${formatSerial(cell.serialNumber)} deleted`);
      router.back();
    } catch (e) {
      setConfirmDelete(false);
      if (e instanceof NotFoundError) {
        toast.show('This cell was already deleted.', 'info');
        router.back();
      } else {
        toast.show(getErrorMessage(e), 'error');
      }
    } finally {
      setDeleting(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BrandHeader>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Go back" hitSlop={10} onPress={() => router.back()} style={{ padding: 4 }}>
            <Icon name="arrow-back" size={24} color={colors.slate800} />
          </Pressable>
          <AppText variant="headlineMd" accessibilityRole="header" style={{ fontSize: 19 }}>
            Cell Details
          </AppText>
        </View>
      </BrandHeader>

      {state === 'loading' ? (
        <LoadingState label="Loading cell..." />
      ) : state === 'not_found' ? (
        <MessageState icon="search-off" title="Cell not found" message="It may have been deleted." actionLabel="Back to All Cells" onAction={() => router.back()} />
      ) : state === 'error' || !cell ? (
        <MessageState tone="danger" icon="cloud-off" title="Could not load this cell" message={error ?? undefined} actionLabel="Retry" onAction={retry} />
      ) : (
        <>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 24 }}>
            {/* Summary card */}
            <Card style={{ gap: 14, borderRadius: radius.xxl }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radius.xl, backgroundColor: colors.slate50, borderWidth: 1, borderColor: colors.slate200 }}>
                <Icon name="battery-charging-full" size={24} color={colors.turnoOrange} />
                <AppText variant="monoLg" numberOfLines={1} ellipsizeMode="middle" selectable style={{ flex: 1 }}>
                  {cell.batteryBarcode}
                </AppText>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Copy battery barcode"
                  onPress={copyBarcode}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: radius.lg,
                    borderWidth: 1,
                    borderColor: colors.slate200,
                    backgroundColor: pressed ? colors.slate100 : colors.surface,
                  })}
                >
                  <Icon name="content-copy" size={16} color={colors.slate700} />
                  <AppText variant="labelLg" color={colors.slate800} style={{ fontSize: 13 }}>
                    Copy
                  </AppText>
                </Pressable>
              </View>
            </Card>

            <DetailSection title="Cell Information">
              <DetailRow icon="tag" label="Serial Number" value={<Pill label={formatSerial(cell.serialNumber)} tone="neutral" square mono />} />
              <DetailRow
                icon="qr-code-2"
                label="Battery barcode"
                below={
                  <AppText variant="monoMd" color={colors.turnoOrange} selectable>
                    {cell.batteryBarcode}
                  </AppText>
                }
              />
              {cell.rawPayload && cell.rawPayload !== cell.batteryBarcode ? (
                <DetailRow
                  icon="data-object"
                  label="Raw scan payload"
                  below={
                    <AppText variant="monoSm" color={colors.slate600} selectable>
                      {cell.rawPayload}
                    </AppText>
                  }
                />
              ) : null}
              <DetailRow
                icon="grid-view"
                label="cell local number"
                value={
                  cell.cellLocalNumber ? (
                    <Pill label={cell.cellLocalNumber} icon="location-on" tone="neutral" mono />
                  ) : (
                    <AppText variant="bodySm" color={colors.slate400} style={{ fontFamily: 'Manrope_600SemiBold' }}>
                      Not recorded
                    </AppText>
                  )
                }
              />
              <DetailRow
                icon="military-tech"
                label="Sorting grade"
                value={cell.sortingGrade ? <Pill label={cell.sortingGrade} icon="verified" tone="success" /> : <AppText variant="bodySm" color={colors.slate400} style={{ fontFamily: 'Manrope_600SemiBold' }}>Not recorded</AppText>}
              />
              <DetailRow icon="scale" label="Cell Weight" value={<MeasurementValue value={cell.cellWeightG} unit="g" />} />
              <DetailRow icon="bolt" label="Cell Voltage (OCV)" value={<MeasurementValue value={cell.cellVoltageV} unit="V" />} />
              <DetailRow icon="graphic-eq" label="ACIR (1kHz)" value={<MeasurementValue value={cell.acirMohm} unit="mΩ" />} />
              <DetailRow icon="battery-full" label="0.5C DCh capacities" value={<MeasurementValue value={cell.dischargeCapacity05CAh} unit="Ah" />} />
              <DetailRow icon="speed" label="DCIR @20%" value={<MeasurementValue value={cell.dcir20Mohm} unit="mΩ" />} />
              <DetailRow icon="speed" label="DCIR @50%" value={<MeasurementValue value={cell.dcir50Mohm} unit="mΩ" />} />
              <DetailRow icon="speed" last label="DCIR @90%" value={<MeasurementValue value={cell.dcir90Mohm} unit="mΩ" />} />
            </DetailSection>

            <DetailSection title="Visual Inspection">
              <DetailRow icon="visibility" label="Status" value={<VisualStatusPill status={cell.visualInspectionStatus} />} last={!cell.remarks} />
              {cell.remarks ? (
                <DetailRow
                  icon="notes"
                  label="Remarks"
                  last
                  below={
                    <AppText variant="bodyMd" color={colors.slate700} selectable>
                      {cell.remarks}
                    </AppText>
                  }
                />
              ) : null}
            </DetailSection>
          </ScrollView>

          {canWrite ? (
          <View
            style={{
              flexDirection: 'row',
              gap: 12,
              paddingHorizontal: 16,
              paddingTop: 12,
              paddingBottom: insets.bottom + 12,
              backgroundColor: colors.surface,
              borderTopWidth: 1,
              borderTopColor: colors.slate200,
            }}
          >
            {/* TODO: re-enable the Delete Cell button later.
            <Button label="Delete Cell" icon="delete-outline" variant="outline" onPress={() => setConfirmDelete(true)} style={{ flex: 1 }} testID="delete-cell-button" />
            */}
            <Button
              label="Edit Cell"
              icon="edit"
              onPress={() => router.push({ pathname: '/cell/edit/[id]', params: { id: cell.id } })}
              style={{ flex: 1 }}
              testID="edit-cell-button"
            />
          </View>
          ) : null}
        </>
      )}

      <DeleteCellDialog cell={confirmDelete ? cell : null} loading={deleting} onConfirm={onDelete} onCancel={() => setConfirmDelete(false)} />
    </View>
  );
}

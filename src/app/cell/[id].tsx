import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DetailRow, DetailSection, MeasurementValue } from '@/components/cells/DetailParts';
import { DeleteCellDialog } from '@/components/dialogs/DeleteCellDialog';
import { AppText } from '@/components/ui/AppText';
import { BrandHeader } from '@/components/ui/BrandHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { Pill, type PillTone } from '@/components/ui/Pill';
import { LoadingState, MessageState } from '@/components/ui/StateViews';
import { SyncBadge } from '@/components/ui/SyncBadge';
import { useToast } from '@/components/ui/Toast';
import { appConfig } from '@/config/appConfig';
import { useCell } from '@/hooks/useCell';
import type { InspectionStatus, QcStatus } from '@/models/cell';
import { deleteCell } from '@/services/cellService';
import { getErrorMessage, NotFoundError } from '@/services/errors';
import { colors, radius } from '@/theme';
import { formatDateTime, formatSerial, INSPECTION_LABEL, QC_LABEL } from '@/utils/format';

const QC_TONE: Record<QcStatus, PillTone> = { passed: 'success', failed: 'danger', pending: 'neutral' };
const INSPECTION_TONE: Record<InspectionStatus, PillTone> = { complete: 'success', in_progress: 'warning', not_started: 'neutral' };

function StatusColumn({ label, text, tone }: { label: string; text: string; tone: PillTone }) {
  const color = tone === 'success' ? colors.emerald600 : tone === 'danger' ? colors.red600 : tone === 'warning' ? colors.amber600 : colors.slate500;
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <AppText variant="bodySm" color={colors.slate500}>
        {label}
      </AppText>
      <AppText variant="headlineSm" color={color} style={{ fontSize: 15 }}>
        {text}
      </AppText>
    </View>
  );
}

/** 04 - Cell Details */
export default function CellDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { cell, state, error, retry } = useCell(id);

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
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
            <Pressable accessibilityRole="button" accessibilityLabel="Go back" hitSlop={10} onPress={() => router.back()} style={{ padding: 4 }}>
              <Icon name="arrow-back" size={24} color={colors.slate800} />
            </Pressable>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <AppText variant="headlineMd" accessibilityRole="header" style={{ fontSize: 19 }}>
                  Cell Details
                </AppText>
                {cell ? <Pill label={formatSerial(cell.serialNumber)} tone="brand" square size="sm" /> : null}
              </View>
              <AppText variant="bodySm" color={colors.slate500}>
                {appConfig.station.name} • {appConfig.line.label}
              </AppText>
            </View>
          </View>
          {cell ? <SyncBadge status={cell.syncStatus} /> : null}
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
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
                <View style={{ width: 52, height: 52, borderRadius: radius.xl, backgroundColor: colors.rose50, borderWidth: 1, borderColor: colors.rose100, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="battery-charging-full" size={28} color={colors.turnoRed} />
                </View>
                <View style={{ flex: 1, gap: 6 }}>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
                    <Pill label={`Serial ${formatSerial(cell.serialNumber)}`} tone="neutral" square size="sm" />
                    {cell.validationMode === 'production' ? (
                      <Pill label="Verified" icon="check-circle" tone="success" size="sm" />
                    ) : (
                      <Pill label="Dev validated" icon="science" tone="warning" size="sm" />
                    )}
                    <Pill label="TURNO LINE" tone="brand" square size="sm" />
                  </View>
                  <AppText variant="bodySm" color={colors.slate500}>
                    OEM laser-etched primary barcode
                  </AppText>
                </View>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radius.xl, backgroundColor: colors.slate50, borderWidth: 1, borderColor: colors.slate200 }}>
                <Icon name="barcode-reader" size={24} color={colors.slate400} />
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

              <View style={{ height: 1, backgroundColor: colors.slate100 }} />
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <StatusColumn label="Tray Slot" text={cell.cellLocalNumber ?? '—'} tone="neutral" />
                <StatusColumn label="QC Status" text={QC_LABEL[cell.qcStatus]} tone={QC_TONE[cell.qcStatus]} />
                <StatusColumn label="Inspection" text={INSPECTION_LABEL[cell.inspectionStatus]} tone={INSPECTION_TONE[cell.inspectionStatus]} />
              </View>
            </Card>

            <DetailSection title="Section 1: Identification Information" meta={cell.rawPayload && cell.rawPayload !== cell.batteryBarcode ? '5 COLUMNS' : '4 COLUMNS'}>
              <DetailRow icon="tag" label="Serial Number" hint="System sequence ID" value={<Pill label={formatSerial(cell.serialNumber)} tone="neutral" square mono />} />
              <DetailRow
                icon="qr-code-2"
                label="电池条码 / Battery barcode"
                hint="Primary laser-etched UID"
                below={
                  <AppText variant="monoMd" color={colors.turnoRed} selectable>
                    {cell.batteryBarcode}
                  </AppText>
                }
              />
              {cell.rawPayload && cell.rawPayload !== cell.batteryBarcode ? (
                <DetailRow
                  icon="data-object"
                  label="Raw scan payload"
                  hint="Original decoded value"
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
                hint="Tray & carrier fixture position"
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
                icon="fact-check"
                last
                label="Validation"
                hint={cell.validationMode === 'production' ? 'Validated with production rules' : 'Development rules: not a production-validated registration'}
                value={<Pill label={cell.validationMode === 'production' ? 'Production' : 'Development'} tone={cell.validationMode === 'production' ? 'success' : 'warning'} size="sm" />}
              />
            </DetailSection>

            <DetailSection title="Section 2: Battery Classification" meta="1 COLUMN">
              <DetailRow
                last
                icon="military-tech"
                label="电池档位 / Sorting"
                hint="Quality threshold ranking for assembly pack"
                value={cell.sortingGrade ? <Pill label={cell.sortingGrade} icon="verified" tone="success" /> : <AppText variant="bodySm" color={colors.slate400} style={{ fontFamily: 'Manrope_600SemiBold' }}>Not recorded</AppText>}
              />
            </DetailSection>

            <DetailSection title="Section 3: Electrical & Physical Measurements" meta="7 COLUMNS">
              <DetailRow icon="scale" label="Cell Weight" hint="Net cell mass" value={<MeasurementValue value={cell.cellWeightG} unit="g" />} />
              <DetailRow icon="bolt" label="Cell Voltage (OCV)" hint="Open circuit potential" value={<MeasurementValue value={cell.cellVoltageV} unit="V" />} />
              <DetailRow icon="graphic-eq" label="ACIR (1kHz)" hint="1kHz AC internal resistance" value={<MeasurementValue value={cell.acirMohm} unit="mΩ" />} />
              <DetailRow icon="battery-full" label="0.5C DCh capacities" hint="Standard discharge rate" value={<MeasurementValue value={cell.dischargeCapacity05CAh} unit="Ah" />} />
              <DetailRow icon="speed" label="DCIR @20%" hint="Low state internal resistance" value={<MeasurementValue value={cell.dcir20Mohm} unit="mΩ" />} />
              <DetailRow icon="speed" label="DCIR @50%" hint="Mid state nominal resistance" value={<MeasurementValue value={cell.dcir50Mohm} unit="mΩ" />} />
              <DetailRow icon="speed" last label="DCIR @90%" hint="High state nominal resistance" value={<MeasurementValue value={cell.dcir90Mohm} unit="mΩ" />} />
            </DetailSection>

            <View style={{ alignItems: 'center', gap: 2, paddingTop: 4 }}>
              <AppText variant="bodySm" color={colors.slate400}>
                Synced with {appConfig.storage.name} • Turno Battery QA Line
              </AppText>
              <AppText variant="bodySm" color={colors.slate400}>
                Last updated: {formatDateTime(cell.updatedAt)} • Station: {cell.stationId ?? '—'}
              </AppText>
            </View>
          </ScrollView>

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
            <Button label="Delete Cell" icon="delete-outline" variant="outline" onPress={() => setConfirmDelete(true)} style={{ flex: 1 }} testID="delete-cell-button" />
            <Button
              label="Edit Cell"
              icon="edit"
              onPress={() => router.push({ pathname: '/cell/edit/[id]', params: { id: cell.id } })}
              style={{ flex: 1 }}
              testID="edit-cell-button"
            />
          </View>
        </>
      )}

      <DeleteCellDialog cell={confirmDelete ? cell : null} loading={deleting} onConfirm={onDelete} onCancel={() => setConfirmDelete(false)} />
    </View>
  );
}

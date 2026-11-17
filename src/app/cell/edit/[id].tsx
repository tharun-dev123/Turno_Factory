import { useLocalSearchParams, usePreventRemove, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ConfirmDialog } from '@/components/dialogs/ConfirmDialog';
import { DetailSection } from '@/components/cells/DetailParts';
import { RescanModal } from '@/components/scanner/RescanModal';
import { AppText } from '@/components/ui/AppText';
import { BrandHeader } from '@/components/ui/BrandHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { KeyboardAvoider, KeyboardAwareScrollView, useKeyboardVisible } from '@/components/ui/KeyboardAware';
import { Pill } from '@/components/ui/Pill';
import { SelectField } from '@/components/ui/SelectField';
import { LoadingState, MessageState } from '@/components/ui/StateViews';
import { TextField } from '@/components/ui/TextField';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/context/AuthContext';
import { useCell } from '@/hooks/useCell';
import { useCellForm, type CellFormValues } from '@/hooks/useCellForm';
import { MAX_REMARKS_LENGTH, REMARKS_REQUIRED_STATUSES, VISUAL_INSPECTION_STATUSES, type CellRecord, type VisualInspectionStatus } from '@/models/cell';
import { colors, radius } from '@/theme';
import { formatSerial } from '@/utils/format';

function Unit({ text }: { text: string }) {
  return (
    <AppText variant="bodyMd" color={colors.slate400}>
      {text}
    </AppText>
  );
}

interface MeasurementFieldProps {
  label: string;
  unit: string;
  field: keyof CellFormValues;
  values: CellFormValues;
  errors: Record<string, string>;
  setField: <K extends keyof CellFormValues>(key: K, value: CellFormValues[K]) => void;
}

function MeasurementField({ label, unit, field, values, errors, setField }: MeasurementFieldProps) {
  return (
    <View style={{ padding: 12, gap: 8, borderRadius: radius.xl, backgroundColor: colors.slate50, borderWidth: 1, borderColor: colors.slate100 }}>
      <AppText variant="bodyMd" color={colors.slate700} style={{ fontFamily: 'Manrope_600SemiBold' }}>
        {label}
      </AppText>
      <TextField
        mono
        keyboardType="decimal-pad"
        value={values[field] as string}
        onChangeText={(text) => setField(field, text as never)}
        right={<Unit text={unit} />}
        error={errors[field]}
        placeholder="Not recorded"
        accessibilityLabel={label}
        returnKeyType="done"
      />
    </View>
  );
}

/** `latestVersion` is the newest version the app has seen. When it is ahead of `cell`, the form is out of date. */
function EditForm({ cell, latestVersion }: { cell: CellRecord; latestVersion: number }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const keyboardVisible = useKeyboardVisible();
  const toast = useToast();
  const { values, setField, pendingBarcode, setPendingBarcode, errors, formError, dirty, saving, save } = useCellForm(cell);

  const [rescanOpen, setRescanOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);

  // Guard against losing unsaved changes (header back, Cancel, hardware back).
  const disablePrevention = usePreventRemove(dirty, () => setDiscardOpen(true));

  const leave = () => {
    disablePrevention();
    router.back();
  };

  const onSave = async () => {
    const saved = await save();
    if (saved) {
      toast.show(`Cell ${formatSerial(saved.serialNumber)} updated`);
      leave();
    }
  };

  const confirmDiscard = () => {
    setDiscardOpen(false);
    leave();
  };

  const onCancel = () => router.back(); // prevented (and confirmed) automatically when dirty

  const barcodeShown = pendingBarcode?.barcode ?? cell.batteryBarcode;

  return (
    <KeyboardAvoider style={{ flex: 1 }}>
      <BrandHeader>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Pressable accessibilityRole="button" accessibilityLabel="Go back" hitSlop={10} onPress={() => router.back()} style={{ padding: 4 }}>
              <Icon name="arrow-back" size={24} color={colors.slate800} />
            </Pressable>
            <AppText variant="headlineMd" accessibilityRole="header" style={{ fontSize: 19 }}>
              Edit Cell
            </AppText>
          </View>
          {dirty ? <Pill label="Unsaved Changes" tone="warning" dot /> : null}
        </View>
      </BrandHeader>

      <KeyboardAwareScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 24 }}>
        {latestVersion > cell.version ? (
          <View accessibilityRole="alert" style={{ flexDirection: 'row', gap: 8, alignItems: 'center', padding: 12, borderRadius: radius.lg, backgroundColor: colors.amber50, borderWidth: 1, borderColor: colors.amber200 }}>
            <Icon name="info-outline" size={18} color={colors.amber800} />
            <AppText variant="bodySm" color={colors.amber800} style={{ flex: 1 }}>
              This cell was updated by someone else. Go back and reopen it to edit the latest values, or saving will be refused.
            </AppText>
          </View>
        ) : null}

        {formError ? (
          <View accessibilityRole="alert" style={{ flexDirection: 'row', gap: 8, alignItems: 'center', padding: 12, borderRadius: radius.lg, backgroundColor: colors.red50, borderWidth: 1, borderColor: colors.red200 }}>
            <Icon name="error-outline" size={18} color={colors.red600} />
            <AppText variant="bodySm" color={colors.red900} style={{ flex: 1 }}>
              {formError}
            </AppText>
          </View>
        ) : null}

        {/* Summary card (same layout as Cell Details; Rescan replaces Copy) */}
        <Card style={{ gap: 10, borderRadius: radius.xxl }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radius.xl, backgroundColor: colors.slate50, borderWidth: 1, borderColor: colors.slate200 }}>
            <Icon name="battery-charging-full" size={24} color={colors.turnoOrange} />
            <AppText variant="monoLg" numberOfLines={1} ellipsizeMode="middle" selectable style={{ flex: 1 }}>
              {barcodeShown}
            </AppText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Rescan battery barcode"
              onPress={() => setRescanOpen(true)}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: radius.lg,
                borderWidth: 1,
                borderColor: colors.orange200,
                backgroundColor: pressed ? colors.orange100 : colors.orange50,
              })}
            >
              <Icon name="qr-code-scanner" size={16} color={colors.turnoOrange} />
              <AppText variant="labelLg" color={colors.turnoOrange} style={{ fontSize: 13 }}>
                Rescan
              </AppText>
            </Pressable>
          </View>
          {pendingBarcode ? (
            <AppText variant="bodySm" color={colors.slate500}>
              Barcode will change when you save. Duplicates are rejected.
            </AppText>
          ) : null}
        </Card>

        <DetailSection title="Cell Information">
          <View style={{ padding: 16, gap: 14 }}>
            <View style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <AppText variant="labelLg" style={{ fontSize: 14 }}>
                  Serial Number
                </AppText>
                <Icon name="lock" size={14} color={colors.slate400} />
              </View>
              <TextField mono editable={false} readOnlyLook value={formatSerial(cell.serialNumber)} right={<Icon name="verified-user" size={18} color={colors.slate400} />} accessibilityLabel="Serial number (read-only)" />
            </View>

            <TextField
              label="Cell Local Number"
              mono
              autoCapitalize="characters"
              autoCorrect={false}
              value={values.cellLocalNumber}
              onChangeText={(text) => setField('cellLocalNumber', text)}
              placeholder="Not recorded"
              error={errors.cellLocalNumber}
              right={<Icon name="grid-view" size={20} color={colors.slate400} />}
            />

            <MeasurementField label="Cell Weight" unit="g" field="cellWeightG" values={values} errors={errors} setField={setField} />
            <MeasurementField label="Cell Voltage (OCV)" unit="V" field="cellVoltageV" values={values} errors={errors} setField={setField} />
            <MeasurementField label="ACIR (1kHz)" unit="mΩ" field="acirMohm" values={values} errors={errors} setField={setField} />
            <MeasurementField label="0.5C DCh capacities" unit="Ah" field="dischargeCapacity05CAh" values={values} errors={errors} setField={setField} />
            <MeasurementField label="DCIR @20%" unit="mΩ" field="dcir20Mohm" values={values} errors={errors} setField={setField} />
            <MeasurementField label="DCIR @50%" unit="mΩ" field="dcir50Mohm" values={values} errors={errors} setField={setField} />
            <MeasurementField label="DCIR @90%" unit="mΩ" field="dcir90Mohm" values={values} errors={errors} setField={setField} />
          </View>
        </DetailSection>

        <DetailSection title="Visual Inspection">
          <View style={{ padding: 16, gap: 14 }}>
            <SelectField
              label="Cell Status"
              value={values.visualInspectionStatus}
              options={VISUAL_INSPECTION_STATUSES}
              allowClear={false}
              error={errors.visualInspectionStatus}
              onChange={(status) => status && setField('visualInspectionStatus', status as VisualInspectionStatus)}
            />
            <TextField
              label={REMARKS_REQUIRED_STATUSES.includes(values.visualInspectionStatus) ? 'Remarks (required)' : 'Remarks'}
              multiline
              maxLength={MAX_REMARKS_LENGTH}
              value={values.remarks}
              onChangeText={(text) => setField('remarks', text)}
              placeholder={REMARKS_REQUIRED_STATUSES.includes(values.visualInspectionStatus) ? 'Describe the issue' : 'Optional'}
              error={errors.remarks}
              accessibilityLabel="Remarks"
            />
          </View>
        </DetailSection>
      </KeyboardAwareScrollView>

      <View
        style={{
          flexDirection: 'row',
          gap: 12,
          paddingHorizontal: 16,
          paddingTop: 12,
          // The keyboard covers the system navigation bar area, so the extra inset is only needed when it is closed.
          paddingBottom: (keyboardVisible ? 0 : insets.bottom) + 12,
          backgroundColor: colors.surface,
          borderTopWidth: 1,
          borderTopColor: colors.slate200,
        }}
      >
        <Button label="Cancel" icon="close" variant="outline" onPress={onCancel} disabled={saving} style={{ flex: 1 }} testID="edit-cancel-button" />
        <Button label="Save Changes" icon="save" onPress={onSave} loading={saving} disabled={!dirty} style={{ flex: 1.3 }} testID="edit-save-button" />
      </View>

      <RescanModal
        visible={rescanOpen}
        cellId={cell.id}
        onClose={() => setRescanOpen(false)}
        onPicked={(picked) => {
          setPendingBarcode({ rawPayload: picked.rawPayload, barcode: picked.barcode, source: picked.source });
          setRescanOpen(false);
        }}
      />

      <ConfirmDialog
        visible={discardOpen}
        icon="edit-off"
        title="Discard changes?"
        message="You have unsaved changes to this cell. If you leave now they will be lost."
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        onConfirm={confirmDiscard}
        onCancel={() => setDiscardOpen(false)}
      />
    </KeyboardAvoider>
  );
}

/** 05 - Edit Cell */
export default function EditCellScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { status, canWrite } = useAuth();
  // Open instantly from the last known copy; the latest copy loads in the background.
  const { cell, state, error, retry } = useCell(id, { showKnownFirst: true });

  // The form is built once, from the first copy it sees. A later background refresh must never replace it:
  // that would change the fields under the user's fingers and the version their save is checked against.
  const [formCell, setFormCell] = useState<CellRecord | null>(null);
  if (cell && (formCell === null || formCell.id !== cell.id)) setFormCell(cell);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {status === 'loading' ? (
        <LoadingState label="Loading..." />
      ) : !canWrite ? (
        <MessageState icon="lock-outline" title="Read-only access" message="Your account can view cells but cannot edit them." actionLabel="Back" onAction={() => router.back()} />
      ) : state === 'loading' ? (
        <LoadingState label="Loading cell..." />
      ) : state === 'not_found' ? (
        <MessageState icon="search-off" title="Cell not found" message="It may have been deleted." actionLabel="Back" onAction={() => router.back()} />
      ) : state === 'error' || !cell || !formCell ? (
        <MessageState tone="danger" icon="cloud-off" title="Could not load this cell" message={error ?? undefined} actionLabel="Retry" onAction={retry} />
      ) : (
        <EditForm key={formCell.id} cell={formCell} latestVersion={cell.version} />
      )}
    </View>
  );
}

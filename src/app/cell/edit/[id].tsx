import { useLocalSearchParams, usePreventRemove, useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ConfirmDialog } from '@/components/dialogs/ConfirmDialog';
import { RescanModal } from '@/components/scanner/RescanModal';
import { AppText } from '@/components/ui/AppText';
import { BrandHeader } from '@/components/ui/BrandHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Pill } from '@/components/ui/Pill';
import { SelectField } from '@/components/ui/SelectField';
import { LoadingState, MessageState } from '@/components/ui/StateViews';
import { TextField } from '@/components/ui/TextField';
import { useToast } from '@/components/ui/Toast';
import { appConfig } from '@/config/appConfig';
import { useCell } from '@/hooks/useCell';
import { useCellForm, type CellFormValues } from '@/hooks/useCellForm';
import type { CellRecord } from '@/models/cell';
import { colors, radius } from '@/theme';
import { formatSerial } from '@/utils/format';

function Unit({ text }: { text: string }) {
  return (
    <AppText variant="bodyMd" color={colors.slate400}>
      {text}
    </AppText>
  );
}

function SectionTitle({ icon, title, meta }: { icon: IconName; title: string; meta: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.slate100 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
        <Icon name={icon} size={20} color={colors.turnoRed} />
        <AppText variant="overline" color={colors.slate800} style={{ fontSize: 12, flex: 1 }}>
          {title}
        </AppText>
      </View>
      <AppText variant="bodySm" color={colors.slate400}>
        {meta}
      </AppText>
    </View>
  );
}

interface MeasurementFieldProps {
  label: string;
  unit: string;
  field: keyof CellFormValues;
  values: CellFormValues;
  errors: Record<string, string>;
  tag?: string;
  setField: <K extends keyof CellFormValues>(key: K, value: CellFormValues[K]) => void;
}

function MeasurementField({ label, unit, field, values, errors, tag, setField }: MeasurementFieldProps) {
  return (
    <View style={{ padding: 12, gap: 8, borderRadius: radius.xl, backgroundColor: colors.slate50, borderWidth: 1, borderColor: colors.slate100 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <AppText variant="bodyMd" color={colors.slate700} style={{ fontFamily: 'Manrope_600SemiBold' }}>
          {label}
        </AppText>
        {tag ? <Pill label={tag} tone="neutral" square size="sm" /> : null}
      </View>
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

function EditForm({ cell }: { cell: CellRecord }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
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
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <BrandHeader>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
            <Pressable accessibilityRole="button" accessibilityLabel="Go back" hitSlop={10} onPress={() => router.back()} style={{ padding: 4 }}>
              <Icon name="arrow-back" size={24} color={colors.slate800} />
            </Pressable>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <AppText variant="headlineMd" accessibilityRole="header" style={{ fontSize: 19 }}>
                  Edit Cell {formatSerial(cell.serialNumber)}
                </AppText>
                <Pill label="TURNO" tone="brand" square size="sm" />
              </View>
              <AppText variant="bodySm" color={colors.slate500}>
                {appConfig.station.name} • {appConfig.line.label}
              </AppText>
            </View>
          </View>
          {dirty ? <Pill label="Unsaved Changes" tone="warning" dot /> : null}
        </View>
      </BrandHeader>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.xxl }}>
          <View style={{ width: 44, height: 44, borderRadius: radius.lg, backgroundColor: colors.rose50, borderWidth: 1, borderColor: colors.rose100, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="sync" size={22} color={colors.turnoRed} />
          </View>
          <View style={{ flex: 1 }}>
            <AppText variant="bodyMd" style={{ fontFamily: 'Manrope_700Bold' }}>
              {appConfig.dataMode === 'mock' ? 'Local Mock Storage Active' : 'Live Production Sync Active'}
            </AppText>
            <AppText variant="bodySm" color={colors.slate500} numberOfLines={1}>
              Record {formatSerial(cell.serialNumber)} via {appConfig.storage.name}
            </AppText>
          </View>
          <Pill label={appConfig.storage.statusOnline} tone="success" dot size="sm" />
        </Card>

        {formError ? (
          <View accessibilityRole="alert" style={{ flexDirection: 'row', gap: 8, alignItems: 'center', padding: 12, borderRadius: radius.lg, backgroundColor: colors.red50, borderWidth: 1, borderColor: colors.red200 }}>
            <Icon name="error-outline" size={18} color={colors.red600} />
            <AppText variant="bodySm" color={colors.red900} style={{ flex: 1 }}>
              {formError}
            </AppText>
          </View>
        ) : null}

        <Card style={{ gap: 14, borderRadius: radius.xxl }}>
          <SectionTitle icon="qr-code-2" title="1. Identity & Origin" meta="Sheet Fields 1–4" />

          <View style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <AppText variant="labelLg" style={{ fontSize: 14 }}>
                Serial Number
              </AppText>
              <Icon name="lock" size={14} color={colors.slate400} />
              <AppText variant="bodySm" color={colors.slate400} style={{ marginLeft: 'auto' }}>
                Read-only locked identifier
              </AppText>
            </View>
            <TextField mono editable={false} readOnlyLook value={formatSerial(cell.serialNumber)} right={<Icon name="verified-user" size={18} color={colors.slate400} />} accessibilityLabel="Serial number (read-only)" />
          </View>

          <View style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <AppText variant="labelLg" style={{ fontSize: 14 }}>
                电池条码 / Battery Barcode
              </AppText>
              {pendingBarcode ? (
                <Pill label="New barcode" icon="edit" tone="brand" size="sm" />
              ) : cell.validationMode === 'production' ? (
                <Pill label="Validated" icon="check-circle" tone="success" size="sm" />
              ) : (
                <Pill label="Dev validated" icon="science" tone="warning" size="sm" />
              )}
            </View>
            <TextField
              mono
              editable={false}
              readOnlyLook
              value={barcodeShown}
              accessibilityLabel="Battery barcode (use Rescan to change)"
              right={
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Rescan battery barcode"
                  onPress={() => setRescanOpen(true)}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                    paddingHorizontal: 10,
                    paddingVertical: 7,
                    borderRadius: radius.lg,
                    borderWidth: 1,
                    borderColor: colors.rose200,
                    backgroundColor: pressed ? colors.rose100 : colors.rose50,
                  })}
                >
                  <Icon name="qr-code-scanner" size={16} color={colors.turnoRed} />
                  <AppText variant="labelLg" color={colors.turnoRed} style={{ fontSize: 13 }}>
                    Rescan
                  </AppText>
                </Pressable>
              }
            />
            <AppText variant="bodySm" color={colors.slate400}>
              {pendingBarcode ? 'Barcode will change when you save. Duplicates are rejected.' : 'Scan again or type a new barcode with Rescan.'}
            </AppText>
          </View>

          <SelectField
            label="电池档位 / Sorting Grade"
            value={values.sortingGrade}
            options={appConfig.sortingGrades}
            placeholder="Not set"
            error={errors.sortingGrade}
            onChange={(grade) => setField('sortingGrade', grade)}
          />

          <TextField
            label="Cell Local Number (Tray Position)"
            mono
            autoCapitalize="characters"
            autoCorrect={false}
            value={values.cellLocalNumber}
            onChangeText={(text) => setField('cellLocalNumber', text)}
            placeholder="Not recorded"
            error={errors.cellLocalNumber}
            right={<Icon name="grid-view" size={20} color={colors.slate400} />}
          />
        </Card>

        <Card style={{ gap: 14, borderRadius: radius.xxl }}>
          <SectionTitle icon="bolt" title="2. Physical & Electrical Measurements" meta="Sheet Fields 5–11" />
          <MeasurementField label="Cell Weight" unit="g" field="cellWeightG" values={values} errors={errors} setField={setField} />
          <MeasurementField label="Cell Voltage (OCV)" unit="V" field="cellVoltageV" values={values} errors={errors} setField={setField} />
          <MeasurementField label="ACIR (1kHz)" unit="mΩ" field="acirMohm" values={values} errors={errors} setField={setField} />
          <MeasurementField label="0.5C DCh capacities" unit="Ah" field="dischargeCapacity05CAh" values={values} errors={errors} setField={setField} />

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Icon name="show-chart" size={18} color={colors.slate500} />
              <AppText variant="overline" color={colors.slate700} style={{ fontSize: 12 }}>
                DC Internal Resistance Profiles
              </AppText>
            </View>
            <AppText variant="bodySm" color={colors.slate400}>
              Multi-SOC Curve
            </AppText>
          </View>
          <MeasurementField label="DCIR @20%" tag="Low SOC" unit="mΩ" field="dcir20Mohm" values={values} errors={errors} setField={setField} />
          <MeasurementField label="DCIR @50%" tag="Nominal" unit="mΩ" field="dcir50Mohm" values={values} errors={errors} setField={setField} />
          <MeasurementField label="DCIR @90%" tag="High SOC" unit="mΩ" field="dcir90Mohm" values={values} errors={errors} setField={setField} />
        </Card>
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
    </KeyboardAvoidingView>
  );
}

/** 05 - Edit Cell */
export default function EditCellScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { cell, state, error, retry } = useCell(id);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {state === 'loading' ? (
        <LoadingState label="Loading cell..." />
      ) : state === 'not_found' ? (
        <MessageState icon="search-off" title="Cell not found" message="It may have been deleted." actionLabel="Back" onAction={() => router.back()} />
      ) : state === 'error' || !cell ? (
        <MessageState tone="danger" icon="cloud-off" title="Could not load this cell" message={error ?? undefined} actionLabel="Retry" onAction={retry} />
      ) : (
        <EditForm key={cell.id} cell={cell} />
      )}
    </View>
  );
}

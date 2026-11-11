import { CameraView, useCameraPermissions } from 'expo-camera';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { CameraPermissionView } from '@/components/scanner/CameraPermissionView';
import { LastScannedCard } from '@/components/scanner/LastScannedCard';
import { ManualEntrySheet } from '@/components/scanner/ManualEntrySheet';
import { ScanResultCard } from '@/components/scanner/ScanResultCard';
import { FRAME_SIZES, ScannerFrame, type FrameSizeIndex } from '@/components/scanner/ScannerFrame';
import { AppText } from '@/components/ui/AppText';
import { BrandHeader } from '@/components/ui/BrandHeader';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Pill } from '@/components/ui/Pill';
import { appConfig, getScannerBarcodeTypes } from '@/config/appConfig';
import { useScanner } from '@/hooks/useScanner';
import type { CellRecord } from '@/models/cell';
import { getLatestCell, getStats } from '@/services/cellService';
import { colors, radius, shadows } from '@/theme';

/** 07 - QR Scanner (+ 08 feedback states shown in the bottom card) */
export default function ScanScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();

  const [focused, setFocused] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const [frameSize, setFrameSize] = useState<FrameSizeIndex>(1);
  const [autofocus, setAutofocus] = useState<'on' | 'off'>('on');
  const [manualOpen, setManualOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const [latest, setLatest] = useState<CellRecord | null>(null);
  const [todayCount, setTodayCount] = useState<number | null>(null);
  const [cardHeight, setCardHeight] = useState(220);

  const refreshSummary = useCallback(async () => {
    try {
      const [latestCell, stats] = await Promise.all([getLatestCell(), getStats()]);
      setLatest(latestCell);
      setTodayCount(stats.addedToday);
    } catch {
      // The summary is informational; scanning must keep working.
    }
  }, []);

  const { result, processing, handleCode, dismissResult } = useScanner(
    useCallback(
      (cell: CellRecord) => {
        setLatest(cell);
        void refreshSummary();
      },
      [refreshSummary],
    ),
  );

  // Only run the camera while this tab is visible.
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      void refreshSummary();
      return () => {
        setFocused(false);
        setTorchOn(false);
      };
    }, [refreshSummary]),
  );

  // Re-trigger autofocus on tap (iOS exposes this; Android keeps continuous autofocus).
  const focusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (focusTimer.current && clearTimeout(focusTimer.current)), []);
  const onTapToFocus = () => {
    setAutofocus('off');
    if (focusTimer.current) clearTimeout(focusTimer.current);
    focusTimer.current = setTimeout(() => setAutofocus('on'), 80);
  };

  const permissionGranted = permission?.granted === true;
  const scanning = focused && permissionGranted && !cameraError;

  const onBarcode = useCallback(
    ({ data }: { data: string }) => {
      void handleCode(data, 'scan');
    },
    [handleCode],
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.scannerBackdrop }}>
      <BrandHeader>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back to All Cells"
              hitSlop={8}
              onPress={() => router.navigate('/(tabs)/cells')}
              style={{ padding: 4 }}
            >
              <Icon name="arrow-back" size={22} color={colors.slate700} />
            </Pressable>
            <View style={{ width: 30, height: 30, borderRadius: radius.md, backgroundColor: colors.turnoRed, alignItems: 'center', justifyContent: 'center' }}>
              <AppText variant="headlineSm" color="#FFFFFF" style={{ fontFamily: 'HankenGrotesk_800ExtraBold' }}>
                T
              </AppText>
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <AppText variant="headlineSm" style={{ fontSize: 14 }}>
                  TURNO
                </AppText>
                <AppText variant="bodySm" color={colors.slate300}>
                  •
                </AppText>
                <AppText variant="headlineSm" color={colors.slate800} style={{ fontSize: 14 }} numberOfLines={1}>
                  {appConfig.station.name}
                </AppText>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Pill label={appConfig.line.label} tone="brand" square size="sm" />
                <AppText variant="bodySm" color={colors.slate500} style={{ fontSize: 10 }} numberOfLines={1}>
                  {appConfig.line.description}
                </AppText>
              </View>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <IconButton
              icon={torchOn ? 'flashlight-on' : 'flashlight-off'}
              accessibilityLabel={torchOn ? 'Turn torch off' : 'Turn torch on'}
              active={torchOn}
              size={34}
              onPress={() => setTorchOn((v) => !v)}
              disabled={facing === 'front'}
            />
            <IconButton
              icon="crop-free"
              accessibilityLabel="Change scan frame size"
              size={34}
              onPress={() => setFrameSize((s) => ((s + 1) % FRAME_SIZES.length) as FrameSizeIndex)}
            />
            <IconButton
              icon="flip-camera-ios"
              accessibilityLabel="Switch camera"
              size={34}
              onPress={() => {
                setFacing((f) => (f === 'back' ? 'front' : 'back'));
                setTorchOn(false);
              }}
            />
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingTop: 10 }}>
          <Pill label={`Today: ${todayCount ?? '—'} Cells Scanned`} tone="neutral" dot />
          <Pill label={appConfig.scanner.formatHint} tone={appConfig.validationMode === 'development' ? 'warning' : 'neutral'} icon="verified-user" />
          <Pill label="Tap screen to focus" tone="neutral" icon="center-focus-strong" />
        </ScrollView>
      </BrandHeader>

      <View style={{ flex: 1 }}>
        {scanning ? (
          <Pressable accessibilityLabel="Camera preview. Tap to focus." style={StyleSheet.absoluteFill} onPress={onTapToFocus}>
            <CameraView
              style={{ flex: 1 }}
              facing={facing}
              enableTorch={torchOn}
              autofocus={autofocus}
              barcodeScannerSettings={{ barcodeTypes: getScannerBarcodeTypes() }}
              onBarcodeScanned={onBarcode}
              onMountError={(e) => setCameraError(e.message || 'The camera could not start.')}
            />
          </Pressable>
        ) : null}

        {/* Darken the preview so the reticle and cards stay readable */}
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: scanning ? 'rgba(2,6,23,0.35)' : 'transparent' }]} />

        {permission === null ? null : !permissionGranted ? (
          <CameraPermissionView
            status={permission.status === 'denied' ? 'denied' : 'undetermined'}
            canAskAgain={permission.canAskAgain}
            onRequest={() => void requestPermission()}
          />
        ) : cameraError ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 }}>
            <Icon name="videocam-off" size={36} color="#FFFFFF" />
            <AppText variant="headlineSm" color="#FFFFFF" align="center">
              Camera unavailable
            </AppText>
            <AppText variant="bodyMd" color={colors.slate300} align="center">
              {cameraError} You can still register a cell by entering the barcode manually.
            </AppText>
          </View>
        ) : (
          <View pointerEvents="box-none" style={{ flex: 1, justifyContent: 'center', paddingBottom: cardHeight + 12 }}>
            {scanning ? <ScannerFrame sizeIndex={frameSize} hint={appConfig.scanner.alignHint} processing={processing} /> : null}
          </View>
        )}

        <View
          onLayout={(e) => setCardHeight(e.nativeEvent.layout.height)}
          style={{ position: 'absolute', left: 12, right: 12, bottom: 12 }}
        >
          {result ? (
            <ScanResultCard result={result} onNext={dismissResult} />
          ) : (
            <View style={[{ backgroundColor: colors.surface, borderRadius: radius.xxl, padding: 14, gap: 10, borderWidth: 1, borderColor: colors.slate200 }, shadows.dialog]}>
              <LastScannedCard cell={latest} />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Enter barcode manually"
                onPress={() => setManualOpen(true)}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  height: 46,
                  borderRadius: radius.xl,
                  borderWidth: 1,
                  borderColor: colors.slate300,
                  backgroundColor: pressed ? colors.slate50 : colors.surface,
                })}
              >
                <Icon name="keyboard" size={20} color={colors.slate600} />
                <AppText variant="labelLg" color={colors.slate800} style={{ fontSize: 14 }}>
                  Enter Barcode Manually
                </AppText>
              </Pressable>
            </View>
          )}
        </View>
      </View>

      <ManualEntrySheet
        visible={manualOpen}
        busy={processing}
        onClose={() => setManualOpen(false)}
        onSubmit={(text) => {
          setManualOpen(false);
          void handleCode(text, 'manual');
        }}
      />
    </View>
  );
}

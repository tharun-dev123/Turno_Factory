import { CameraView, useCameraPermissions } from 'expo-camera';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useAuth } from '@/context/AuthContext';

import { CameraPermissionView } from '@/components/scanner/CameraPermissionView';
import { ManualEntrySheet } from '@/components/scanner/ManualEntrySheet';
import { ScanResultCard } from '@/components/scanner/ScanResultCard';
import { FRAME_SIZES, ScannerFrame, type FrameSizeIndex } from '@/components/scanner/ScannerFrame';
import { scannerLabel } from '@/components/scanner/scannerLabel';
import { AppText } from '@/components/ui/AppText';
import { BrandHeader } from '@/components/ui/BrandHeader';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Pill } from '@/components/ui/Pill';
import { TurnoLogo } from '@/components/ui/TurnoLogo';
import { getScannerBarcodeTypes } from '@/config/appConfig';
import { useScanFeedback } from '@/hooks/useScanFeedback';
import { useScanner, type ScannerStatus } from '@/hooks/useScanner';
import { getStats } from '@/services/cellService';
import { MessageState } from '@/components/ui/StateViews';
import { colors, radius, shadows } from '@/theme';

/** Camera dimming per state: dark while scanning, a brief colour tint on a result. */
const OVERLAY: Record<ScannerStatus, string> = {
  ready: 'rgba(2,6,23,0.35)',
  checking: 'rgba(15,23,42,0.45)',
  success: 'rgba(4,120,87,0.45)',
  duplicate: 'rgba(146,64,14,0.40)',
  invalid: 'rgba(127,29,29,0.45)',
  error: 'rgba(127,29,29,0.45)',
};

/** Scanning registers new cells, which only an Admin may do. Viewers get a read-only notice instead. */
export default function ScanScreen() {
  const { status, canWrite } = useAuth();
  if (status === 'loading') return null;
  if (!canWrite) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <BrandHeader>
          <TurnoLogo height={28} />
        </BrandHeader>
        <MessageState icon="lock-outline" title="Read-only access" message="Your account can view cells but cannot register new ones." />
      </View>
    );
  }
  return <ScannerScreen />;
}

/** 07 - QR Scanner (+ 08 feedback states shown in the bottom card) */
function ScannerScreen() {
  const [permission, requestPermission] = useCameraPermissions();

  const [focused, setFocused] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [frameSize, setFrameSize] = useState<FrameSizeIndex>(1);
  const [autofocus, setAutofocus] = useState<'on' | 'off'>('on');
  const [manualOpen, setManualOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const [cardHeight, setCardHeight] = useState(220);

  const [todayCount, setTodayCount] = useState<number | null>(null);

  const feedback = useScanFeedback();
  const onRegistered = useCallback(() => setTodayCount((n) => (n === null ? n : n + 1)), []);
  const { result, status, paused, processing, checkingPayload, autoContinueMs, handleCode, dismissResult } = useScanner({
    feedback,
    onRegistered,
  });

  // After a cell is registered (scanned or typed), open its Edit Cell page so the operator can enter the cell info
  // straight away. The result card is cleared first: it would otherwise still be on screen, with the scanner
  // paused, when the operator comes back. Back, Cancel and Save all return here, ready for the next scan.
  const router = useRouter();
  const openedFor = useRef<string | null>(null);
  useEffect(() => {
    if (result?.kind !== 'success') return;
    if (openedFor.current === result.cell.id) return;
    openedFor.current = result.cell.id;
    dismissResult();
    router.push({ pathname: '/cell/edit/[id]', params: { id: result.cell.id } });
  }, [result, dismissResult, router]);

  // Only run the camera while this tab is visible; refresh today's count on each visit.
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      let cancelled = false;
      getStats()
        .then((stats) => {
          if (!cancelled) setTodayCount(stats.addedToday);
        })
        .catch(() => undefined); // the counter is informational; scanning must keep working
      return () => {
        cancelled = true;
        setFocused(false);
        setTorchOn(false);
      };
    }, []),
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
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <TurnoLogo height={28} />
            <Pill label={`Today: ${todayCount ?? '—'}`} tone="neutral" dot />
          </View>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <IconButton
              icon={torchOn ? 'flashlight-on' : 'flashlight-off'}
              accessibilityLabel={torchOn ? 'Turn torch off' : 'Turn torch on'}
              active={torchOn}
              size={34}
              onPress={() => setTorchOn((v) => !v)}
            />
            <IconButton
              icon="crop-free"
              accessibilityLabel="Change scan frame size"
              size={34}
              onPress={() => setFrameSize((s) => ((s + 1) % FRAME_SIZES.length) as FrameSizeIndex)}
            />
          </View>
        </View>
      </BrandHeader>

      <View style={{ flex: 1 }}>
        {scanning ? (
          <Pressable accessibilityLabel="Camera preview. Tap to focus." style={StyleSheet.absoluteFill} onPress={onTapToFocus}>
            <CameraView
              style={{ flex: 1 }}
              facing="back"
              enableTorch={torchOn}
              autofocus={autofocus}
              barcodeScannerSettings={{ barcodeTypes: getScannerBarcodeTypes() }}
              // Paused while a code is checked or a result is shown, so a result can't be overwritten.
              onBarcodeScanned={paused ? undefined : onBarcode}
              onMountError={(e) => setCameraError(e.message || 'The camera could not start.')}
            />
          </Pressable>
        ) : null}

        {/* Darken the preview so the reticle and cards stay readable */}
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: scanning ? OVERLAY[status] : 'transparent' }]} />

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
            {scanning ? <ScannerFrame sizeIndex={frameSize} status={status} label={scannerLabel(status, result, checkingPayload)} /> : null}
          </View>
        )}

        <View
          onLayout={(e) => setCardHeight(e.nativeEvent.layout.height)}
          style={{ position: 'absolute', left: 12, right: 12, bottom: 12 }}
        >
          {result ? (
            <ScanResultCard result={result} onNext={dismissResult} autoContinueMs={autoContinueMs} />
          ) : (
            <View style={[{ backgroundColor: colors.surface, borderRadius: radius.xxl, padding: 14, gap: 10, borderWidth: 1, borderColor: colors.slate200 }, shadows.dialog]}>
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

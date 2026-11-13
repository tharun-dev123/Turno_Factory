import { CameraView, useCameraPermissions } from 'expo-camera';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { CameraPermissionView } from '@/components/scanner/CameraPermissionView';
import { ManualEntrySheet } from '@/components/scanner/ManualEntrySheet';
import { ScanResultCard } from '@/components/scanner/ScanResultCard';
import { FRAME_SIZES, ScannerFrame, type FrameSizeIndex } from '@/components/scanner/ScannerFrame';
import { AppText } from '@/components/ui/AppText';
import { BrandHeader } from '@/components/ui/BrandHeader';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { TurnoLogo } from '@/components/ui/TurnoLogo';
import { appConfig, getScannerBarcodeTypes } from '@/config/appConfig';
import { useScanner } from '@/hooks/useScanner';
import { colors, radius, shadows } from '@/theme';

/** 07 - QR Scanner (+ 08 feedback states shown in the bottom card) */
export default function ScanScreen() {
  const [permission, requestPermission] = useCameraPermissions();

  const [focused, setFocused] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [frameSize, setFrameSize] = useState<FrameSizeIndex>(1);
  const [autofocus, setAutofocus] = useState<'on' | 'off'>('on');
  const [manualOpen, setManualOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const [cardHeight, setCardHeight] = useState(220);

  const { result, processing, handleCode, dismissResult } = useScanner();

  // Only run the camera while this tab is visible.
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => {
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
          <TurnoLogo height={28} />
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

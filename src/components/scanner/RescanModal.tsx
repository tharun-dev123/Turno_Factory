import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { KeyboardAvoider, useKeyboardVisible } from '@/components/ui/KeyboardAware';
import { TextField } from '@/components/ui/TextField';
import { appConfig, getScannerBarcodeTypes } from '@/config/appConfig';
import type { ScanSource } from '@/models/cell';
import { checkBarcodeAvailable } from '@/services/cellService';
import { getErrorMessage } from '@/services/errors';
import { colors, radius } from '@/theme';

import { CameraPermissionView } from './CameraPermissionView';
import { ScannerFrame } from './ScannerFrame';

export interface RescanModalProps {
  visible: boolean;
  /** Cell being edited; its own barcode is not treated as a duplicate */
  cellId: string;
  onClose: () => void;
  onPicked: (value: { rawPayload: string; barcode: string; source: ScanSource }) => void;
}

/** Full-screen rescan used by Edit Cell ("Rescan" next to the barcode). Also allows typing the barcode. */
export function RescanModal({ visible, cellId, onClose, onPicked }: RescanModalProps) {
  const insets = useSafeAreaInsets();
  const keyboardVisible = useKeyboardVisible();
  const [permission, requestPermission] = useCameraPermissions();
  const [torchOn, setTorchOn] = useState(false);
  const [manualText, setManualText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const busy = useRef(false);
  const lastPayload = useRef<string | null>(null);

  const evaluate = async (rawPayload: string, source: ScanSource) => {
    if (busy.current) return;
    if (source === 'scan' && lastPayload.current === rawPayload) return;
    lastPayload.current = rawPayload;
    busy.current = true;
    setChecking(true);
    try {
      const availability = await checkBarcodeAvailable(rawPayload, cellId);
      if (availability.ok) {
        setError(null);
        setManualText('');
        onPicked({ rawPayload, barcode: availability.barcode, source });
      } else {
        setError(availability.message);
      }
    } catch (e) {
      setError(getErrorMessage(e));
      lastPayload.current = null;
    } finally {
      busy.current = false;
      setChecking(false);
    }
  };

  const close = () => {
    setError(null);
    setManualText('');
    setTorchOn(false);
    lastPayload.current = null;
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent onRequestClose={close}>
      <KeyboardAvoider style={{ flex: 1, backgroundColor: colors.scannerBackdrop }}>
        {visible && permission?.granted ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            enableTorch={torchOn}
            barcodeScannerSettings={{ barcodeTypes: getScannerBarcodeTypes() }}
            onBarcodeScanned={({ data }) => void evaluate(data, 'scan')}
          />
        ) : null}
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(2,6,23,0.4)' }]} />

        <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <IconButton icon="close" accessibilityLabel="Close rescan" onPress={close} />
          <AppText variant="headlineSm" color="#FFFFFF">
            Rescan battery barcode
          </AppText>
          <IconButton
            icon={torchOn ? 'flashlight-on' : 'flashlight-off'}
            accessibilityLabel={torchOn ? 'Turn torch off' : 'Turn torch on'}
            active={torchOn}
            onPress={() => setTorchOn((v) => !v)}
          />
        </View>

        {!permission ? null : !permission.granted ? (
          <CameraPermissionView
            status={permission.status === 'denied' ? 'denied' : 'undetermined'}
            canAskAgain={permission.canAskAgain}
            onRequest={() => void requestPermission()}
          />
        ) : (
          <View style={{ flex: 1, justifyContent: 'center' }}>
            <ScannerFrame sizeIndex={1} status={checking ? 'checking' : 'ready'} label={checking ? 'CHECKING…' : appConfig.scanner.alignHint} />
          </View>
        )}

        <View
          style={{
            margin: 12,
            marginBottom: (keyboardVisible ? 0 : insets.bottom) + 12,
            padding: 14,
            gap: 12,
            borderRadius: radius.xxl,
            backgroundColor: colors.surface,
          }}
        >
          {error ? (
            <View accessibilityRole="alert" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: radius.lg, backgroundColor: colors.red50, borderWidth: 1, borderColor: colors.red200 }}>
              <Icon name="error-outline" size={18} color={colors.red600} />
              <AppText variant="bodySm" color={colors.red900} style={{ flex: 1 }}>
                {error}
              </AppText>
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10 }}>
            <TextField
              containerStyle={{ flex: 1 }}
              mono
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder="Or type the barcode"
              value={manualText}
              onChangeText={setManualText}
              returnKeyType="done"
              onSubmitEditing={() => manualText.trim() && void evaluate(manualText, 'manual')}
              accessibilityLabel="Type barcode manually"
            />
            <Button label="Use" onPress={() => void evaluate(manualText, 'manual')} disabled={manualText.trim() === ''} loading={checking} style={{ width: 84 }} />
          </View>
          <Pressable accessibilityRole="button" onPress={close} style={{ alignSelf: 'center', padding: 4 }}>
            <AppText variant="labelLg" color={colors.slate500}>
              Cancel
            </AppText>
          </Pressable>
        </View>
      </KeyboardAvoider>
    </Modal>
  );
}

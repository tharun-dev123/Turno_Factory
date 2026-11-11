import { Linking, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { colors } from '@/theme';

export interface CameraPermissionViewProps {
  /** `undetermined` -> ask; `denied` -> explain how to enable in settings */
  status: 'undetermined' | 'denied';
  canAskAgain: boolean;
  onRequest: () => void;
}

export function CameraPermissionView({ status, canAskAgain, onRequest }: CameraPermissionViewProps) {
  const blocked = status === 'denied' && !canAskAgain;
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 }}>
      <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="camera-alt" size={34} color="#FFFFFF" />
      </View>
      <AppText variant="headlineMd" color="#FFFFFF" align="center">
        Camera access needed
      </AppText>
      <AppText variant="bodyMd" color={colors.slate300} align="center">
        {blocked
          ? 'Camera permission is turned off. Open Settings and allow camera access for Turno Battery Scanner to scan battery codes.'
          : 'Allow camera access so the app can scan the code on each battery cell.'}
      </AppText>
      <View style={{ alignSelf: 'stretch', marginTop: 8 }}>
        {blocked ? (
          <Button label="Open Settings" icon="settings" onPress={() => void Linking.openSettings()} />
        ) : (
          <Button label="Allow Camera" icon="camera-alt" onPress={onRequest} />
        )}
      </View>
    </View>
  );
}

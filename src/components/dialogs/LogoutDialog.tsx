import { View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Icon } from '@/components/ui/Icon';
import { appConfig } from '@/config/appConfig';
import { colors, radius } from '@/theme';

import { ConfirmDialog } from './ConfirmDialog';

export interface LogoutDialogProps {
  visible: boolean;
  username: string | null;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** 10 - Logout Confirmation */
export function LogoutDialog({ visible, username, loading, onConfirm, onCancel }: LogoutDialogProps) {
  return (
    <ConfirmDialog
      visible={visible}
      icon="logout"
      title="Log Out of Terminal?"
      message={
        <>
          Are you sure you want to log out of{' '}
          <AppText variant="bodyMd" color={colors.text} style={{ fontFamily: 'Manrope_700Bold' }}>
            {appConfig.station.name} ({appConfig.line.label})
          </AppText>
          ? Any unsynced local buffer scans will be flushed to {appConfig.storage.name} before closing.
        </>
      }
      confirmLabel="Log Out"
      confirmIcon="power-settings-new"
      loading={loading}
      footnote={{ icon: 'lock-reset', text: 'Buffer lock & safe session tear-down enabled' }}
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          paddingVertical: 10,
          paddingHorizontal: 12,
          borderRadius: radius.full,
          backgroundColor: colors.slate50,
          borderWidth: 1,
          borderColor: colors.slate200,
        }}
      >
        <Icon name="badge" size={18} color={colors.turnoRed} />
        <AppText variant="bodySm" color={colors.slate700} numberOfLines={1} style={{ flexShrink: 1 }}>
          Active Operator: {username ?? '—'} • Station: {appConfig.station.id}
        </AppText>
      </View>
    </ConfirmDialog>
  );
}

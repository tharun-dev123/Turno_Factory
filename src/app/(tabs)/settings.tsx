import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { LogoutDialog } from '@/components/dialogs/LogoutDialog';
import { AppText } from '@/components/ui/AppText';
import { BrandHeader } from '@/components/ui/BrandHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Pill } from '@/components/ui/Pill';
import { useToast } from '@/components/ui/Toast';
import { TurnoLogo } from '@/components/ui/TurnoLogo';
import { appConfig } from '@/config/appConfig';
import { useAuth } from '@/context/AuthContext';
import { getErrorMessage } from '@/services/errors';
import { colors, radius } from '@/theme';

function InfoRow({ icon, label, value, mono }: { icon: IconName; label: string; value: string; mono?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 }}>
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: radius.lg,
          backgroundColor: colors.slate50,
          borderWidth: 1,
          borderColor: colors.slate200,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name={icon} size={20} color={colors.slate700} />
      </View>
      <View style={{ flex: 1 }}>
        <AppText variant="bodySm" color={colors.slate400} style={{ fontSize: 13 }}>
          {label}
        </AppText>
        <AppText variant={mono ? 'monoMd' : 'bodyMd'} color={colors.text} style={mono ? { fontSize: 13.5 } : { fontFamily: 'Manrope_600SemiBold' }}>
          {value}
        </AppText>
      </View>
    </View>
  );
}

/** 09 - Settings & Preferences */
export default function SettingsScreen() {
  const router = useRouter();
  const toast = useToast();
  const { session, signOut } = useAuth();
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const onLogout = async () => {
    setSigningOut(true);
    try {
      await signOut();
      setConfirmVisible(false);
      router.replace('/login');
    } catch (error) {
      toast.show(getErrorMessage(error), 'error');
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BrandHeader>
        <View style={{ gap: 12 }}>
          <TurnoLogo height={28} />
          <AppText variant="headlineMd" accessibilityRole="header" style={{ fontFamily: 'HankenGrotesk_800ExtraBold', fontSize: 22 }}>
            Settings & Preferences
          </AppText>
        </View>
      </BrandHeader>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        <Card style={{ borderRadius: radius.xxl, paddingVertical: 8 }}>
          <InfoRow icon="badge" label="Signed in as" value={session?.username ?? '—'} />
          <InfoRow icon="storage" label="Data source" value={`${appConfig.storage.name} (${appConfig.dataMode})`} />
        </Card>

        <Card style={{ gap: 4, borderRadius: radius.xxl }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: radius.lg,
                backgroundColor: colors.slate50,
                borderWidth: 1,
                borderColor: colors.slate200,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name="info-outline" size={22} color={colors.slate700} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="bodySm" color={colors.slate400} style={{ fontSize: 13 }}>
                Application Version
              </AppText>
              <AppText variant="monoMd" color={colors.text} style={{ fontSize: 13.5 }}>
                v{appConfig.version}-{appConfig.environmentLabel.toLowerCase()} (Build {appConfig.buildNumber})
              </AppText>
            </View>
            <Pill label={appConfig.environmentLabel} tone="neutral" square />
          </View>

          <View style={{ height: 1, backgroundColor: colors.slate100, marginVertical: 12 }} />

          <Button
            label="Log Out of Terminal"
            icon="logout"
            variant="outlineDanger"
            onPress={() => setConfirmVisible(true)}
            testID="logout-button"
          />
        </Card>
      </ScrollView>

      <LogoutDialog
        visible={confirmVisible}
        username={session?.username ?? null}
        loading={signingOut}
        onConfirm={onLogout}
        onCancel={() => setConfirmVisible(false)}
      />
    </View>
  );
}

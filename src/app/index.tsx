import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Animated, Easing, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { Icon } from '@/components/ui/Icon';
import { TurnoLogo } from '@/components/ui/TurnoLogo';
import { appConfig } from '@/config/appConfig';
import { useAuth } from '@/context/AuthContext';
import { colors, radius } from '@/theme';

/** Minimum time the splash is visible so the progress bar can finish. */
const MIN_SPLASH_MS = 1600;

/** 01 - Splash Screen */
export default function SplashScreenRoute() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { status } = useAuth();
  const [progress] = useState(() => new Animated.Value(0));
  const [minTimeElapsed, setMinTimeElapsed] = useState(false);

  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: MIN_SPLASH_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
    const timer = setTimeout(() => setMinTimeElapsed(true), MIN_SPLASH_MS);
    return () => clearTimeout(timer);
  }, [progress]);

  // Leave the splash once the animation finished and the stored session has been checked.
  useEffect(() => {
    if (!minTimeElapsed || status === 'loading') return;
    router.replace(status === 'authenticated' ? '/(tabs)/cells' : '/login');
  }, [minTimeElapsed, status, router]);

  const width = progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <View style={{ flex: 1, backgroundColor: '#F7F5F6', paddingTop: insets.top, paddingBottom: insets.bottom + 16 }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 16 }}>
        <View
          style={{
            width: 264,
            height: 148,
            borderRadius: 32,
            backgroundColor: colors.surface,
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: colors.turnoRed,
            shadowOpacity: 0.16,
            shadowRadius: 24,
            shadowOffset: { width: 0, height: 10 },
            elevation: 6,
            marginBottom: 20,
          }}
        >
          <TurnoLogo height={72} />
        </View>

        <AppText variant="headlineLg" align="center" style={{ fontSize: 30 }}>
          {appConfig.appName}
        </AppText>
        <AppText variant="bodyLg" color={colors.textMuted} align="center" style={{ fontSize: 15 }}>
          {appConfig.tagline}
        </AppText>

        <View
          accessibilityRole="progressbar"
          accessibilityLabel="Starting up"
          style={{ alignSelf: 'stretch', height: 5, borderRadius: 3, backgroundColor: colors.slate200, overflow: 'hidden', marginTop: 12 }}
        >
          <Animated.View style={{ width, height: '100%', backgroundColor: colors.turnoRed, borderRadius: 3 }} />
        </View>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            paddingHorizontal: 14,
            paddingVertical: 8,
            borderRadius: radius.full,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.slate200,
          }}
        >
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.turnoRed }} />
          <AppText variant="labelMd" color={colors.turnoRed} style={{ fontSize: 11, letterSpacing: 0.8 }}>
            INIT PROTOCOL BUS • READY
          </AppText>
        </View>
      </View>

      <View style={{ alignItems: 'center', gap: 10 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            paddingHorizontal: 14,
            paddingVertical: 8,
            borderRadius: radius.full,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.slate200,
          }}
        >
          <Icon name="sync" size={16} color={colors.turnoRed} />
          <AppText variant="bodyMd" color={colors.slate800}>
            {appConfig.storage.name} Sync
          </AppText>
          <AppText variant="labelMd" color={colors.success}>
            • {appConfig.storage.statusOnline}
          </AppText>
          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.emerald500 }} />
        </View>
        <AppText variant="bodySm" color={colors.textMuted}>
          {appConfig.footerTagline} • v{appConfig.version}
        </AppText>
      </View>
    </View>
  );
}

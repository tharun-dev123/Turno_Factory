import { Redirect } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';

import { AppTabBar } from '@/components/ui/AppTabBar';
import { useAuth } from '@/context/AuthContext';
import { colors } from '@/theme';

export default function TabsLayout() {
  const { status } = useAuth();

  // Auth gate: signed-out users go to Login.
  if (status === 'unauthenticated') return <Redirect href="/login" />;
  if (status === 'loading') return null;

  return (
    <Tabs
      tabBar={(props) => <AppTabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.background } }}
    >
      <Tabs.Screen name="cells" options={{ title: 'All Cells' }} />
      <Tabs.Screen name="scan" options={{ title: 'Scan' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}

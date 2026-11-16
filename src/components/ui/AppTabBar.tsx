import { Pressable, View } from 'react-native';
import type { BottomTabBarProps } from 'expo-router/js-tabs';

import { colors, TAB_BAR_HEIGHT } from '@/theme';

import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';

const ICONS: Record<string, { icon: IconName; label: string }> = {
  cells: { icon: 'inventory-2', label: 'All Cells' },
  scan: { icon: 'qr-code-scanner', label: 'Scan' },
  settings: { icon: 'settings', label: 'Settings' },
};

const INACTIVE = colors.textMuted;

/** Bottom navigation: All Cells | Scan (elevated) | Settings, as in the Stitch design. */
export function AppTabBar({ state, emitter, navigateToTab, insets }: BottomTabBarProps) {

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-around',
        height: TAB_BAR_HEIGHT + insets.bottom,
        paddingBottom: insets.bottom,
        paddingHorizontal: 16,
        backgroundColor: colors.surface,
        borderTopWidth: 1,
        borderTopColor: colors.slate200,
      }}
    >
      {state.routes.map((route, index) => {
        const meta = ICONS[route.name];
        if (!meta) return null;
        const focused = state.index === index;

        const onPress = () => {
          const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigateToTab(route.key);
        };

        if (route.name === 'scan') {
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityLabel="Scan"
              accessibilityState={{ selected: focused }}
              onPress={onPress}
              style={{ alignItems: 'center', marginTop: -26, minWidth: 72 }}
            >
              <View
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 28,
                  backgroundColor: colors.turnoOrange,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 4,
                  borderColor: colors.surface,
                  shadowColor: colors.turnoOrange,
                  shadowOpacity: 0.4,
                  shadowRadius: 10,
                  shadowOffset: { width: 0, height: 6 },
                  elevation: 8,
                }}
              >
                <Icon name="qr-code-scanner" size={28} color="#FFFFFF" />
              </View>
              <AppText variant="labelSm" color={focused ? colors.turnoOrange : colors.slate700} style={{ fontSize: 11, marginTop: 2 }}>
                Scan
              </AppText>
            </Pressable>
          );
        }

        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityLabel={meta.label}
            accessibilityState={{ selected: focused }}
            onPress={onPress}
            style={{ alignItems: 'center', justifyContent: 'center', minWidth: 72, height: TAB_BAR_HEIGHT }}
          >
            <Icon name={meta.icon} size={24} color={focused ? colors.turnoOrange : INACTIVE} />
            <AppText
              variant="labelSm"
              color={focused ? colors.turnoOrange : INACTIVE}
              style={{ fontSize: 11, marginTop: 2, fontFamily: focused ? 'HankenGrotesk_700Bold' : 'HankenGrotesk_500Medium' }}
            >
              {meta.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

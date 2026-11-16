import { useEffect, useState } from 'react';
import { ActivityIndicator, Animated, Easing, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Icon, type IconName } from '@/components/ui/Icon';
import type { ScannerStatus } from '@/hooks/useScanner';
import { colors } from '@/theme';

export const FRAME_SIZES = [208, 256, 304] as const;
export type FrameSizeIndex = 0 | 1 | 2;

export interface ScannerFrameProps {
  sizeIndex: FrameSizeIndex;
  status: ScannerStatus;
  /** Text in the pill under the frame (state-specific, e.g. "REGISTERED #007") */
  label: string;
}

interface StatusStyle {
  /** Corner brackets */
  accent: string;
  /** Thin inner border and tint */
  inner: string;
  tint: string;
  /** Large icon shown in the middle of the frame (results only) */
  icon: IconName | null;
  /** Dot in the label pill */
  dot: string;
  laser: boolean;
}

/**
 * Colour per state. "Ready" keeps the Turno red scan line of the Stitch design but uses white corners, so red
 * no longer reads as "error"; results switch the whole frame to green / amber / red.
 */
const STATUS_STYLES: Record<ScannerStatus, StatusStyle> = {
  ready: { accent: '#FFFFFF', inner: 'rgba(255,255,255,0.28)', tint: 'rgba(255,255,255,0.03)', icon: null, dot: colors.turnoOrange, laser: true },
  checking: { accent: colors.blue400, inner: 'rgba(96,165,250,0.45)', tint: 'rgba(59,130,246,0.10)', icon: null, dot: colors.blue400, laser: false },
  success: { accent: colors.emerald500, inner: 'rgba(16,185,129,0.6)', tint: 'rgba(16,185,129,0.22)', icon: 'check-circle', dot: colors.emerald500, laser: false },
  duplicate: { accent: colors.amber500, inner: 'rgba(245,158,11,0.6)', tint: 'rgba(245,158,11,0.18)', icon: 'warning', dot: colors.amber500, laser: false },
  invalid: { accent: colors.red600, inner: 'rgba(220,38,38,0.6)', tint: 'rgba(220,38,38,0.18)', icon: 'error', dot: colors.red600, laser: false },
  error: { accent: colors.red600, inner: 'rgba(220,38,38,0.6)', tint: 'rgba(220,38,38,0.18)', icon: 'cloud-off', dot: colors.red600, laser: false },
};

const CORNER = 40;
const BORDER = 4;

function Corner({ position, color }: { position: 'tl' | 'tr' | 'bl' | 'br'; color: string }) {
  const top = position.startsWith('t');
  const left = position.endsWith('l');
  return (
    <View
      style={{
        position: 'absolute',
        [top ? 'top' : 'bottom']: -6,
        [left ? 'left' : 'right']: -6,
        width: CORNER,
        height: CORNER,
        borderColor: color,
        [top ? 'borderTopWidth' : 'borderBottomWidth']: BORDER,
        [left ? 'borderLeftWidth' : 'borderRightWidth']: BORDER,
        [`border${top ? 'Top' : 'Bottom'}${left ? 'Left' : 'Right'}Radius`]: 12,
        shadowColor: color,
        shadowOpacity: 0.6,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 0 },
      }}
    />
  );
}

/** Targeting reticle whose colour, icon and label follow the scanner state. Guidance only. */
export function ScannerFrame({ sizeIndex, status, label }: ScannerFrameProps) {
  const size = FRAME_SIZES[sizeIndex];
  const style = STATUS_STYLES[status];
  const [laser] = useState(() => new Animated.Value(0));
  const [pop] = useState(() => new Animated.Value(1));

  // Scan line only while waiting for a code.
  useEffect(() => {
    if (!style.laser) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(laser, { toValue: 1, duration: 2200, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
        Animated.timing(laser, { toValue: 0, duration: 2200, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [laser, style.laser]);

  // Small "pop" of the result icon when a result appears.
  useEffect(() => {
    if (!style.icon) return;
    pop.setValue(0.6);
    Animated.spring(pop, { toValue: 1, friction: 5, tension: 140, useNativeDriver: true }).start();
  }, [pop, style.icon, status]);

  const translateY = laser.interpolate({ inputRange: [0, 1], outputRange: [8, size - 12] });

  return (
    <View style={{ alignItems: 'center' }} pointerEvents="none">
      <View style={{ width: size, height: size }} testID={`scanner-frame-${status}`}>
        <Corner position="tl" color={style.accent} />
        <Corner position="tr" color={style.accent} />
        <Corner position="bl" color={style.accent} />
        <Corner position="br" color={style.accent} />
        <View
          style={{
            flex: 1,
            borderRadius: 8,
            borderWidth: status === 'ready' ? 1 : 2,
            borderColor: style.inner,
            backgroundColor: style.tint,
            overflow: 'hidden',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {status === 'ready' ? (
            <>
              <View style={{ position: 'absolute', opacity: 0.4, alignItems: 'center', justifyContent: 'center' }}>
                <View style={{ width: 32, height: 1, backgroundColor: '#FFFFFF' }} />
                <View style={{ height: 32, width: 1, backgroundColor: '#FFFFFF', position: 'absolute' }} />
              </View>
              <View style={{ position: 'absolute', opacity: 0.15 }}>
                <Icon name="qr-code-2" size={size * 0.38} color="#FFFFFF" />
              </View>
            </>
          ) : null}

          {status === 'checking' ? <ActivityIndicator size="large" color={colors.blue400} /> : null}

          {style.icon ? (
            <Animated.View
              style={{
                width: size * 0.38,
                height: size * 0.38,
                borderRadius: size * 0.19,
                backgroundColor: 'rgba(255,255,255,0.95)',
                alignItems: 'center',
                justifyContent: 'center',
                transform: [{ scale: pop }],
              }}
            >
              <Icon name={style.icon} size={size * 0.3} color={style.accent} />
            </Animated.View>
          ) : null}

          {style.laser ? (
            <Animated.View
              style={{
                position: 'absolute',
                left: 12,
                right: 12,
                top: 0,
                height: 2.5,
                borderRadius: 2,
                backgroundColor: colors.turnoOrange,
                shadowColor: colors.turnoOrange,
                shadowOpacity: 0.9,
                shadowRadius: 8,
                shadowOffset: { width: 0, height: 0 },
                transform: [{ translateY }],
              }}
            />
          ) : null}
        </View>
      </View>

      <View
        accessibilityLiveRegion="polite"
        accessibilityLabel={`Scanner status: ${label}`}
        style={{
          marginTop: 18,
          maxWidth: size + 40,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingHorizontal: 14,
          paddingVertical: 6,
          borderRadius: 999,
          backgroundColor: 'rgba(15,23,42,0.9)',
          borderWidth: 1,
          borderColor: style.inner,
        }}
      >
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: style.dot }} />
        <AppText variant="labelSm" color="#FFFFFF" numberOfLines={1} style={{ letterSpacing: 1.4, flexShrink: 1 }}>
          {label}
        </AppText>
      </View>
    </View>
  );
}

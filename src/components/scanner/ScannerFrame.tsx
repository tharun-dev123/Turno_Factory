import { useEffect, useState } from 'react';
import { ActivityIndicator, Animated, Easing, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Icon } from '@/components/ui/Icon';
import { colors } from '@/theme';

export const FRAME_SIZES = [208, 256, 304] as const;
export type FrameSizeIndex = 0 | 1 | 2;

export interface ScannerFrameProps {
  sizeIndex: FrameSizeIndex;
  hint: string;
  processing: boolean;
}

const CORNER = 40;
const BORDER = 4;

function Corner({ position }: { position: 'tl' | 'tr' | 'bl' | 'br' }) {
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
        borderColor: colors.turnoRed,
        [top ? 'borderTopWidth' : 'borderBottomWidth']: BORDER,
        [left ? 'borderLeftWidth' : 'borderRightWidth']: BORDER,
        [`border${top ? 'Top' : 'Bottom'}${left ? 'Left' : 'Right'}Radius`]: 12,
        shadowColor: colors.turnoRed,
        shadowOpacity: 0.5,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 0 },
      }}
    />
  );
}

/** Targeting reticle with animated laser line (Stitch scanner design). Guidance only. */
export function ScannerFrame({ sizeIndex, hint, processing }: ScannerFrameProps) {
  const size = FRAME_SIZES[sizeIndex];
  const [laser] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(laser, { toValue: 1, duration: 2200, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
        Animated.timing(laser, { toValue: 0, duration: 2200, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [laser]);

  const translateY = laser.interpolate({ inputRange: [0, 1], outputRange: [8, size - 12] });

  return (
    <View style={{ alignItems: 'center' }} pointerEvents="none">
      <View style={{ width: size, height: size }}>
        <Corner position="tl" />
        <Corner position="tr" />
        <Corner position="bl" />
        <Corner position="br" />
        <View
          style={{
            flex: 1,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: 'rgba(239,68,68,0.3)',
            backgroundColor: 'rgba(239,68,68,0.04)',
            overflow: 'hidden',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <View style={{ position: 'absolute', opacity: 0.4, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ width: 32, height: 1, backgroundColor: colors.red400 }} />
            <View style={{ height: 32, width: 1, backgroundColor: colors.red400, position: 'absolute' }} />
          </View>
          <View style={{ position: 'absolute', opacity: 0.15 }}>
            <Icon name="qr-code-2" size={size * 0.38} color="#FFFFFF" />
          </View>
          {processing ? <ActivityIndicator size="large" color="#FFFFFF" /> : null}
          <Animated.View
            style={{
              position: 'absolute',
              left: 12,
              right: 12,
              top: 0,
              height: 2.5,
              borderRadius: 2,
              backgroundColor: colors.turnoRed,
              shadowColor: colors.turnoRed,
              shadowOpacity: 0.9,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 0 },
              transform: [{ translateY }],
            }}
          />
        </View>
      </View>

      <View
        style={{
          marginTop: 18,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingHorizontal: 14,
          paddingVertical: 6,
          borderRadius: 999,
          backgroundColor: 'rgba(15,23,42,0.9)',
          borderWidth: 1,
          borderColor: 'rgba(239,68,68,0.4)',
        }}
      >
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.turnoRed }} />
        <AppText variant="labelSm" color="#FFFFFF" style={{ letterSpacing: 1.6 }}>
          {hint}
        </AppText>
      </View>
    </View>
  );
}

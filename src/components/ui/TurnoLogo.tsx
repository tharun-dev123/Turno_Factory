import { Image } from 'expo-image';
import type { StyleProp, ImageStyle } from 'react-native';

const logoSource = require('../../../assets/images/brand/Turno_Logo.png');

/** Aspect ratio of the cropped logo asset (width / height). */
const LOGO_RATIO = 2170 / 725;

export interface TurnoLogoProps {
  /** Rendered height in dp; width follows the aspect ratio. */
  height?: number;
  style?: StyleProp<ImageStyle>;
}

export function TurnoLogo({ height = 36, style }: TurnoLogoProps) {
  return (
    <Image
      source={logoSource}
      contentFit="contain"
      accessibilityLabel="Turno logo"
      style={[{ height, width: height * LOGO_RATIO }, style]}
    />
  );
}

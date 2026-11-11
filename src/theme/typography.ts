import type { TextStyle } from 'react-native';

/**
 * Turno typography tokens.
 * Families from the Stitch HTML: Hanken Grotesk (headlines, labels), Manrope (body),
 * JetBrains Mono (barcodes / data values).
 * Font keys must match the names registered in `fonts.ts`.
 */
export const fontFamily = {
  headlineMedium: 'HankenGrotesk_500Medium',
  headlineSemiBold: 'HankenGrotesk_600SemiBold',
  headlineBold: 'HankenGrotesk_700Bold',
  headlineExtraBold: 'HankenGrotesk_800ExtraBold',
  bodyRegular: 'Manrope_400Regular',
  bodyMedium: 'Manrope_500Medium',
  bodySemiBold: 'Manrope_600SemiBold',
  bodyBold: 'Manrope_700Bold',
  monoMedium: 'JetBrainsMono_500Medium',
  monoBold: 'JetBrainsMono_700Bold',
} as const;

export type TextVariant =
  | 'displayLg'
  | 'headlineLg'
  | 'headlineMd'
  | 'headlineSm'
  | 'title'
  | 'bodyLg'
  | 'bodyMd'
  | 'bodySm'
  | 'labelLg'
  | 'labelMd'
  | 'labelSm'
  | 'overline'
  | 'monoLg'
  | 'monoMd'
  | 'monoSm';

export const textVariants: Record<TextVariant, TextStyle> = {
  displayLg: { fontFamily: fontFamily.headlineExtraBold, fontSize: 36, lineHeight: 44, letterSpacing: -0.7 },
  headlineLg: { fontFamily: fontFamily.headlineExtraBold, fontSize: 28, lineHeight: 36, letterSpacing: -0.3 },
  headlineMd: { fontFamily: fontFamily.headlineBold, fontSize: 20, lineHeight: 28 },
  headlineSm: { fontFamily: fontFamily.headlineBold, fontSize: 16, lineHeight: 24 },
  title: { fontFamily: fontFamily.headlineBold, fontSize: 17, lineHeight: 22 },
  bodyLg: { fontFamily: fontFamily.bodyRegular, fontSize: 16, lineHeight: 24 },
  bodyMd: { fontFamily: fontFamily.bodyMedium, fontSize: 14, lineHeight: 20 },
  bodySm: { fontFamily: fontFamily.bodyMedium, fontSize: 12, lineHeight: 16 },
  labelLg: { fontFamily: fontFamily.headlineBold, fontSize: 14, lineHeight: 20, letterSpacing: 0.3 },
  labelMd: { fontFamily: fontFamily.headlineSemiBold, fontSize: 12, lineHeight: 16, letterSpacing: 0.5 },
  labelSm: { fontFamily: fontFamily.headlineBold, fontSize: 10, lineHeight: 14, letterSpacing: 0.6 },
  overline: {
    fontFamily: fontFamily.headlineBold,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  monoLg: { fontFamily: fontFamily.monoBold, fontSize: 14, lineHeight: 20 },
  monoMd: { fontFamily: fontFamily.monoBold, fontSize: 13, lineHeight: 18 },
  monoSm: { fontFamily: fontFamily.monoMedium, fontSize: 12, lineHeight: 16 },
};

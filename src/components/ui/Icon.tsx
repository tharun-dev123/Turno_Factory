import { MaterialIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

import { colors } from '@/theme';

export type IconName = ComponentProps<typeof MaterialIcons>['name'];

export interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
}

/** Material icon (the Stitch design uses Material Symbols). */
export function Icon({ name, size = 20, color = colors.slate700 }: IconProps) {
  return <MaterialIcons name={name} size={size} color={color} />;
}

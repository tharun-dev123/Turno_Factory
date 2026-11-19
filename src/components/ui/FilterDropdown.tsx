import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { colors, radius } from '@/theme';

import { AppText } from './AppText';
import { Icon } from './Icon';

export interface FilterOption<T extends string> {
  /** `null` is the "show everything" choice */
  value: T | null;
  label: string;
}

export interface FilterDropdownProps<T extends string> {
  label: string;
  options: readonly FilterOption<T>[];
  value: T | null;
  onChange: (value: T | null) => void;
  testID?: string;
}

/**
 * Dropdown for choosing one filter value. The options open in place, under the field, so it works inside a bottom
 * sheet (a pop-up inside a pop-up is unreliable on Android). The first option (value `null`) means "no filter".
 */
export function FilterDropdown<T extends string>({ label, options, value, onChange, testID }: FilterDropdownProps<T>) {
  const [expanded, setExpanded] = useState(false);
  const selected = options.find((option) => option.value === value) ?? options[0];

  return (
    <View style={{ gap: 8 }}>
      <AppText variant="labelLg" style={{ fontSize: 15 }}>
        {label}
      </AppText>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${label}: ${selected.label}`}
        onPress={() => setExpanded((open) => !open)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: 50,
          paddingHorizontal: 14,
          borderRadius: radius.xl,
          borderWidth: expanded ? 1.5 : 1,
          borderColor: expanded ? colors.turnoOrange : colors.border,
          backgroundColor: colors.surface,
        }}
      >
        <AppText variant="bodyMd" numberOfLines={1} style={{ flex: 1, fontFamily: 'Manrope_600SemiBold' }}>
          {selected.label}
        </AppText>
        <Icon name={expanded ? 'keyboard-arrow-up' : 'keyboard-arrow-down'} size={22} color={colors.slate500} />
      </Pressable>

      {expanded ? (
        <View style={{ borderRadius: radius.xl, borderWidth: 1, borderColor: colors.slate200, overflow: 'hidden', backgroundColor: colors.surface }}>
          {options.map((option, index) => {
            const isSelected = option.value === value;
            return (
              <Pressable
                key={option.value ?? '__all__'}
                testID={testID ? `${testID}-${option.value ?? 'all'}` : undefined}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                onPress={() => {
                  onChange(option.value);
                  setExpanded(false);
                }}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  minHeight: 46,
                  paddingHorizontal: 14,
                  borderTopWidth: index === 0 ? 0 : 1,
                  borderTopColor: colors.slate100,
                  backgroundColor: isSelected ? colors.orange50 : pressed ? colors.slate50 : colors.surface,
                })}
              >
                <AppText variant="bodyMd" style={{ flex: 1, fontFamily: isSelected ? 'Manrope_700Bold' : 'Manrope_500Medium' }}>
                  {option.label}
                </AppText>
                {isSelected ? <Icon name="check" size={20} color={colors.turnoOrange} /> : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

import { useState } from 'react';
import { FlatList, Modal, Pressable, View } from 'react-native';

import { colors, radius, shadows } from '@/theme';

import { AppText } from './AppText';
import { Icon } from './Icon';

export interface SelectFieldProps {
  label: string;
  value: string | null;
  options: readonly string[];
  placeholder?: string;
  error?: string | null;
  onChange: (value: string | null) => void;
}

/** Dropdown-style picker that opens a bottom list. A "Not set" option clears the value. */
export function SelectField({ label, value, options, placeholder = 'Select...', error, onChange }: SelectFieldProps) {
  const [open, setOpen] = useState(false);
  // Keep a stored value selectable even if it is not in the configured option list.
  const list = value && !options.includes(value) ? [value, ...options] : options;

  return (
    <View style={{ gap: 6 }}>
      <AppText variant="labelLg" style={{ fontSize: 14 }}>
        {label}
      </AppText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value ?? 'not set'}`}
        onPress={() => setOpen(true)}
        style={{
          height: 48,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 14,
          borderRadius: radius.xl,
          borderWidth: 1,
          borderColor: error ? colors.red600 : colors.border,
          backgroundColor: colors.surface,
        }}
      >
        <AppText variant="bodyMd" color={value ? colors.text : colors.slate400} numberOfLines={1} style={{ flex: 1, fontFamily: 'Manrope_600SemiBold' }}>
          {value ?? placeholder}
        </AppText>
        <Icon name="keyboard-arrow-down" size={22} color={colors.slate500} />
      </Pressable>
      {error ? (
        <AppText variant="bodySm" color={colors.red600}>
          {error}
        </AppText>
      ) : null}

      <Modal visible={open} transparent animationType="slide" statusBarTranslucent onRequestClose={() => setOpen(false)}>
        <Pressable accessibilityLabel="Close" onPress={() => setOpen(false)} style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' }}>
          <Pressable
            accessible={false}
            style={[{ backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 12, paddingBottom: 24, maxHeight: '70%' }, shadows.dialog]}
          >
            <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.slate200, marginBottom: 8 }} />
            <AppText variant="headlineSm" style={{ paddingHorizontal: 20, paddingBottom: 8 }}>
              {label}
            </AppText>
            <FlatList
              data={[null, ...list]}
              keyExtractor={(item) => item ?? '__none__'}
              renderItem={({ item }) => {
                const selected = item === value;
                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => {
                      onChange(item);
                      setOpen(false);
                    }}
                    style={({ pressed }) => ({
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      paddingHorizontal: 20,
                      paddingVertical: 14,
                      backgroundColor: pressed ? colors.slate50 : colors.surface,
                    })}
                  >
                    <AppText variant="bodyMd" color={item === null ? colors.textMuted : colors.text} style={{ fontFamily: selected ? 'Manrope_700Bold' : 'Manrope_500Medium', flex: 1 }}>
                      {item ?? 'Not set'}
                    </AppText>
                    {selected ? <Icon name="check" size={20} color={colors.turnoOrange} /> : null}
                  </Pressable>
                );
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

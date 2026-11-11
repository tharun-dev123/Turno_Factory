import { Pressable, TextInput, View } from 'react-native';

import { colors, fontFamily, radius, shadows } from '@/theme';

import { Icon } from './Icon';

export interface SearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
}

export function SearchBar({ value, onChangeText, placeholder = 'Search by Cell ID or Serial Number...' }: SearchBarProps) {
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          height: 52,
          paddingHorizontal: 14,
          gap: 10,
          backgroundColor: colors.surface,
          borderRadius: radius.xl,
          borderWidth: 1,
          borderColor: colors.slate200,
        },
        shadows.card,
      ]}
    >
      <Icon name="search" size={20} color={colors.slate400} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.slate400}
        accessibilityLabel="Search cells"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        style={{ flex: 1, height: '100%', fontSize: 14, color: colors.slate800, fontFamily: fontFamily.bodyMedium, padding: 0 }}
      />
      {value.length > 0 ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={10} onPress={() => onChangeText('')}>
          <Icon name="close" size={18} color={colors.slate400} />
        </Pressable>
      ) : null}
    </View>
  );
}

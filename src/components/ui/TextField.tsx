import { useRef, useState, type ComponentRef, type ReactNode, type Ref } from 'react';
import { TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';

import { colors, fontFamily, radius } from '@/theme';

import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';
import { useEnsureFieldVisible } from './KeyboardAware';

/** Instance type of a TextInput (use with `useRef<TextInputHandle>(null)` to call `focus()`). */
export type TextInputHandle = ComponentRef<typeof TextInput>;

export interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  icon?: IconName;
  /** Content placed at the right edge (for example a visibility toggle or a unit) */
  right?: ReactNode;
  error?: string | null;
  /** Monospace value (barcodes, measurements) */
  mono?: boolean;
  /** Greyed, non-editable look */
  readOnlyLook?: boolean;
  inputRef?: Ref<TextInputHandle>;
  containerStyle?: StyleProp<ViewStyle>;
}

export function TextField({
  label,
  icon,
  right,
  error,
  mono,
  readOnlyLook,
  inputRef,
  editable = true,
  containerStyle,
  ...inputProps
}: TextFieldProps) {
  const [focused, setFocused] = useState(false);
  const wrapperRef = useRef<ComponentRef<typeof View>>(null);
  const ensureVisible = useEnsureFieldVisible();
  const borderColor = error ? colors.red600 : focused ? colors.turnoRed : colors.border;

  return (
    <View ref={wrapperRef} style={[{ gap: 6 }, containerStyle]}>
      {label ? (
        <AppText variant="labelLg" color={colors.text} style={{ fontSize: 14 }}>
          {label}
        </AppText>
      ) : null}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          height: 48,
          paddingHorizontal: 14,
          gap: 10,
          borderRadius: radius.xl,
          borderWidth: focused ? 1.5 : 1,
          borderColor,
          backgroundColor: readOnlyLook || !editable ? colors.slate50 : colors.surface,
        }}
      >
        {icon ? <Icon name={icon} size={20} color={colors.slate400} /> : null}
        <TextInput
          {...inputProps}
          ref={inputRef}
          editable={editable}
          accessibilityLabel={inputProps.accessibilityLabel ?? label}
          placeholderTextColor={colors.slate400}
          onFocus={(e) => {
            setFocused(true);
            ensureVisible?.(wrapperRef);
            inputProps.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            inputProps.onBlur?.(e);
          }}
          style={{
            flex: 1,
            height: '100%',
            color: colors.text,
            fontSize: 14,
            fontFamily: mono ? fontFamily.monoBold : fontFamily.bodyMedium,
            padding: 0,
          }}
        />
        {right}
      </View>
      {error ? (
        <AppText variant="bodySm" color={colors.red600}>
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

import { Redirect, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { TextField, type TextInputHandle } from '@/components/ui/TextField';
import { TurnoLogo } from '@/components/ui/TurnoLogo';
import { appConfig } from '@/config/appConfig';
import { useAuth } from '@/context/AuthContext';
import { getErrorMessage, ValidationError } from '@/services/errors';
import { colors, radius } from '@/theme';

/** 02 - Operator Login */
export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { status, signIn } = useAuth();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const passwordRef = useRef<TextInputHandle>(null);

  if (status === 'authenticated') return <Redirect href="/(tabs)/cells" />;

  const onSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setFormError(null);
    setFieldErrors({});
    try {
      await signIn(username, password);
      router.replace('/(tabs)/cells');
    } catch (error) {
      if (error instanceof ValidationError) {
        setFieldErrors(error.fieldErrors);
      } else {
        setFormError(getErrorMessage(error));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24, paddingHorizontal: 20 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ paddingVertical: 8 }}>
          <TurnoLogo height={44} />
        </View>

        <View style={{ flex: 1, justifyContent: 'center', paddingVertical: 24 }}>
          <View style={{ marginBottom: 24 }}>
            <AppText variant="headlineLg" accessibilityRole="header">
              Welcome
            </AppText>
            <AppText variant="bodyMd" color={colors.textMuted} style={{ marginTop: 6 }}>
              Sign in to manage factory battery cells
            </AppText>
          </View>

          <Card style={{ gap: 16, borderRadius: radius.xxl }}>
            <TextField
              label="Username"
              icon="person"
              placeholder="Enter factory username"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="username"
              textContentType="username"
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
              error={fieldErrors.username}
            />
            <TextField
              label="Password"
              inputRef={passwordRef}
              icon="lock"
              placeholder="Enter password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="current-password"
              textContentType="password"
              returnKeyType="go"
              onSubmitEditing={onSubmit}
              error={fieldErrors.password}
              right={
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                  hitSlop={10}
                  onPress={() => setShowPassword((v) => !v)}
                >
                  <Icon name={showPassword ? 'visibility-off' : 'visibility'} size={20} color={colors.slate400} />
                </Pressable>
              }
            />

            {formError ? (
              <View
                accessibilityRole="alert"
                style={{
                  flexDirection: 'row',
                  gap: 8,
                  alignItems: 'center',
                  padding: 12,
                  borderRadius: radius.lg,
                  backgroundColor: colors.red50,
                  borderWidth: 1,
                  borderColor: colors.red200,
                }}
              >
                <Icon name="error-outline" size={18} color={colors.red600} />
                <AppText variant="bodySm" color={colors.red900} style={{ flex: 1 }}>
                  {formError}
                </AppText>
              </View>
            ) : null}

            <Button label="Sign In to Terminal" iconRight="arrow-forward" onPress={onSubmit} loading={submitting} style={{ marginTop: 4 }} />

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 }}>
              <Icon name="verified-user" size={16} color={colors.slate400} />
              <AppText variant="bodySm" color={colors.textMuted}>
                Secured
              </AppText>
            </View>
          </Card>
        </View>

        <View style={{ alignItems: 'center', gap: 8 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              paddingHorizontal: 14,
              paddingVertical: 6,
              borderRadius: radius.full,
              backgroundColor: colors.successSoft,
              borderWidth: 1,
              borderColor: colors.successBorder,
            }}
          >
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success }} />
            <AppText variant="labelMd" color={colors.successText} style={{ fontWeight: '700' }}>
              {appConfig.storage.name}: {appConfig.storage.statusOnline}
            </AppText>
          </View>
          <AppText variant="bodySm" color={colors.textSubtle}>
            v{appConfig.version} • Turno Battery Ops Build {appConfig.buildNumber}
          </AppText>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

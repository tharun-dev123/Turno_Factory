import * as Clipboard from 'expo-clipboard';
import { useEffect, useState } from 'react';
import { Animated, Easing, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Pill } from '@/components/ui/Pill';
import { useToast } from '@/components/ui/Toast';
import { appConfig } from '@/config/appConfig';
import type { ScanResultView } from '@/hooks/useScanner';
import { colors, radius, shadows } from '@/theme';
import { formatSerial } from '@/utils/format';

type Tone = 'success' | 'warning' | 'danger';

const TONE = {
  success: { header: colors.emerald600, icon: 'check-circle' as IconName, iconColor: colors.emerald600, circleBg: colors.emerald50, circleBorder: colors.emerald200, bannerBg: 'rgba(236,253,245,0.7)', bannerBorder: 'rgba(167,243,208,0.6)', bannerText: colors.emerald900, bannerIcon: colors.emerald700, tag: colors.emerald600, accent: colors.turnoRed, stripe: null },
  warning: { header: colors.amber600, icon: 'warning' as IconName, iconColor: colors.amber600, circleBg: colors.amber50, circleBorder: colors.amber200, bannerBg: colors.amber50, bannerBorder: colors.amber200, bannerText: colors.amber900, bannerIcon: colors.amber800, tag: colors.amber600, accent: colors.amber600, stripe: colors.amber500 },
  danger: { header: colors.red600, icon: 'error' as IconName, iconColor: colors.red600, circleBg: colors.red50, circleBorder: colors.red200, bannerBg: colors.red50, bannerBorder: colors.red200, bannerText: colors.red900, bannerIcon: colors.red600, tag: colors.red600, accent: colors.red600, stripe: colors.red600 },
};

interface ViewModel {
  tone: Tone;
  title: string;
  subtitle: string;
  chip: { label: string; icon?: IconName; tone: 'neutral' | 'warning' | 'danger' | 'success' };
  banner: { icon: IconName; text: string; tag: string };
  leftLabel: string;
  leftValue: string;
  rightLabel: string;
  rightValue: string;
  rightCopyable: boolean;
  rightDanger?: boolean;
  actionLabel: string;
}

function toViewModel(result: ScanResultView): ViewModel {
  switch (result.kind) {
    case 'success': {
      const { cell } = result;
      return {
        tone: 'success',
        title: 'Cell Registered Successfully',
        subtitle: `Saved to ${appConfig.storage.name}`,
        chip:
          cell.validationMode === 'development'
            ? { label: 'Dev validation', icon: 'science', tone: 'warning' }
            : { label: 'Verified', icon: 'verified', tone: 'success' },
        banner: { icon: 'table-chart', text: `Record ${formatSerial(cell.serialNumber)} saved in ${appConfig.storage.name}`, tag: appConfig.storage.savedBadge },
        leftLabel: 'GEN SERIAL',
        leftValue: formatSerial(cell.serialNumber),
        rightLabel: 'SCANNED CELL ID',
        rightValue: cell.batteryBarcode,
        rightCopyable: true,
        actionLabel: 'Scan Next Cell',
      };
    }
    case 'duplicate':
      return {
        tone: 'warning',
        title: 'Cell Already Registered',
        subtitle: result.scope === 'session' ? 'Duplicate ID • Scanned earlier this session' : 'Duplicate Entry Detected • Write Skipped',
        chip: { label: 'DUPLICATE', icon: 'priority-high', tone: 'warning' },
        banner: {
          icon: 'block',
          text: result.serialNumber !== null ? `Record ${formatSerial(result.serialNumber)} Already Present • Write Skipped` : 'Already Present • Write Skipped',
          tag: 'HALT',
        },
        leftLabel: 'MATCH SERIAL',
        leftValue: result.serialNumber !== null ? formatSerial(result.serialNumber) : '—',
        rightLabel: 'SCANNED CELL ID',
        rightValue: result.barcode,
        rightCopyable: true,
        actionLabel: 'Scan Next Cell',
      };
    case 'invalid':
      return {
        tone: 'danger',
        title: 'Invalid QR Code',
        subtitle: 'Payload Verification Failed',
        chip: { label: 'REJECT', icon: 'cancel', tone: 'danger' },
        banner: { icon: 'error-outline', text: `${result.message} Clean the lens and re-align.`, tag: 'FAIL' },
        leftLabel: 'STATUS',
        leftValue: 'INVALID',
        rightLabel: 'RAW DETECTED PAYLOAD',
        rightValue: result.rawPayload.trim() === '' ? '(empty)' : result.rawPayload,
        rightCopyable: false,
        rightDanger: true,
        actionLabel: 'Retry Scan',
      };
    case 'error':
      return {
        tone: 'danger',
        title: 'Registration Failed',
        subtitle: 'Not confirmed • Scan the same cell again to retry',
        chip: { label: 'ERROR', icon: 'cancel', tone: 'danger' },
        banner: { icon: 'error-outline', text: result.message, tag: 'FAIL' },
        leftLabel: 'STATUS',
        leftValue: 'UNCONFIRMED',
        rightLabel: 'DETECTED PAYLOAD',
        rightValue: result.rawPayload,
        rightCopyable: false,
        rightDanger: true,
        actionLabel: 'Retry Scan',
      };
  }
}

export interface ScanResultCardProps {
  result: ScanResultView;
  onNext: () => void;
  /** When set (successful registration), a bar shows the scanner will continue automatically after this many ms */
  autoContinueMs?: number;
}

/** Shrinking bar that shows the scanner will continue on its own. */
function AutoContinueBar({ durationMs, color }: { durationMs: number; color: string }) {
  const [progress] = useState(() => new Animated.Value(1));
  useEffect(() => {
    progress.setValue(1);
    const anim = Animated.timing(progress, { toValue: 0, duration: durationMs, easing: Easing.linear, useNativeDriver: false });
    anim.start();
    return () => anim.stop();
  }, [durationMs, progress]);
  const width = progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  return (
    <View style={{ marginTop: 10, gap: 4 }}>
      <View style={{ height: 4, borderRadius: 2, backgroundColor: colors.slate100, overflow: 'hidden' }}>
        <Animated.View style={{ width, height: '100%', backgroundColor: color }} />
      </View>
      <AppText variant="bodySm" color={colors.textMuted} align="center">
        Continuing to the next scan automatically
      </AppText>
    </View>
  );
}

/** 08 - Scanner feedback states (Success / Duplicate / Invalid / Error). */
export function ScanResultCard({ result, onNext, autoContinueMs }: ScanResultCardProps) {
  const toast = useToast();
  const vm = toViewModel(result);
  const palette = TONE[vm.tone];

  const copy = async () => {
    try {
      await Clipboard.setStringAsync(vm.rightValue);
      toast.show('Cell ID copied');
    } catch {
      toast.show('Could not copy', 'error');
    }
  };

  return (
    <View
      accessibilityLiveRegion="assertive"
      accessibilityLabel={`${vm.title}. ${vm.subtitle}`}
      style={[
        {
          backgroundColor: colors.surface,
          borderRadius: radius.xxl,
          borderWidth: 1,
          borderColor: colors.slate100,
          overflow: 'hidden',
        },
        shadows.dialog,
      ]}
    >
      <View
        testID={`scan-result-header-${vm.tone}`}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: palette.header }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={palette.icon} size={26} color={palette.header} />
          </View>
          <View style={{ flex: 1 }}>
            <AppText variant="title" color="#FFFFFF" style={{ lineHeight: 21 }}>
              {vm.title}
            </AppText>
            <AppText variant="bodySm" color="rgba(255,255,255,0.9)" style={{ marginTop: 2 }}>
              {vm.subtitle}
            </AppText>
          </View>
        </View>
        <Pill label={vm.chip.label} icon={vm.chip.icon} tone={vm.chip.tone} size="sm" />
      </View>

      <View style={{ paddingHorizontal: 16, paddingBottom: 16, paddingTop: 2 }}>
      <View
        style={{
          marginTop: 10,
          paddingHorizontal: 12,
          paddingVertical: 7,
          borderRadius: radius.lg,
          backgroundColor: palette.bannerBg,
          borderWidth: 1,
          borderColor: palette.bannerBorder,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
          <Icon name={vm.banner.icon} size={16} color={palette.bannerIcon} />
          <AppText variant="bodySm" color={palette.bannerText} style={{ fontFamily: 'Manrope_600SemiBold', flex: 1 }}>
            {vm.banner.text}
          </AppText>
        </View>
        <View style={{ backgroundColor: palette.tag, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
          <AppText variant="labelSm" color="#FFFFFF" style={{ fontSize: 10 }}>
            {vm.banner.tag}
          </AppText>
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
        <View style={{ flex: 4, padding: 10, borderRadius: radius.xl, backgroundColor: colors.slate50, borderWidth: 1, borderColor: colors.slate200, justifyContent: 'center' }}>
          <AppText variant="labelSm" color={colors.slate500} style={{ letterSpacing: 0.8 }}>
            {vm.leftLabel}
          </AppText>
          <AppText variant="headlineMd" color={vm.rightDanger ? colors.red600 : palette.accent} style={{ fontFamily: 'HankenGrotesk_800ExtraBold', fontSize: vm.leftValue.length > 6 ? 16 : 24, marginTop: 2 }}>
            {vm.leftValue}
          </AppText>
        </View>
        <View style={{ flex: 8, padding: 10, borderRadius: radius.xl, backgroundColor: colors.slate50, borderWidth: 1, borderColor: colors.slate200, justifyContent: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <AppText variant="labelSm" color={colors.slate500} style={{ letterSpacing: 0.8 }}>
              {vm.rightLabel}
            </AppText>
            {vm.rightCopyable ? (
              <Icon name="content-copy" size={15} color={colors.slate400} />
            ) : (
              <Icon name="close" size={15} color={colors.red400} />
            )}
          </View>
          <AppText
            variant="monoLg"
            color={vm.rightDanger ? colors.red600 : colors.slate900}
            numberOfLines={1}
            ellipsizeMode="middle"
            selectable
            onPress={vm.rightCopyable ? copy : undefined}
            style={{ marginTop: 2 }}
          >
            {vm.rightValue}
          </AppText>
        </View>
      </View>

      {result.kind === 'success' && autoContinueMs && autoContinueMs > 0 ? (
        <AutoContinueBar durationMs={autoContinueMs} color={palette.header} />
      ) : null}

      <Button label={vm.actionLabel} icon="qr-code-scanner" onPress={onNext} style={{ marginTop: 12 }} testID="scan-next-button" />
      </View>
    </View>
  );
}

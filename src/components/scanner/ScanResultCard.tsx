import * as Clipboard from 'expo-clipboard';
import { View } from 'react-native';

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
  success: { icon: 'check-circle' as IconName, iconColor: colors.emerald600, circleBg: colors.emerald50, circleBorder: colors.emerald200, bannerBg: 'rgba(236,253,245,0.7)', bannerBorder: 'rgba(167,243,208,0.6)', bannerText: colors.emerald900, bannerIcon: colors.emerald700, tag: colors.emerald600, accent: colors.turnoRed, stripe: null },
  warning: { icon: 'warning' as IconName, iconColor: colors.amber600, circleBg: colors.amber50, circleBorder: colors.amber200, bannerBg: colors.amber50, bannerBorder: colors.amber200, bannerText: colors.amber900, bannerIcon: colors.amber800, tag: colors.amber600, accent: colors.amber600, stripe: colors.amber500 },
  danger: { icon: 'error' as IconName, iconColor: colors.red600, circleBg: colors.red50, circleBorder: colors.red200, bannerBg: colors.red50, bannerBorder: colors.red200, bannerText: colors.red900, bannerIcon: colors.red600, tag: colors.red600, accent: colors.red600, stripe: colors.red600 },
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
        subtitle: 'The cell was not saved',
        chip: { label: 'ERROR', icon: 'cancel', tone: 'danger' },
        banner: { icon: 'error-outline', text: result.message, tag: 'FAIL' },
        leftLabel: 'STATUS',
        leftValue: 'NOT SAVED',
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
}

/** 08 - Scanner feedback states (Success / Duplicate / Invalid / Error). */
export function ScanResultCard({ result, onNext }: ScanResultCardProps) {
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
          padding: 16,
          borderWidth: 1,
          borderColor: colors.slate100,
          borderLeftWidth: palette.stripe ? 4 : 1,
          borderLeftColor: palette.stripe ?? colors.slate100,
        },
        shadows.dialog,
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.slate100 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: palette.circleBg, borderWidth: 1, borderColor: palette.circleBorder, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={palette.icon} size={24} color={palette.iconColor} />
          </View>
          <View style={{ flex: 1 }}>
            <AppText variant="title" style={{ lineHeight: 21 }}>
              {vm.title}
            </AppText>
            <AppText variant="bodySm" color={colors.textMuted} style={{ marginTop: 2 }}>
              {vm.subtitle}
            </AppText>
          </View>
        </View>
        <Pill label={vm.chip.label} icon={vm.chip.icon} tone={vm.chip.tone} size="sm" />
      </View>

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
          <AppText variant="headlineMd" color={vm.rightDanger ? colors.red600 : palette.accent} style={{ fontFamily: 'HankenGrotesk_800ExtraBold', fontSize: vm.leftValue.length > 6 ? 15 : 19, marginTop: 2 }}>
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
            variant="monoMd"
            color={vm.rightDanger ? colors.red600 : colors.slate800}
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

      <Button label={vm.actionLabel} icon="qr-code-scanner" onPress={onNext} style={{ marginTop: 12 }} testID="scan-next-button" />
    </View>
  );
}

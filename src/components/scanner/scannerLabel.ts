import { appConfig } from '@/config/appConfig';
import type { ScannerStatus, ScanResultView } from '@/hooks/useScanner';
import { formatSerial } from '@/utils/format';

const MAX_ID_IN_LABEL = 14;

function shortId(value: string): string {
  const v = value.trim();
  return v.length <= MAX_ID_IN_LABEL ? v : `${v.slice(0, MAX_ID_IN_LABEL)}…`;
}

/** Text for the pill under the scanner frame, per state. */
export function scannerLabel(status: ScannerStatus, result: ScanResultView | null, checkingPayload: string | null): string {
  switch (status) {
    case 'ready':
      return appConfig.scanner.alignHint;
    case 'checking':
      return checkingPayload ? `CHECKING ${shortId(checkingPayload)}` : 'CHECKING…';
    case 'success':
      return result?.kind === 'success' ? `REGISTERED ${formatSerial(result.cell.serialNumber)}` : 'REGISTERED';
    case 'duplicate':
      return result?.kind === 'duplicate' && result.serialNumber !== null
        ? `ALREADY REGISTERED ${formatSerial(result.serialNumber)}`
        : 'ALREADY REGISTERED';
    case 'invalid':
      return 'INVALID QR CODE';
    case 'error':
      return 'NOT SAVED • SCAN AGAIN';
  }
}

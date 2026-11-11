import * as Haptics from 'expo-haptics';
import { useCallback, useRef, useState } from 'react';

import { appConfig } from '@/config/appConfig';
import type { CellRecord, ScanSource } from '@/models/cell';
import { registerScan, validateBarcode } from '@/services/cellService';
import { getErrorMessage } from '@/services/errors';

/** What the Scan screen shows after a code is processed (screen 08 states). */
export type ScanResultView =
  | { kind: 'success'; cell: CellRecord }
  | { kind: 'duplicate'; barcode: string; serialNumber: number | null; scope: 'session' | 'stored' }
  | { kind: 'invalid'; message: string; rawPayload: string }
  | { kind: 'error'; message: string; rawPayload: string };

function haptic(type: Haptics.NotificationFeedbackType) {
  // Haptics are best-effort; never let them break scanning.
  Haptics.notificationAsync(type).catch(() => undefined);
}

/**
 * Scan session logic: debounce, session-level duplicate detection, registration through cellService,
 * and haptic feedback. The camera component only forwards decoded payloads to `handleCode`.
 */
export function useScanner(onRegistered?: (cell: CellRecord) => void) {
  const [result, setResult] = useState<ScanResultView | null>(null);
  const [processing, setProcessing] = useState(false);
  const [sessionCount, setSessionCount] = useState(0);

  /** barcode -> serial number, for cells registered or found as duplicates in this session */
  const sessionBarcodes = useRef(new Map<string, number>());
  const busy = useRef(false);
  const last = useRef<{ payload: string; at: number } | null>(null);

  const handleCode = useCallback(
    async (rawPayload: string, source: ScanSource = 'scan') => {
      if (busy.current) return;

      // Debounce: ignore the same physical code while it is still in front of the camera.
      const now = Date.now();
      if (source === 'scan' && last.current?.payload === rawPayload && now - last.current.at < appConfig.scanner.cooldownMs) {
        return;
      }
      last.current = { payload: rawPayload, at: now };

      busy.current = true;
      setProcessing(true);
      try {
        const check = validateBarcode(rawPayload);
        if (!check.ok) {
          haptic(Haptics.NotificationFeedbackType.Error);
          setResult({ kind: 'invalid', message: check.message, rawPayload });
          return;
        }

        // Session-level duplicate: reject immediately without contacting the data source.
        const known = sessionBarcodes.current.get(check.barcode);
        if (known !== undefined) {
          haptic(Haptics.NotificationFeedbackType.Warning);
          setResult({ kind: 'duplicate', barcode: check.barcode, serialNumber: known, scope: 'session' });
          return;
        }

        const outcome = await registerScan(rawPayload, source);
        switch (outcome.status) {
          case 'registered':
            sessionBarcodes.current.set(outcome.cell.batteryBarcode, outcome.cell.serialNumber);
            setSessionCount((n) => n + 1);
            haptic(Haptics.NotificationFeedbackType.Success);
            setResult({ kind: 'success', cell: outcome.cell });
            onRegistered?.(outcome.cell);
            break;
          case 'duplicate':
            if (outcome.existing) sessionBarcodes.current.set(outcome.barcode, outcome.existing.serialNumber);
            haptic(Haptics.NotificationFeedbackType.Warning);
            setResult({
              kind: 'duplicate',
              barcode: outcome.barcode,
              serialNumber: outcome.existing?.serialNumber ?? null,
              scope: 'stored',
            });
            break;
          case 'invalid':
            haptic(Haptics.NotificationFeedbackType.Error);
            setResult({ kind: 'invalid', message: outcome.message, rawPayload });
            break;
        }
      } catch (error) {
        haptic(Haptics.NotificationFeedbackType.Error);
        // Allow the operator to rescan this code right away.
        last.current = null;
        setResult({ kind: 'error', message: getErrorMessage(error), rawPayload });
      } finally {
        busy.current = false;
        setProcessing(false);
      }
    },
    [onRegistered],
  );

  const dismissResult = useCallback(() => {
    setResult(null);
    last.current = null;
  }, []);

  return { result, processing, sessionCount, handleCode, dismissResult };
}

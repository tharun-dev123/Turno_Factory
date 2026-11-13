import { useCallback, useEffect, useRef, useState } from 'react';

import { appConfig } from '@/config/appConfig';
import type { CellRecord, ScanSource } from '@/models/cell';
import { registerScan, validateBarcode } from '@/services/cellService';
import { getErrorMessage } from '@/services/errors';

import type { ScanFeedbackKind } from './useScanFeedback';

/** What the Scan screen shows after a code is processed (screen 08 states). */
export type ScanResultView =
  | { kind: 'success'; cell: CellRecord }
  | { kind: 'duplicate'; barcode: string; serialNumber: number | null; scope: 'session' | 'stored' }
  | { kind: 'invalid'; message: string; rawPayload: string }
  | { kind: 'error'; message: string; rawPayload: string };

/**
 * Visible scanner state, used to colour the frame:
 * ready (waiting for a code) -> checking (code detected, waiting for the backend) -> one of the results.
 */
export type ScannerStatus = 'ready' | 'checking' | 'success' | 'duplicate' | 'invalid' | 'error';

export interface UseScannerOptions {
  /** Called after a cell is registered (for counters and summaries) */
  onRegistered?: (cell: CellRecord) => void;
  /** Vibration / sound hook */
  feedback?: (kind: ScanFeedbackKind) => void;
  /** Override for the auto-continue delay after a success (ms). Defaults to appConfig. 0 = wait for the operator */
  autoContinueMs?: number;
}

/**
 * Scan session logic: debounce, session-level duplicate detection, registration through cellService,
 * feedback, and pausing.
 *
 * While a code is being checked or a result is on screen the scanner is PAUSED: further camera reads are
 * ignored, so a successful result can never be overwritten by the same code being read again. After a success
 * the scanner continues on its own after `autoContinueMs`; duplicates and errors wait for the operator.
 */
export function useScanner(options: UseScannerOptions = {}) {
  const { onRegistered, feedback } = options;
  const autoContinueMs = options.autoContinueMs ?? appConfig.scanner.autoContinueMs;

  const [result, setResult] = useState<ScanResultView | null>(null);
  const [processing, setProcessing] = useState(false);
  const [checkingPayload, setCheckingPayload] = useState<string | null>(null);
  const [sessionCount, setSessionCount] = useState(0);

  /** barcode -> serial number, for cells registered or found as duplicates in this session */
  const sessionBarcodes = useRef(new Map<string, number>());
  const busy = useRef(false);
  const showingResult = useRef(false);
  const last = useRef<{ payload: string; at: number } | null>(null);
  const autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearAutoTimer = () => {
    if (autoTimer.current) {
      clearTimeout(autoTimer.current);
      autoTimer.current = null;
    }
  };

  const dismissResult = useCallback(() => {
    clearAutoTimer();
    showingResult.current = false;
    setResult(null);
    // Keep the debounce for the code that is still in front of the camera; it expires after the cooldown.
    if (last.current) last.current = { ...last.current, at: Date.now() };
  }, []);

  const show = useCallback(
    (next: ScanResultView) => {
      clearAutoTimer();
      showingResult.current = true;
      setResult(next);
      if (next.kind === 'success' && autoContinueMs > 0) {
        autoTimer.current = setTimeout(() => {
          autoTimer.current = null;
          showingResult.current = false;
          setResult(null);
          if (last.current) last.current = { ...last.current, at: Date.now() };
        }, autoContinueMs);
      }
    },
    [autoContinueMs],
  );

  useEffect(() => clearAutoTimer, []);

  const handleCode = useCallback(
    async (rawPayload: string, source: ScanSource = 'scan') => {
      if (busy.current) return;
      // Paused while a result is on screen: ignore the camera (manual entry is an explicit action).
      if (source === 'scan' && showingResult.current) return;

      // Debounce: ignore the same physical code while it is still in front of the camera.
      const now = Date.now();
      if (source === 'scan' && last.current?.payload === rawPayload && now - last.current.at < appConfig.scanner.cooldownMs) {
        return;
      }
      last.current = { payload: rawPayload, at: now };

      busy.current = true;
      setProcessing(true);
      setCheckingPayload(rawPayload);
      if (source === 'scan') feedback?.('detected');
      try {
        const check = validateBarcode(rawPayload);
        if (!check.ok) {
          feedback?.('error');
          show({ kind: 'invalid', message: check.message, rawPayload });
          return;
        }

        // Session-level duplicate: reject immediately without contacting the data source.
        const known = sessionBarcodes.current.get(check.barcode);
        if (known !== undefined) {
          feedback?.('warning');
          show({ kind: 'duplicate', barcode: check.barcode, serialNumber: known, scope: 'session' });
          return;
        }

        const outcome = await registerScan(rawPayload, source);
        switch (outcome.status) {
          case 'registered':
            sessionBarcodes.current.set(outcome.cell.batteryBarcode, outcome.cell.serialNumber);
            setSessionCount((n) => n + 1);
            feedback?.('success');
            show({ kind: 'success', cell: outcome.cell });
            onRegistered?.(outcome.cell);
            break;
          case 'duplicate':
            if (outcome.existing) sessionBarcodes.current.set(outcome.barcode, outcome.existing.serialNumber);
            feedback?.('warning');
            show({
              kind: 'duplicate',
              barcode: outcome.barcode,
              serialNumber: outcome.existing?.serialNumber ?? null,
              scope: 'stored',
            });
            break;
          case 'invalid':
            feedback?.('error');
            show({ kind: 'invalid', message: outcome.message, rawPayload });
            break;
        }
      } catch (error) {
        feedback?.('error');
        // Allow the operator to rescan this code right away.
        last.current = null;
        show({ kind: 'error', message: getErrorMessage(error), rawPayload });
      } finally {
        busy.current = false;
        setProcessing(false);
        setCheckingPayload(null);
      }
    },
    [feedback, onRegistered, show],
  );

  const status: ScannerStatus = processing ? 'checking' : result ? result.kind : 'ready';
  /** True while the camera should not deliver codes (checking, or a result on screen). */
  const paused = processing || result !== null;

  return {
    result,
    status,
    paused,
    processing,
    checkingPayload,
    sessionCount,
    autoContinueMs,
    handleCode,
    dismissResult,
  };
}

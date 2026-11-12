/**
 * Structural safety checks for a decoded QR payload (or a typed barcode).
 *
 * These are NOT barcode-format rules: no length, character set or pattern of the real label is assumed,
 * because the actual payload structure is still unconfirmed. The same limits are enforced by the server.
 */

/** Safety bound only (mirrors LIMITS.maxPayloadLength in the Apps Script backend). */
export const MAX_PAYLOAD_LENGTH = 512;

const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F]/;

export type PayloadRejectReason = 'empty' | 'control_characters' | 'too_long';

export type PayloadCheck =
  | { ok: true; barcode: string }
  | { ok: false; reason: PayloadRejectReason; message: string };

export function checkPayloadStructure(rawPayload: string): PayloadCheck {
  if (rawPayload.length > MAX_PAYLOAD_LENGTH) {
    return { ok: false, reason: 'too_long', message: 'The scanned code is too long.' };
  }
  const barcode = rawPayload.trim();
  if (barcode.length === 0) {
    return { ok: false, reason: 'empty', message: 'The code was empty or could not be read.' };
  }
  if (CONTROL_CHARACTERS.test(barcode)) {
    return { ok: false, reason: 'control_characters', message: 'The scanned code contains unreadable control characters.' };
  }
  return { ok: true, barcode };
}
